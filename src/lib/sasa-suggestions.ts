import type { SnapshotRow } from "@/lib/status.functions";

/** Generic pool used before we have any snapshots on the user. */
const GENERIC: string[] = [
  "Give me my stats for the week",
  "How do I level up my focus?",
  "Analyze my sleep pattern",
  "Log today for me",
  "Sketch my future self",
  "Roast my current routine, master style",
  "What should I fix first?",
  "Voice out a hype line for me",
  "Summarize my last few days",
  "Design a 24h reset plan",
];

function pick<T>(pool: T[], n: number): T[] {
  const copy = [...pool];
  const out: T[] = [];
  while (out.length < n && copy.length) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}

/**
 * Build 3–4 short suggestion chips. If the user has snapshots, personalise
 * a couple using their top-tracked categories; always mix in one generic.
 */
export function buildSuggestions(rows: SnapshotRow[] | null | undefined, isGuest: boolean): string[] {
  if (!rows || rows.length === 0) {
    return isGuest
      ? ["What can you do?", "Give me a demo status window", "Sketch a cyberpunk badge for me"]
      : pick(GENERIC, 3);
  }
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const c of r.data?.categories ?? []) {
      if (!c?.name) continue;
      const k = c.name.toUpperCase();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k.toLowerCase());

  const personalised: string[] = [];
  if (top[0]) personalised.push(`How can I boost my ${top[0]}?`);
  if (top[1]) personalised.push(`Trend on my ${top[1]} — what changed?`);
  if (top[2]) personalised.push(`Give me a plan for ${top[2]}`);
  const generics = pick(GENERIC, 4 - personalised.length);
  return [...personalised, ...generics].slice(0, 4);
}