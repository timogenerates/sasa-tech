import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { UsageResult } from "@/lib/usage.server";
export type { UsageResult } from "@/lib/usage.server";

export const consumePromptCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UsageResult> => {
    const { consumeCreditForUserId } = await import("@/lib/usage.server");
    return consumeCreditForUserId(context.userId);
  });