import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { AnimatePresence, motion } from "framer-motion";
import { Send, BookOpenCheck, RefreshCw, Mic, MicOff, Paperclip, X } from "lucide-react";
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
import { saveStatusSnapshot } from "@/lib/status.functions";
import { supabase } from "@/integrations/supabase/client";
import { SoundControls } from "./SoundControls";
import { sfxClick, sfxKey } from "@/lib/sasa-sfx";
import { useVoiceInput } from "@/hooks/useVoiceInput";

const GUEST_LIMIT = 7;

// Image upload size caps per tier (bytes)
const UPLOAD_LIMITS: Record<"guest" | "free" | "monthly" | "prompts", number> = {
  guest: 0,
  free: 15 * 1024 * 1024,
  monthly: 150 * 1024 * 1024,
  prompts: 150 * 1024 * 1024,
};

// Deliberate typing reveal speed (characters / second)
const TYPING_CPS = 55;

type Msg = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "sasa:chat:v1";
const STATUS_KEY = "sasa:status:v1";

const GREETING: Msg = {
  role: "assistant",
  content:
    "Hello, master~ ✨ SASA online and *delighted* to see you.\n\nI'm your Self-Analysis Systems AI — a floating status window for your real life. Talk to me about your day, your goals, what's stressing you, what's going well. The more you give me, the sharper your stats get.\n\nWant to start with a quick **daily log**, or just chat? I'll be reading between the lines either way. 😉",
};

type ChatPanelProps = {
  onPromptConsumed?: () => void;
  onRequestAuth?: (mode: "signup" | "login") => void;
  activeChatId?: string | null;
  onActiveChatChange?: (id: string | null) => void;
  onChatsMutated?: () => void;
  onStatusSaved?: () => void;
};

export function ChatPanel({
  onPromptConsumed,
  onRequestAuth,
  activeChatId = null,
  onActiveChatChange,
  onChatsMutated,
  onStatusSaved,
}: ChatPanelProps = {}) {
  const { user, profile, refreshProfile } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [status, setStatus] = useState<SasaStatus | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [attached, setAttached] = useState<{ name: string; dataUrl: string; size: number } | null>(null);
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
        setMessages(Array.isArray(parsed) && parsed.length ? parsed : [GREETING]);
      } else setMessages([GREETING]);
      const s = localStorage.getItem(STATUS_KEY);
      if (s) setStatus(JSON.parse(s));
    } catch {
      setMessages([GREETING]);
    }
  }, [user]);

  // Load messages for the active chat when logged in
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    if (!activeChatId) {
      setMessages([GREETING]);
      setStatus(null);
      return;
    }
    setLoadingHistory(true);
    getChatMessages({ data: { chatId: activeChatId } })
      .then((rows) => {
        if (cancelled) return;
        const loaded: Msg[] = rows.map((r) => ({ role: r.role, content: r.content }));
        setMessages(loaded.length ? loaded : [GREETING]);
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
    const step = Math.max(1, Math.round((TYPING_CPS * tickMs) / 1000));
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
      if ((blipCounter++ % 2) === 0) sfxKey();
    }, tickMs);
  }
  function stopTypingTimer() {
    if (typingTimerRef.current) { clearInterval(typingTimerRef.current); typingTimerRef.current = null; }
  }
  function flushTyping() {
    revealedRef.current = assistantTruthRef.current.length;
    const truth = assistantTruthRef.current;
    setMessages((prev) => {
      const copy = [...prev];
      if (copy.length && copy[copy.length - 1].role === "assistant") {
        copy[copy.length - 1] = { role: "assistant", content: truth };
      }
      return copy;
    });
    stopTypingTimer();
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

      flushTyping();
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
      stopTypingTimer();
      setStreaming(false);
    }
  }

  function submitLog(log: DailyLog) {
    setLogOpen(false);
    const formatted = `Daily log:\n- Sleep: ${log.sleepHours}h, quality ${log.sleepQuality}/10\n- Physical: ${log.physical}\n- Nutrition / hydration: ${log.nutrition}\n- Focus: ${log.mentalClarity}/10\n- Stress: ${log.stress}/10 (source: ${log.stressSource})\n- Social energy: ${log.socialEnergy}\n- Win: ${log.wins}\n- Loss: ${log.losses}\n- Mood: ${log.mood}\n\nPlease update my status window.`;
    send(formatted);
  }

  function reset() {
    if (user) {
      onActiveChatChange?.(null);
      setMessages([GREETING]);
      setStatus(null);
    } else {
      if (!confirm("Clear chat + status with SASA?")) return;
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STATUS_KEY);
      setMessages([GREETING]);
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
          <span className="hidden md:inline sasa-subheading-sm italic">
            fill out your daily log here! →
          </span>
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
            <MessageBubble key={i} role={m.role} content={m.content} />
          ))}
        </AnimatePresence>
        {streaming && messages[messages.length - 1]?.role === "user" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
            SASA is thinking…
          </div>
        )}
      </div>

      <form
        className="border-t p-3 flex gap-2"
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
            rows={2}
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
        <div className="flex flex-col gap-2">
          <Button type="button" size="sm" variant="ghost" className="h-9 w-9 p-0"
            title="Attach file" onClick={() => { sfxClick(); fileRef.current?.click(); }}>
            <Paperclip size={14} />
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

      <DailyLogForm open={logOpen} onClose={() => setLogOpen(false)} onSubmit={submitLog} />
    </div>
  );
}

function MessageBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  const segs = isUser ? [{ kind: "text" as const, text: content }] : parseSasaMessage(content);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div className={`max-w-[88%] ${isUser ? "" : "w-full"}`}>
        {!isUser && (
          <div className="text-[10px] tracking-widest text-muted-foreground mb-1">⚡ SASA</div>
        )}
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
            ) : (
              <div key={i} className="sasa-markdown text-sm leading-relaxed">
                <ReactMarkdown>{s.text}</ReactMarkdown>
              </div>
            ),
          )}
        </div>
      </div>
    </motion.div>
  );
}