import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type ChatRow = {
  id: string;
  title: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
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
      .select("id,title,archived,created_at,updated_at")
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
      .select("id,title,archived,created_at,updated_at")
      .single();
    if (error || !row) { console.error("[chats] createChat", error); throw new Error("Couldn't create chat."); }
    return row as ChatRow;
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