## Phase 7 — Media, Fonts, Split Layout

Everything below stays inside the free plan: no new API keys, no new secrets. Video is not free anywhere on the current stack, so SASA gets **image generation + TTS audio generation** (both already covered by `LOVABLE_API_KEY` on the AI Gateway) instead of true text-to-video. Called "media generation" in the UI so it doesn't overpromise.

### 1. Media generation (image + audio)

New server route `src/routes/api/media.ts` (public route, but gated on the same Bearer-token + credit check as `/api/chat`):
- `POST /api/media` body: `{ kind: "image" | "audio", prompt: string, voice?: string }`.
- Auth: reuse the same Supabase Bearer verification and `consumeCreditForUserId` flow from `/api/chat` so each generation costs one prompt credit.
- Image: call Gateway `/v1/images/generations` with `google/gemini-3-flash-image` (free/cheap tier), return `{ url }` or base64 data URL.
- Audio: call Gateway `/v1/audio/speech` with `openai/gpt-4o-mini-tts`, stream MP3 back with `Content-Type: audio/mpeg`.
- Errors mirror `/api/chat` (generic strings, 402 on credit exhaustion, 429 on rate limit).

Client wiring in `src/components/ChatPanel.tsx`:
- Two new buttons next to the send button: 🖼 Image / 🔊 Voice.
- Detect intent in-band too: if the user's message starts with `/image ` or `/voice `, route to `/api/media` instead of `/api/chat`.
- Render results as new assistant message parts: `<img>` for image, `<audio controls>` for TTS. Cache the blob URL for the session; no persistence.
- SASA's system prompt (`src/lib/sasa-prompt.ts`) gets a short paragraph telling her she can suggest "want me to sketch that?" / "want me to say that out loud?" — she still emits plain text; the buttons/commands actually invoke the endpoint.

Video generation is intentionally skipped and called out in the reply: no free video model is available on the Lovable AI Gateway, and `videogen` is paid credits, not free.

### 2. Futuristic fonts

Swap the current stack (Orbitron / Rajdhani / Space Grotesk / JetBrains Mono) for a sharper, less-generic pairing:
- **Display / headings**: `Chakra Petch` (angular, mecha-HUD feel) with `Michroma` reserved for the SASA wordmark only.
- **Body / UI**: `Exo 2` (geometric, humanist, reads well at small sizes).
- **Mono / stats numerals**: `Share Tech Mono` (CRT terminal vibe, tabular).
- Update `src/routes/__root.tsx` Google Fonts link and `src/styles.css` (`body`, `h1/h2/h3/.sasa-display`, `.sasa-mono`, `.sasa-subheading*`). Keep the existing `oklch` palette and glow utilities untouched.

### 3. Two-column main layout with lifetime stats

`src/routes/index.tsx` restructures the `<main>` into a responsive grid:
- `< md`: current single-column behavior preserved (chat only, StatusHub still available from the sidebar). No mobile regression.
- `≥ md`: `grid-cols-[minmax(0,1fr)_360px]` — left column is the existing `ChatPanel` (unchanged scroll behavior), right column is a new `<LifetimeStatsPanel />`.

New component `src/components/LifetimeStatsPanel.tsx`:
- Calls `listStatusSnapshots()` on mount + whenever `statusRefreshKey` changes (already threaded through `index.tsx`).
- Aggregates **every category ever recorded** across all snapshots: for each unique category name, compute latest score, average, trend arrow (latest vs previous), and best/worst.
- Header shows the latest `overall` + `status` chip + a mini sparkline (reuse the SVG code pattern from `StatusHub.tsx`).
- Body is a vertical list of stat rows, each with a thin gradient bar (`--gradient-frame`), tabular numerals, and trend glyph.
- Own scroll container: `overflow-y-auto` with `scrollbar-gutter: stable` and a custom thin cyan-glow scrollbar via a new `.sasa-scroll-neon` utility in `styles.css` — visibly different from the chat column's default scrollbar per the request.
- Empty state: same tone as StatusHub ("No readings yet, master~").
- Guests (no session) get a locked panel prompting sign-up; keeps parity with existing credit gating.

The existing StatusHub dialog stays as-is for deep-dive per-snapshot inspection; the new panel is the always-on summary.

### Technical notes

- No DB migrations. No new secrets. All models used are on the existing Lovable AI Gateway allowlist and covered by `LOVABLE_API_KEY`.
- `LifetimeStatsPanel` uses `useQuery` keyed on `["snapshots", user?.id, statusRefreshKey]` so it revalidates when new snapshots save.
- Font swap is CSS/link-only; no component API changes.
- Media endpoint reuses the exact auth pattern already in `/api/chat` to keep the security posture (credit enforcement server-side, generic error strings, no client trust).

### Files touched

- create `src/routes/api/media.ts`
- create `src/components/LifetimeStatsPanel.tsx`
- edit `src/routes/index.tsx` (grid layout, mount panel)
- edit `src/components/ChatPanel.tsx` (image/voice buttons, `/image` `/voice` commands, render media parts)
- edit `src/lib/sasa-prompt.ts` (mention media abilities)
- edit `src/routes/__root.tsx` (new Google Fonts link)
- edit `src/styles.css` (font families, `.sasa-scroll-neon` utility)

### Out of scope (called out to user)

- True text-to-video: not free on Lovable AI Gateway; skipped as requested ("free, no additional requirements").
- Persisting generated media to Storage: kept in-session only to avoid storage costs and RLS complexity.
