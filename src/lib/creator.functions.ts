import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

export type CreatorUserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  tier: "free" | "monthly" | "prompts";
  prompts_remaining: number;
  daily_prompts_used: number;
  tier_expires_at: string | null;
  flagged: boolean;
  flagged_at: string | null;
  created_at: string;
  updated_at: string;
};

async function assertCreator(email: string | undefined | null): Promise<void> {
  if (!email) throw new Error("Forbidden: missing email claim");
  const { data, error } = await supabaseAdmin
    .from("creator_emails")
    .select("email")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) { console.error("[creator] assertCreator", error); throw new Error("Authorization check failed."); }
  if (!data) throw new Error("Forbidden");
}

export const isCreator = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean }> => {
    const email = (context.claims as { email?: string }).email;
    try {
      await assertCreator(email);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

export const listAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CreatorUserRow[]> => {
    await assertCreator((context.claims as { email?: string }).email);
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id,email,display_name,tier,prompts_remaining,daily_prompts_used,tier_expires_at,flagged,flagged_at,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) { console.error("[creator] listAllUsers", error); throw new Error("Couldn't load users."); }
    return (data ?? []) as CreatorUserRow[];
  });

export const setUserTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    userId: string;
    tier: "free" | "monthly" | "prompts";
    tierExpiresAt?: string | null;
    promptsRemaining?: number;
  }) =>
    z
      .object({
        userId: z.string().uuid(),
        tier: z.enum(["free", "monthly", "prompts"]),
        tierExpiresAt: z.string().datetime().nullable().optional(),
        promptsRemaining: z.number().int().min(0).max(100000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertCreator((context.claims as { email?: string }).email);
    const patch: Database["public"]["Tables"]["profiles"]["Update"] = {
      tier: data.tier,
      updated_at: new Date().toISOString(),
    };
    if (data.tierExpiresAt !== undefined) patch.tier_expires_at = data.tierExpiresAt;
    if (data.promptsRemaining !== undefined) patch.prompts_remaining = data.promptsRemaining;
    const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", data.userId);
    if (error) { console.error("[creator] setUserTier", error); throw new Error("Couldn't update tier."); }
    return { ok: true };
  });

export const setUserFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; flagged: boolean }) =>
    z.object({ userId: z.string().uuid(), flagged: z.boolean() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertCreator((context.claims as { email?: string }).email);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        flagged: data.flagged,
        flagged_at: data.flagged ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.userId);
    if (error) { console.error("[creator] setUserFlag", error); throw new Error("Couldn't update flag."); }
    return { ok: true };
  });