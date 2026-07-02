import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const updateDisplayName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { displayName: string }) =>
    z.object({ displayName: z.string().min(1).max(60) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: data.displayName, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (error) {
      console.error("[profile] updateDisplayName", error);
      throw new Error("Couldn't update name.");
    }
    return { ok: true };
  });

export const updateAvatarUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { avatarUrl: string | null }) =>
    z.object({ avatarUrl: z.string().url().max(1024).nullable() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: data.avatarUrl, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (error) {
      console.error("[profile] updateAvatarUrl", error);
      throw new Error("Couldn't update avatar.");
    }
    return { ok: true };
  });