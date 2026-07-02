import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SASA_SYSTEM_PROMPT } from "@/lib/sasa-prompt";

type Msg = { role: "system" | "user" | "assistant"; content: string };

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        // Allow very long pastes — up to 200k chars per message. Server
        // still enforces the total-messages cap below.
        content: z.string().min(1).max(200000),
      }),
    )
    .min(1)
    .max(50),
  latestStatus: z.unknown().optional(),
  // Optional rolling summary of older-than-20 messages (client-supplied
  // when the user is logged in). Kept short server-side.
  summary: z.string().max(8000).optional(),
});

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const raw = await request.json().catch(() => null);
          const parsed = bodySchema.safeParse(raw);
          if (!parsed.success) {
            return new Response(JSON.stringify({ error: "Invalid payload" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }
          const { messages, latestStatus, summary } = parsed.data;
          const key = process.env.LOVABLE_API_KEY;
          if (!key) {
            return new Response(JSON.stringify({ error: "AI key not configured" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
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
              model: "google/gemini-3-pro-preview",
              messages: [sys, ...messages],
              stream: true,
            }),
          });

          if (!upstream.ok) {
            if (upstream.status === 429)
              return new Response(
                JSON.stringify({ error: "Rate limit reached. Try again in a moment." }),
                { status: 429, headers: { "Content-Type": "application/json" } },
              );
            if (upstream.status === 402)
              return new Response(
                JSON.stringify({ error: "AI credits exhausted. Add credits in Settings." }),
                { status: 402, headers: { "Content-Type": "application/json" } },
              );
            const t = await upstream.text();
            console.error("AI gateway error", upstream.status, t);
            return new Response(JSON.stringify({ error: "AI gateway error" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          return new Response(upstream.body, {
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
          });
        } catch (e) {
          console.error("chat error", e);
          return new Response(
            JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});