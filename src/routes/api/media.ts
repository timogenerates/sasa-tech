import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const bodySchema = z.object({
  kind: z.enum(["image", "audio"]),
  prompt: z.string().min(1).max(4000),
  voice: z.string().max(60).optional(),
});

function jsonErr(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/media")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const raw = await request.json().catch(() => null);
          const parsed = bodySchema.safeParse(raw);
          if (!parsed.success) return jsonErr(400, "Invalid payload");
          const { kind, prompt, voice } = parsed.data;

          const key = process.env.LOVABLE_API_KEY;
          if (!key) return jsonErr(500, "AI is temporarily unavailable");

          // Auth is required — media generation costs one credit and
          // guests should sign up first (mirrors chat semantics).
          const authHeader = request.headers.get("authorization");
          if (!authHeader?.startsWith("Bearer ")) {
            return jsonErr(401, "Sign in to generate media");
          }
          const token = authHeader.slice("Bearer ".length).trim();
          const SUPABASE_URL = process.env.SUPABASE_URL;
          const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
          if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
            console.error("[media] missing supabase env");
            return jsonErr(500, "Auth is temporarily unavailable");
          }
          const userClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          });
          const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
          const userId = claimsData?.claims?.sub;
          if (claimsErr || !userId) return jsonErr(401, "Session expired. Sign in again.");

          const { consumeCreditForUserId } = await import("@/lib/usage.server");
          const usage = await consumeCreditForUserId(userId);
          if (!usage.ok) {
            if (usage.reason === "daily_exhausted") {
              return jsonErr(402, "Daily free limit reached. Upgrade for unlimited generation.");
            }
            return jsonErr(402, "Prompt pack empty. Top up to keep creating.");
          }

          if (kind === "image") {
            const upstream = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "openai/gpt-image-1-mini",
                prompt,
                size: "1024x1024",
                quality: "low",
              }),
            });
            if (!upstream.ok) {
              if (upstream.status === 429) return jsonErr(429, "Rate limit reached. Try again in a moment.");
              if (upstream.status === 402) return jsonErr(402, "AI credits exhausted.");
              const t = await upstream.text();
              console.error("[media] image gen error", upstream.status, t);
              return jsonErr(500, "SASA couldn't sketch that right now");
            }
            const json = (await upstream.json()) as {
              data?: Array<{ b64_json?: string; url?: string }>;
            };
            const first = json.data?.[0];
            const url = first?.b64_json
              ? `data:image/png;base64,${first.b64_json}`
              : first?.url;
            if (!url) return jsonErr(500, "No image returned");
            return new Response(JSON.stringify({ url }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          // audio (TTS)
          const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "openai/gpt-4o-mini-tts",
              input: prompt,
              voice: voice ?? "shimmer",
              response_format: "mp3",
            }),
          });
          if (!upstream.ok || !upstream.body) {
            if (upstream.status === 429) return jsonErr(429, "Rate limit reached. Try again in a moment.");
            if (upstream.status === 402) return jsonErr(402, "AI credits exhausted.");
            const t = await upstream.text().catch(() => "");
            console.error("[media] tts error", upstream.status, t);
            return jsonErr(500, "SASA lost her voice for a sec");
          }
          return new Response(upstream.body, {
            status: 200,
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "no-cache",
            },
          });
        } catch (e) {
          console.error("[media] error", e);
          return jsonErr(500, "Something went wrong. Please try again.");
        }
      },
    },
  },
});