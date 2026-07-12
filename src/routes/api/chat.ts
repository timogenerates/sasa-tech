import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SASA_SYSTEM_PROMPT } from "@/lib/sasa-prompt";
import { SASA_ALLOWED_MODEL_IDS, SASA_DEFAULT_MODEL } from "@/lib/sasa-models";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Msg = { role: "system" | "user" | "assistant"; content: string };

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(1_000_000),
      }),
    )
    .min(1)
    .max(60),
  summary: z.string().max(8000).optional(),
  model: z.string().max(120).optional(),
});

function jsonErr(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const raw = await request.json().catch(() => null);
          const parsed = bodySchema.safeParse(raw);
          if (!parsed.success) {
            return jsonErr(400, "Invalid payload");
          }
          const { messages, summary, model: requestedModel } = parsed.data;
          const model =
            requestedModel && SASA_ALLOWED_MODEL_IDS.has(requestedModel)
              ? requestedModel
              : SASA_DEFAULT_MODEL;
          const key = process.env.LOVABLE_API_KEY;
          if (!key) {
            return jsonErr(500, "AI is temporarily unavailable");
          }

          // Authenticate the caller (if any) and enforce credit consumption
          // server-side. Guests are allowed but client-side rate limited.
          let latestStatus: unknown = undefined;
          const authHeader = request.headers.get("authorization");
          if (authHeader?.startsWith("Bearer ")) {
            const token = authHeader.slice("Bearer ".length).trim();
            const SUPABASE_URL = process.env.SUPABASE_URL;
            const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
            if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
              console.error("[chat] missing supabase env");
              return jsonErr(500, "Auth is temporarily unavailable");
            }
            const userClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
              global: { headers: { Authorization: `Bearer ${token}` } },
              auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
            });
            const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
            const userId = claimsData?.claims?.sub;
            if (claimsErr || !userId) {
              return jsonErr(401, "Session expired. Sign in again.");
            }

            // Enforce credit consumption server-side (defense in depth).
            const { consumeCreditForUserId } = await import("@/lib/usage.server");
            const usage = await consumeCreditForUserId(userId);
            if (!usage.ok) {
              if (usage.reason === "daily_exhausted") {
                return jsonErr(402, "Daily free limit reached. Upgrade for unlimited prompts.");
              }
              return jsonErr(402, "Prompt pack empty. Top up to keep chatting.");
            }

            // Pull latest status snapshot server-side (never trust client-supplied text
            // that lands in the system prompt).
            const { data: snap } = await userClient
              .from("status_snapshots")
              .select("data")
              .eq("user_id", userId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (snap?.data) latestStatus = snap.data;
          }

          const sys: Msg = {
            role: "system",
            content:
              SASA_SYSTEM_PROMPT +
              (summary && summary.trim()
                ? `\n\n## Long-term conversation summary (older messages beyond the last 20)\n${summary.trim()}`
                : "") +
              (latestStatus
                ? `\n\n## Last known status snapshot (for continuity)\n${JSON.stringify(latestStatus).slice(0, 4000)}`
                : ""),
          };

          const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: [sys, ...messages],
              stream: true,
            }),
          });

          if (!upstream.ok) {
            if (upstream.status === 429) return jsonErr(429, "Rate limit reached. Try again in a moment.");
            if (upstream.status === 402) return jsonErr(402, "AI credits exhausted. Add credits in Settings.");
            const t = await upstream.text();
            console.error("AI gateway error", upstream.status, t);
            return jsonErr(500, "SASA is unreachable right now");
          }

          return new Response(upstream.body, {
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
          });
        } catch (e) {
          console.error("chat error", e);
          return jsonErr(500, "Something went wrong. Please try again.");
        }
      },
    },
  },
});