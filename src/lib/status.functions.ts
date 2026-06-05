import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SasaStatus } from "@/lib/sasa-prompt";
import type { Json } from "@/integrations/supabase/types";

export type SnapshotRow = {
  id: string;
  chat_id: string | null;
  data: SasaStatus;
  overall: number | null;
  status: string | null;
  created_at: string;
};

export const saveStatusSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { chatId?: string | null; data: SasaStatus }) =>
    z
      .object({
        chatId: z.string().uuid().nullable().optional(),
        data: z.any(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    const { supabase, userId } = context;
    const s = data.data as SasaStatus;
    const { data: row, error } = await supabase
      .from("status_snapshots")
      .insert({
        user_id: userId,
        chat_id: data.chatId ?? null,
        data: s as unknown as Json,
        overall: typeof s.overall === "number" ? s.overall : null,
        status: s.status ?? null,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Failed to save snapshot");
    return { id: row.id };
  });

export const listStatusSnapshots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SnapshotRow[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("status_snapshots")
      .select("id,chat_id,data,overall,status,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as SnapshotRow[];
  });