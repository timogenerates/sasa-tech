import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { SASA_SYSTEM_PROMPT } from "@/lib/sasa-prompt";

export type ChatRow = {
  id: string;
  title: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
  summary: string;
};

export type MessageRow = {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export const listChats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChatRow[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("chats")
      .select("id,title,archived,created_at,updated_at,summary")
      .eq("user_id", userId)
      .eq("archived", false)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) { console.error("[chats] listChats", error); throw new Error("Couldn't load chats."); }
    return (data ?? []) as ChatRow[];
  });

export const createChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { title?: string }) =>
    z.object({ title: z.string().min(1).max(120).optional() }).parse(input),
  )
  .handler(async ({ context, data }): Promise<ChatRow> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("chats")
      .insert({ user_id: userId, title: data.title ?? "New chat" })
      .select("id,title,archived,created_at,updated_at,summary")
      .single();
    if (error || !row) { console.error("[chats] createChat", error); throw new Error("Couldn't create chat."); }
    return row as ChatRow;
  });

// Fetch a chat's rolling summary. Used by the client to build API context.
export const getChatSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { chatId: string }) =>
    z.object({ chatId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }): Promise<{ summary: string }> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("chats")
      .select("summary")
      .eq("id", data.chatId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) { console.error("[chats] getChatSummary", error); throw new Error("Couldn't load summary."); }
    return { summary: (row?.summary ?? "") as string };
  });

/**
 * Regenerate a chat's rolling summary whenever the persisted message
 * count crosses a new multiple of 20. Incorporates the messages that
 * are dropping out of the last-20 verbatim window into the existing
 * summary using a single LLM call.
 */
export const updateSummaryIfNeeded = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { chatId: string }) =>
    z.object({ chatId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }): Promise<{ updated: boolean }> => {
    const { supabase, userId } = context;
    // Count all messages in the chat.
    const { count, error: cErr } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("chat_id", data.chatId)
      .eq("user_id", userId);
    if (cErr) { console.error("[chats] updateSummary count", cErr); return { updated: false }; }
    const total = count ?? 0;
    // Only re-summarize when we've just crossed a 20-message boundary
    // AND there are messages older than the last-20 window.
    if (total <= 20 || total % 20 !== 0) return { updated: false };

    // Load the messages that are about to fall out of / already outside
    // the verbatim window — everything except the last 20.
    const olderLimit = total - 20;
    const { data: older, error: mErr } = await supabase
      .from("messages")
      .select("role,content")
      .eq("chat_id", data.chatId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(olderLimit);
    if (mErr || !older) { console.error("[chats] updateSummary load", mErr); return { updated: false }; }

    // Fetch prior summary
    const { data: chatRow } = await supabase
      .from("chats")
      .select("summary")
      .eq("id", data.chatId)
      .eq("user_id", userId)
      .maybeSingle();
    const priorSummary = (chatRow?.summary ?? "").toString();

    const key = process.env.LOVABLE_API_KEY;
    if (!key) { console.error("[chats] updateSummary: missing LOVABLE_API_KEY"); return { updated: false }; }

    const transcript = older
      .map((m: { role: string; content: string }) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n")
      .slice(0, 40000); // hard cap on prompt size

    const sysPrompt =
      "You are SASA's context summarizer. Produce a concise, factual, third-person summary of the ongoing conversation so future turns retain long-term memory. Preserve names, goals, decisions, stats, emotional themes, and unresolved threads. Aim for 200-400 words. Output ONLY the updated summary text, no preamble.";

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: sysPrompt },
            {
              role: "user",
              content:
                `Existing summary (may be empty):\n${priorSummary || "(none yet)"}\n\n` +
                `New older messages to fold into the summary:\n${transcript}\n\n` +
                `Return the updated summary now.`,
            },
          ],
          stream: false,
        }),
      });
      if (!res.ok) {
        console.error("[chats] summarizer gateway error", res.status);
        return { updated: false };
      }
      const json = await res.json();
      const newSummary: string = json?.choices?.[0]?.message?.content ?? "";
      if (!newSummary.trim()) return { updated: false };

      const { error: uErr } = await supabase
        .from("chats")
        .update({ summary: newSummary.slice(0, 8000), updated_at: new Date().toISOString() })
        .eq("id", data.chatId)
        .eq("user_id", userId);
      if (uErr) { console.error("[chats] updateSummary save", uErr); return { updated: false }; }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _ref = SASA_SYSTEM_PROMPT; // keep import used
      return { updated: true };
    } catch (e) {
      console.error("[chats] summarizer error", e);
      return { updated: false };
    }
  });

export const getChatMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { chatId: string }) =>
    z.object({ chatId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }): Promise<MessageRow[]> => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("messages")
      .select("id,chat_id,role,content,created_at")
      .eq("chat_id", data.chatId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) { console.error("[chats] getChatMessages", error); throw new Error("Couldn't load messages."); }
    return (rows ?? []) as MessageRow[];
  });

export const addMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { chatId: string; role: "user" | "assistant"; content: string }) =>
    z
      .object({
        chatId: z.string().uuid(),
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(50000),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<MessageRow> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("messages")
      .insert({
        chat_id: data.chatId,
        user_id: userId,
        role: data.role,
        content: data.content,
      })
      .select("id,chat_id,role,content,created_at")
      .single();
    if (error || !row) { console.error("[chats] addMessage", error); throw new Error("Couldn't save message."); }
    await supabase
      .from("chats")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.chatId)
      .eq("user_id", userId);
    return row as MessageRow;
  });

export const renameChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { chatId: string; title: string }) =>
    z
      .object({ chatId: z.string().uuid(), title: z.string().min(1).max(120) })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("chats")
      .update({ title: data.title, updated_at: new Date().toISOString() })
      .eq("id", data.chatId)
      .eq("user_id", userId);
    if (error) { console.error("[chats] renameChat", error); throw new Error("Couldn't rename chat."); }
    return { ok: true };
  });

export const archiveChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { chatId: string }) =>
    z.object({ chatId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("chats")
      .update({ archived: true, updated_at: new Date().toISOString() })
      .eq("id", data.chatId)
      .eq("user_id", userId);
    if (error) { console.error("[chats] archiveChat", error); throw new Error("Couldn't archive chat."); }
    return { ok: true };
  });