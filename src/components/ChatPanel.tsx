import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { AnimatePresence, motion } from "framer-motion";
import { Send, BookOpenCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { SasaAvatar } from "./SasaAvatar";
import { StatusWindow } from "./StatusWindow";
import { DailyLogForm, type DailyLog } from "./DailyLogForm";
import { parseSasaMessage, extractLatestStatus } from "@/lib/sasa-parser";
import type { SasaStatus } from "@/lib/sasa-prompt";
import { useAuth } from "@/hooks/useAuth";
import { consumePromptCredit } from "@/lib/usage.functions";
import { getGuestUsed, incGuestUsed } from "./PromptLimitHud";
import { addMessage, createChat, getChatMessages } from "@/lib/chats.functions";
import { saveStatusSnapshot } from "@/lib/status.functions";
import { supabase } from "@/integrations/supabase/client";

const GUEST_LIMIT = 10;

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
  const { user, refreshProfile } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [status, setStatus] = useState<SasaStatus | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    // Enforce prompt limits before contacting the model
    if (!user) {
      if (getGuestUsed() >= GUEST_LIMIT) {
        toast.error("Guest limit reached (10 prompts). Sign up for 25 free per day~");
        onRequestAuth?.("signup");
        return;
      }
    } else {
      try {
        const r = await consumePromptCredit();
        if (!r.ok) {
          if (r.reason === "daily_exhausted") toast.error("Daily free limit reached. Upgrade for unlimited prompts.");
          else if (r.reason === "prompts_exhausted") toast.error("Prompt pack empty. Top up to keep chatting.");
          return;
        }
        await refreshProfile();
      } catch (e) {
        console.error(e);
        toast.error("Couldn't verify your prompt credits");
        return;
      }
    }

    const userMsg: Msg = { role: "user", content: trimmed };
    const next = [...messages, userMsg];
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
        await addMessage({ data: { chatId: chatId!, role: "user", content: trimmed } });
      } catch (e) {
        console.error(e);
        toast.error("Couldn't save your message");
      }
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in to chat with SASA");
        onRequestAuth?.("login");
        setStreaming(false);
        return;
      }
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ messages: next, latestStatus: status }),
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
      let assistant = "";
      setMessages((p) => [...p, { role: "assistant", content: "" }]);

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
              assistant += delta;
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: assistant };
                return copy;
              });
            }
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }

      const latest = extractLatestStatus(assistant);
      if (latest) setStatus(latest);

      if (user && chatId && assistant.trim()) {
        try {
          await addMessage({ data: { chatId, role: "assistant", content: assistant } });
          onChatsMutated?.();
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
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Self-Analysis Systems AI · {streaming ? "analysing…" : "online"}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setLogOpen(true)}>
            <BookOpenCheck size={14} className="mr-1" /> Log
          </Button>
          <Button size="sm" variant="ghost" onClick={reset} title="Reset session">
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
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Tell SASA anything… your day, goals, links, journal snippets…"
          rows={2}
          className="resize-none text-sm"
        />
        <Button
          type="submit"
          disabled={streaming || !input.trim()}
          style={{ background: "linear-gradient(135deg, var(--sasa-cyan), var(--sasa-violet))", color: "oklch(0.12 0.04 265)" }}
        >
          <Send size={16} />
        </Button>
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