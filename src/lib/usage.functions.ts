import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FREE_DAILY_LIMIT = 25;
const DAY_MS = 24 * 60 * 60 * 1000;

export type UsageResult = {
  ok: boolean;
  reason?: "daily_exhausted" | "prompts_exhausted";
  tier: "free" | "monthly" | "prompts";
  dailyUsed: number;
  dailyLimit: number;
  promptsRemaining: number;
};

export const consumePromptCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UsageResult> => {
    const { userId } = context;
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("tier, prompts_remaining, daily_prompts_used, daily_reset_at")
      .eq("id", userId)
      .single();
    if (error || !profile) throw new Error("Profile not found");

    const now = new Date();
    let dailyUsed = profile.daily_prompts_used ?? 0;
    let resetAt = profile.daily_reset_at ? new Date(profile.daily_reset_at) : now;
    if (now.getTime() - resetAt.getTime() >= DAY_MS) {
      dailyUsed = 0;
      resetAt = now;
    }

    if (profile.tier === "monthly") {
      // unlimited prompts for monthly tier
      return {
        ok: true,
        tier: "monthly",
        dailyUsed: 0,
        dailyLimit: -1,
        promptsRemaining: -1,
      };
    }

    if (profile.tier === "prompts") {
      const remaining = profile.prompts_remaining ?? 0;
      if (remaining <= 0) {
        return { ok: false, reason: "prompts_exhausted", tier: "prompts", dailyUsed, dailyLimit: -1, promptsRemaining: 0 };
      }
      const { error: upErr } = await supabaseAdmin
        .from("profiles")
        .update({ prompts_remaining: remaining - 1, updated_at: now.toISOString() })
        .eq("id", userId);
      if (upErr) throw new Error(upErr.message);
      return { ok: true, tier: "prompts", dailyUsed, dailyLimit: -1, promptsRemaining: remaining - 1 };
    }

    // free
    if (dailyUsed >= FREE_DAILY_LIMIT) {
      return { ok: false, reason: "daily_exhausted", tier: "free", dailyUsed, dailyLimit: FREE_DAILY_LIMIT, promptsRemaining: 0 };
    }
    const { error: upErr } = await supabaseAdmin
      .from("profiles")
      .update({
        daily_prompts_used: dailyUsed + 1,
        daily_reset_at: resetAt.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", userId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true, tier: "free", dailyUsed: dailyUsed + 1, dailyLimit: FREE_DAILY_LIMIT, promptsRemaining: 0 };
  });