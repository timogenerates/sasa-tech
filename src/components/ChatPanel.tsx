import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { AnimatePresence, motion } from "framer-motion";
import { Send, BookOpenCheck, RefreshCw, Mic, MicOff, Paperclip, X, ImagePlus, Volume2, User as UserIcon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { SasaAvatar } from "./SasaAvatar";
import { StatusWindow } from "./StatusWindow";
import { DailyLogForm, type DailyLog } from "./DailyLogForm";
import { parseSasaMessage, extractLatestStatus } from "@/lib/sasa-parser";
import type { SasaStatus } from "@/lib/sasa-prompt";
import { useAuth } from "@/hooks/useAuth";
import { getGuestUsed, incGuestUsed } from "./PromptLimitHud";
import { addMessage, createChat, getChatMessages, getChatSummary, updateSummaryIfNeeded } from "@/lib/chats.functions";
import { saveStatusSnapshot, listStatusSnapshots, type SnapshotRow } from "@/lib/status.functions";
import { supabase } from "@/integrations/supabase/client";
import { SoundControls } from "./SoundControls";
import { sfxClick, sfxType } from "@/lib/sasa-sfx";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { SASA_MODELS, SASA_DEFAULT_MODEL, getModel, suggestModelFor } from "@/lib/sasa-models";
import { parseAction, runAction } from "@/lib/sasa-actions";
import { buildSuggestions } from "@/lib/sasa-suggestions";

const GUEST_LIMIT = 7;
const TYPING_SPEED_LS_KEY = "sasa:typing-cps:v1";

// Image upload size caps per tier (bytes)
const UPLOAD_LIMITS: Record<"guest" | "free" | "monthly" | "prompts", number> = {
  guest: 0,
  free: 15 * 1024 * 1024,
  monthly: 150 * 1024 * 1024,
  prompts: 150 * 1024 * 1024,
};

// Default deliberate typing reveal speed (characters / second). Slow enough
// that the illusion is visible even when the upstream stream finishes fast.
// Runtime-adjustable via the /typing command or SASA action parser.
const DEFAULT_TYPING_CPS = 42;

const MODEL_LS_KEY = "sasa:model:v1";

type Msg = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "sasa:chat:v1";
const STATUS_KEY = "sasa:status:v1";

// Rotating short greetings — SASA opens differently every refresh so it
// never feels like a canned template. Kept to 1–2 sentences.
const GREETING_POOL: string[] = [
  "SASA online, master~ ✨ what are we reading today?",
  "Back so soon? 😌 drop me anything — I'll turn it into stats.",
  "System boot complete. Talk to me — sleep, work, drama, wins.",
  "Ping received 📡 tell me one thing that happened since I saw you.",
  "Standing by, my liege. Log, vent, or brag — I'll take notes either way.",
  "Hey you 👀 quick check-in: how's the body running today?",
  "*stretches* ready. What's the mission?",
  "SASA here — one honest sentence about your day and I'll take it from there.",
  "Signal locked 🔒 what should I read on you today?",
  "Awake and nosy as ever. Give me a thought.",
  "Hi again. Fast update or long unload — your call.",
  "Online. No fluff today — what's the headline?",
];

function pickGreeting(): Msg {
  const idx = Math.floor(Math.random() * GREETING_POOL.length);
  return { role: "assistant", content: GREETING_POOL[idx] };
}

type ChatPanelProps = {
  onPromptConsumed?: () => void;
  onRequestAuth?: (mode: "signup" | "login") => void;
  activeChatId?: string | null;
  onActiveChatChange?: (id: string | null) => void;
  onChatsMutated?: () => void;
  onStatusSaved?: () => void;
  onNavigate?: (to: string) => void;
  onOpenStatusHub?: () => void;
  onOpenSidebar?: () => void;
};

export function ChatPanel({
  onPromptConsumed,
  onRequestAuth,
  activeChatId = null,
  onActiveChatChange,
  onChatsMutated,
  onStatusSaved,
  onNavigate,
  onOpenStatusHub,
  onOpenSidebar,
}: ChatPanelProps = {}) {
  const { user, profile, refreshProfile } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [status, setStatus] = useState<SasaStatus | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [attached, setAttached] = useState<{ name: string; dataUrl: string; size: number } | null>(null);
  const [model, setModel] = useState<string>(() => {
    if (typeof window === "undefined") return SASA_DEFAULT_MODEL;
    return localStorage.getItem(MODEL_LS_KEY) ?? SASA_DEFAULT_MODEL;
  });
  const [typingCps, setTypingCps] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_TYPING_CPS;
    const s = localStorage.getItem(TYPING_SPEED_LS_KEY);
    const n = s ? parseInt(s, 10) : DEFAULT_TYPING_CPS;
    return Number.isFinite(n) && n >= 8 && n <= 800 ? n : DEFAULT_TYPING_CPS;
  });
  const typingCpsRef = useRef(typingCps);
  useEffect(() => { typingCpsRef.current = typingCps; try { localStorage.setItem(TYPING_SPEED_LS_KEY, String(typingCps)); } catch { /* ignore */ } }, [typingCps]);
  const [snapshots, setSnapshots] = useState<SnapshotRow[] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Rolling summary of the current chat (older-than-last-20 messages).
  const [chatSummary, setChatSummary] = useState<string>("");

  // Deliberate typing: assistant text accumulates in assistantTruthRef, but
  // we render only `revealed` chars of the last message. An interval advances
  // revealed at TYPING_CPS and plays a soft keypress blip per chunk.
  const assistantTruthRef = useRef<string>("");
  const revealedRef = useRef<number>(0);
  const typingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Set true while the upstream reader is still emitting deltas. The typing
  // interval keeps running until it catches up AND this ref is false.
  const streamActiveRef = useRef<boolean>(false);

  useEffect(() => {
    try { localStorage.setItem(MODEL_LS_KEY, model); } catch { /* ignore */ }
  }, [model]);

  // Passive background scan of user's status snapshots — powers personalised
  // suggestion chips. Refreshes when the user changes or activeChatId shifts.
  useEffect(() => {
    if (!user) { setSnapshots(null); return; }
    let cancelled = false;
    listStatusSnapshots()
      .then((rows) => { if (!cancelled) setSnapshots(rows); })
      .catch(() => { /* silent — chips just fall back to generic */ });
    return () => { cancelled = true; };
  }, [user, activeChatId]);

  const suggestions = useMemo(() => buildSuggestions(snapshots, !user), [snapshots, user]);

  const voice = useVoiceInput((finalText) => {
    setInput((prev) => (prev ? prev + " " : "") + finalText);
  });

  // Guests use localStorage only. Authenticated users load from DB per chat.
  useEffect(() => {
    if (user) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Msg[];
        setMessages(Array.isArray(parsed) && parsed.length ? parsed : [pickGreeting()]);
      } else setMessages([pickGreeting()]);
      const s = localStorage.getItem(STATUS_KEY);
      if (s) setStatus(JSON.parse(s));
    } catch {
      setMessages([pickGreeting()]);
    }
  }, [user]);

  // Load messages for the active chat when logged in
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    if (!activeChatId) {
      setMessages([pickGreeting()]);
      setStatus(null);
      return;
    }
    setLoadingHistory(true);
    getChatMessages({ data: { chatId: activeChatId } })
      .then((rows) => {
        if (cancelled) return;
        const loaded: Msg[] = rows.map((r) => ({ role: r.role, content: r.content }));
        setMessages(loaded.length ? loaded : [pickGreeting()]);
        const latest = [...loaded].reverse().find((m) => m.role === "assistant");
        if (latest) {
          const s = extractLatestStatus(latest.content);
          if (s) setStatus(s);
        }
      })
      .catch((e) => {
        console.error(e);
        toast.error("Couldn't load chat history");
      })
      .finally(() => !cancelled && setLoadingHistory(false));
    return () => { cancelled = true; };
  }, [user, activeChatId]);

  // Load rolling summary when switching chats
  useEffect(() => {
    if (!user || !activeChatId) { setChatSummary(""); return; }
    let cancelled = false;
    getChatSummary({ data: { chatId: activeChatId } })
      .then((r) => { if (!cancelled) setChatSummary(r.summary ?? ""); })
      .catch(() => { if (!cancelled) setChatSummary(""); });
    return () => { cancelled = true; };
  }, [user, activeChatId]);

  useEffect(() => {
    if (user) return;
    if (messages.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages, user]);
  useEffect(() => {
    if (user) return;
    if (status) localStorage.setItem(STATUS_KEY, JSON.stringify(status));
  }, [status, user]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  // Stop any leftover typing interval on unmount
  useEffect(() => () => { if (typingTimerRef.current) clearInterval(typingTimerRef.current); }, []);

  function startTypingTimer() {
    if (typingTimerRef.current) return;
    const tickMs = 30;
    const step = Math.max(1, Math.round((typingCpsRef.current * tickMs) / 1000));
    let blipCounter = 0;
    typingTimerRef.current = setInterval(() => {
      const truth = assistantTruthRef.current;
      if (revealedRef.current >= truth.length) return;
      revealedRef.current = Math.min(truth.length, revealedRef.current + step);
      const shown = truth.slice(0, revealedRef.current);
      setMessages((prev) => {
        const copy = [...prev];
        if (copy.length && copy[copy.length - 1].role === "assistant") {
          copy[copy.length - 1] = { role: "assistant", content: shown };
        }
        return copy;
      });
      if ((blipCounter++ % 2) === 0) sfxType();
    }, tickMs);
  }
  function stopTypingTimer() {
    if (typingTimerRef.current) { clearInterval(typingTimerRef.current); typingTimerRef.current = null; }
  }
  /** Wait for the typing reveal to catch up with the full streamed text. */
  function awaitRevealDone(): Promise<void> {
    return new Promise<void>((resolve) => {
      const iv = setInterval(() => {
        if (revealedRef.current >= assistantTruthRef.current.length) {
          clearInterval(iv);
          resolve();
        }
      }, 40);
    });
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const tier: keyof typeof UPLOAD_LIMITS = user ? (profile?.tier ?? "free") : "guest";
    const cap = UPLOAD_LIMITS[tier];
    if (cap === 0) {
      toast.error("Image uploads require a free account. Sign up to attach pics~");
      onRequestAuth?.("signup");
      return;
    }
    if (f.size > cap) {
      const mb = (cap / (1024 * 1024)).toFixed(0);
      toast.error(`File too large. Your tier allows up to ${mb}MB.`);
      return;
    }
    // Accept images, PDFs, docs, audio/video. Non-image files attach by name
    // only (SASA receives a textual reference rather than the raw bytes).
    const isImage = f.type.startsWith("image/");
    const reader = new FileReader();
    reader.onload = () =>
      setAttached({
        name: f.name,
        dataUrl: isImage ? String(reader.result) : "",
        size: f.size,
      });
    if (isImage) reader.readAsDataURL(f);
    else setAttached({ name: f.name, dataUrl: "", size: f.size });
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if ((!trimmed && !attached) || streaming) return;
    sfxClick();

    // Client-side action intents FIRST — takes SASA into settings, opens
    // the status hub, mutes sound, etc. without spending a prompt credit.
    if (trimmed && !attached) {
      const action = parseAction(trimmed);
      if (action) {
        const echo = runAction(action, {
          navigate: (to) => onNavigate?.(to),
          openStatusHub: () => onOpenStatusHub?.(),
          openSidebar: () => onOpenSidebar?.(),
          setTypingSpeed: (cps) => setTypingCps(cps),
        });
        setInput("");
        setMessages((prev) => [
          ...prev,
          { role: "user", content: trimmed },
          { role: "assistant", content: echo },
        ]);
        return;
      }
    }

    // Slash-command routing to /api/media (image + voice generation).
    const mediaMatch = trimmed.match(/^\/(image|voice)\s+([\s\S]+)$/i);
    if (mediaMatch) {
      const kind = mediaMatch[1].toLowerCase() === "voice" ? "audio" : "image";
      const mediaPrompt = mediaMatch[2].trim();
      if (!user) {
        toast.error("Sign up to have SASA sketch or speak for you~");
        onRequestAuth?.("signup");
        return;
      }
      await generateMedia(kind, mediaPrompt);
      return;
    }

    // Auto-open the Daily Log dialog if the user is asking to fill it in,
    // instead of routing the request through chat. SASA-side seamless UX.
    if (
      trimmed &&
      !attached &&
      /\b(open|start|fill|begin|do|launch)\b[^.?!]{0,40}\b(daily\s*)?log\b/i.test(trimmed)
    ) {
      setInput("");
      setLogOpen(true);
      toast.info("Daily log opened — fill it in, master~");
      return;
    }

    // Client-side quick check for guests. Authenticated users are enforced
    // server-side inside /api/chat (single source of truth for credits).
    if (!user) {
      if (getGuestUsed() >= GUEST_LIMIT) {
        toast.error("Guest limit reached (7 prompts). Sign up for 20 free per day~");
        onRequestAuth?.("signup");
        return;
      }
    }

    const composed = attached
      ? attached.dataUrl
        ? `![${attached.name}](${attached.dataUrl})\n\n${trimmed}`.trim()
        : `[Attached file: ${attached.name} · ${(attached.size / 1024).toFixed(0)} KB]\n\n${trimmed}`.trim()
      : trimmed;
    const userMsg: Msg = { role: "user", content: composed };
    const next = [...messages, userMsg];
    setAttached(null);
    setMessages(next);
    setInput("");
    setStreaming(true);

    if (!user) incGuestUsed();
    onPromptConsumed?.();

    // Let SASA "read" the prompt and offer a deeper model when it looks heavy.
    // Only prompts, never auto-downgrades. User confirms explicitly.
    let effectiveModel = model;
    try {
      const s = suggestModelFor(trimmed, model);
      if (s) {
        const ok = window.confirm(
          `SASA: this prompt is ${s.reason}\n\nSwitch to ${getModel(s.suggested).label} for this reply?`,
        );
        if (ok) effectiveModel = s.suggested;
      }
    } catch { /* ignore */ }

    // Ensure a chat row exists for logged-in users; persist the user message
    let chatId = activeChatId;
    if (user) {
      try {
        if (!chatId) {
          const title = trimmed.slice(0, 60);
          const created = await createChat({ data: { title } });
          chatId = created.id;
          onActiveChatChange?.(chatId);
          onChatsMutated?.();
        }
        await addMessage({ data: { chatId: chatId!, role: "user", content: composed } });
      } catch (e) {
        console.error(e);
        toast.error("Couldn't save your message");
      }
    }

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (user) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) headers.Authorization = `Bearer ${session.access_token}`;
      }
      // Send only the last 20 messages verbatim (plus the just-added
      // user message, which is already the tail of `next`). Long-term
      // memory is delivered separately via the rolling `summary`.
      const trimmed = next.slice(-20);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: trimmed,
          summary: chatSummary || undefined,
          model: effectiveModel,
        }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast.error(err.error ?? "SASA is unreachable");
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      assistantTruthRef.current = "";
      revealedRef.current = 0;
      setMessages((p) => [...p, { role: "assistant", content: "" }]);
      streamActiveRef.current = true;
      startTypingTimer();
      if (user) { refreshProfile().catch(() => {}); }

      let done = false;
      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const p = JSON.parse(json);
            const delta = p.choices?.[0]?.delta?.content as string | undefined;
            if (delta) {
              assistantTruthRef.current += delta;
            }
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }

      // Upstream is done; let the typing illusion catch up before finalising.
      streamActiveRef.current = false;
      await awaitRevealDone();
      stopTypingTimer();
      const assistant = assistantTruthRef.current;
      const latest = extractLatestStatus(assistant);
      if (latest) setStatus(latest);

      if (user && chatId && assistant.trim()) {
        try {
          await addMessage({ data: { chatId, role: "assistant", content: assistant } });
          onChatsMutated?.();
          // Refresh the rolling summary whenever a 20-message boundary
          // is crossed. The server no-ops otherwise.
          try {
            const r = await updateSummaryIfNeeded({ data: { chatId } });
            if (r.updated) {
              const s = await getChatSummary({ data: { chatId } });
              setChatSummary(s.summary ?? "");
            }
          } catch (e) {
            console.error("summary update failed", e);
          }
        } catch (e) {
          console.error("Failed to persist assistant message", e);
        }
      }

      if (user && latest) {
        try {
          await saveStatusSnapshot({ data: { chatId: chatId ?? null, data: latest } });
          onStatusSaved?.();
        } catch (e) {
          console.error("Failed to save status snapshot", e);
        }
      }
    } catch (e) {
      console.error(e);
      toast.error("Connection to SASA failed");
    } finally {
      streamActiveRef.current = false;
      stopTypingTimer();
      setStreaming(false);
    }
  }

  function submitLog(log: DailyLog) {
    setLogOpen(false);
    const formatted = `Daily log:\n- Sleep: ${log.sleepHours}h, quality ${log.sleepQuality}/10\n- Physical: ${log.physical}\n- Nutrition / hydration: ${log.nutrition}\n- Focus: ${log.mentalClarity}/10\n- Stress: ${log.stress}/10 (source: ${log.stressSource})\n- Social energy: ${log.socialEnergy}\n- Win: ${log.wins}\n- Loss: ${log.losses}\n- Mood: ${log.mood}\n\nPlease update my status window.`;
    send(formatted);
  }

  async function generateMedia(kind: "image" | "audio", mediaPrompt: string) {
    setInput("");
    const label = kind === "image" ? `🖼 Sketch this: ${mediaPrompt}` : `🔊 Say this: ${mediaPrompt}`;
    setMessages((prev) => [...prev, { role: "user", content: label }]);
    setStreaming(true);
    onPromptConsumed?.();
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const { data: { session } } = await supabase.auth.getSession();
      if (session) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch("/api/media", {
        method: "POST",
        headers,
        body: JSON.stringify({ kind, prompt: mediaPrompt }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast.error(err.error ?? "SASA couldn't generate that");
        setStreaming(false);
        return;
      }
      if (kind === "image") {
        const json = (await res.json()) as { url: string };
        const md = `![${mediaPrompt}](${json.url})\n\n*Sketched by SASA, master~*`;
        setMessages((prev) => [...prev, { role: "assistant", content: md }]);
      } else {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const md = `[[audio:${url}]]\n\n*Voiced by SASA — tap play, master~*`;
        setMessages((prev) => [...prev, { role: "assistant", content: md }]);
      }
      if (user) refreshProfile().catch(() => {});
    } catch (e) {
      console.error("media gen failed", e);
      toast.error("Media generation failed");
    } finally {
      setStreaming(false);
    }
  }

  function triggerMediaFromInput(kind: "image" | "audio") {
    const p = input.trim();
    if (!p) {
      toast.info(kind === "image" ? "Type what SASA should sketch first, master~" : "Type what SASA should say first, master~");
      return;
    }
    if (!user) {
      toast.error("Sign up to have SASA sketch or speak for you~");
      onRequestAuth?.("signup");
      return;
    }
    generateMedia(kind, p);
  }

  function reset() {
    if (user) {
      onActiveChatChange?.(null);
      setMessages([pickGreeting()]);
      setStatus(null);
    } else {
      if (!confirm("Clear chat + status with SASA?")) return;
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STATUS_KEY);
      setMessages([pickGreeting()]);
      setStatus(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "oklch(0.32 0.07 250 / 0.6)" }}>
        <div className="flex items-center gap-3">
          <SasaAvatar size={48} speaking={streaming} />
          <div>
            <div className="text-sm font-bold tracking-widest sasa-text-glow">SASA</div>
            <div className="sasa-subheading-sm">
              Self-Analysis Systems AI · {streaming ? "analysing…" : "online"}
            </div>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <SoundControls />
          <select
            value={model}
            onChange={(e) => { sfxClick(); setModel(e.target.value); }}
            title="Pick an AI model for SASA (free tier only)"
            className="text-[10px] sasa-mono tracking-widest bg-secondary border rounded px-1.5 py-1 max-w-[130px] md:max-w-none"
            style={{ borderColor: "oklch(0.32 0.07 250 / 0.6)" }}
          >
            <optgroup label="Fast · light">
              {SASA_MODELS.filter((m) => m.tier === "fast").map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </optgroup>
            <optgroup label="Balanced">
              {SASA_MODELS.filter((m) => m.tier === "balanced").map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </optgroup>
            <optgroup label="Deep · slower">
              {SASA_MODELS.filter((m) => m.tier === "deep").map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </optgroup>
          </select>
          <Button size="sm" variant="outline" onClick={() => { sfxClick(); setLogOpen(true); }}>
            <BookOpenCheck size={14} className="mr-1" /> Log
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { sfxClick(); reset(); }} title="Reset session">
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {loadingHistory && (
          <div className="text-xs text-muted-foreground">Loading chat…</div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <MessageBubble
              key={i}
              role={m.role}
              content={m.content}
              userAvatarUrl={profile?.avatar_url ?? null}
              userDisplayName={profile?.display_name ?? user?.email ?? null}
            />
          ))}
        </AnimatePresence>
        {streaming && messages[messages.length - 1]?.role === "user" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
            SASA is thinking…
          </div>
        )}
      </div>

      <div className="border-t shrink-0" style={{ borderColor: "oklch(0.32 0.07 250 / 0.6)" }}>
      {suggestions.length > 0 && !streaming && (
        <div className="px-3 pt-2 pb-1 flex gap-1.5 overflow-x-auto sasa-scroll-neon">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="sasa-chip shrink-0"
              onClick={() => { sfxClick(); setInput(s); }}
              title="Insert this into your prompt"
            >
              <Sparkles size={10} className="inline mr-1 opacity-70" />{s}
            </button>
          ))}
        </div>
      )}
      <form
        className="p-2 md:p-3 flex gap-2"
        style={{ borderColor: "oklch(0.32 0.07 250 / 0.6)" }}
        onSubmit={(e) => { e.preventDefault(); send(input); }}
      >
        <div className="flex-1 flex flex-col gap-2">
          {attached && (
            <div className="flex items-center gap-2 px-2 py-1 rounded border text-xs"
              style={{ borderColor: "oklch(0.32 0.07 250 / 0.5)" }}>
              {attached.dataUrl ? (
                <img src={attached.dataUrl} alt={attached.name}
                  className="h-10 w-10 object-cover rounded" />
              ) : (
                <div className="h-10 w-10 rounded grid place-items-center bg-secondary text-[9px] uppercase tracking-widest text-muted-foreground">
                  file
                </div>
              )}
              <span className="truncate flex-1">{attached.name} · {(attached.size / 1024).toFixed(0)} KB</span>
              <button type="button" onClick={() => setAttached(null)}
                className="text-muted-foreground hover:text-foreground">
                <X size={12} />
              </button>
            </div>
          )}
          <Textarea
            value={voice.listening ? (input + (voice.transcript ? (input ? " " : "") + voice.transcript : "")) : input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={voice.listening ? "Listening…" : "Tell SASA anything…"}
            rows={1}
            className="resize-none text-sm"
          />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.txt,.md,audio/*,video/*"
          hidden
          onChange={onPickFile}
        />
        <div className="flex flex-col gap-1.5">
          <Button type="button" size="sm" variant="ghost" className="h-9 w-9 p-0"
            title="Attach file" onClick={() => { sfxClick(); fileRef.current?.click(); }}>
            <Paperclip size={14} />
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-9 w-9 p-0"
            title="Generate image from your prompt (1 credit)"
            onClick={() => { sfxClick(); triggerMediaFromInput("image"); }}>
            <ImagePlus size={14} />
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-9 w-9 p-0"
            title="Voice out your prompt (1 credit)"
            onClick={() => { sfxClick(); triggerMediaFromInput("audio"); }}>
            <Volume2 size={14} />
          </Button>
          {voice.supported && (
            <Button type="button" size="sm" variant={voice.listening ? "default" : "ghost"}
              className="h-9 w-9 p-0"
              title={voice.listening ? "Stop dictation" : "Dictate"}
              onClick={() => { sfxClick(); voice.toggle(); }}>
              {voice.listening ? <MicOff size={14} /> : <Mic size={14} />}
            </Button>
          )}
          <Button
            type="submit"
            disabled={streaming || (!input.trim() && !attached)}
            className="h-9 w-9 p-0"
            style={{ background: "linear-gradient(135deg, var(--sasa-cyan), var(--sasa-violet))", color: "oklch(0.12 0.04 265)" }}
          >
            <Send size={14} />
          </Button>
        </div>
      </form>
      </div>

      <DailyLogForm open={logOpen} onClose={() => setLogOpen(false)} onSubmit={submitLog} />
    </div>
  );
}

function UserAvatarChip({ url, name }: { url: string | null; name: string | null }) {
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();
  return (
    <div
      className="w-9 h-9 rounded-full shrink-0 grid place-items-center overflow-hidden"
      style={{
        border: "2px solid oklch(0.68 0.22 300 / 0.7)",
        boxShadow: "0 0 10px oklch(0.68 0.22 300 / 0.35)",
        background: "oklch(0.22 0.05 265)",
      }}
      title={name ?? "You"}
    >
      {url ? (
        <img src={url} alt={name ?? "You"} className="w-full h-full object-cover" />
      ) : name ? (
        <span className="sasa-mono text-sm text-primary">{initial}</span>
      ) : (
        <UserIcon size={16} className="opacity-70" />
      )}
    </div>
  );
}

function MessageBubble({
  role,
  content,
  userAvatarUrl,
  userDisplayName,
}: {
  role: "user" | "assistant";
  content: string;
  userAvatarUrl: string | null;
  userDisplayName: string | null;
}) {
  const isUser = role === "user";
  const segs = isUser ? [{ kind: "text" as const, text: content }] : parseSasaMessage(content);
  const renderText = (text: string, key: number) => {
    const audioMatch = text.match(/\[\[audio:([^\]]+)\]\]/);
    if (audioMatch) {
      const before = text.slice(0, audioMatch.index ?? 0);
      const after = text.slice((audioMatch.index ?? 0) + audioMatch[0].length);
      return (
        <div key={key} className="sasa-markdown text-sm leading-relaxed space-y-2">
          {before.trim() && <ReactMarkdown>{before}</ReactMarkdown>}
          <audio controls src={audioMatch[1]} className="w-full" />
          {after.trim() && <ReactMarkdown>{after}</ReactMarkdown>}
        </div>
      );
    }
    return (
      <div key={key} className="sasa-markdown text-sm leading-relaxed">
        <ReactMarkdown>{text}</ReactMarkdown>
      </div>
    );
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {isUser ? (
        <UserAvatarChip url={userAvatarUrl} name={userDisplayName} />
      ) : (
        <SasaAvatar size={36} />
      )}
      <div className={`min-w-0 ${isUser ? "max-w-[82%]" : "flex-1"}`}>
        <div className="text-[10px] tracking-widest text-muted-foreground mb-1">
          {isUser ? (userDisplayName ?? "You") : "⚡ SASA"}
        </div>
        <div
          className={isUser ? "rounded-lg px-3 py-2 text-sm" : "text-sm leading-relaxed"}
          style={
            isUser
              ? { background: "oklch(0.26 0.05 265)", border: "1px solid oklch(0.32 0.07 250)" }
              : undefined
          }
        >
          {segs.map((s, i) =>
            s.kind === "status" ? (
              <StatusWindow key={i} data={s.status} />
            ) : renderText(s.text, i),
          )}
        </div>
      </div>
    </motion.div>
  );
}