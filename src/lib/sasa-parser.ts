import type { SasaStatus } from "./sasa-prompt";

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "status"; status: SasaStatus }
  | { kind: "pending"; label: string };

const FENCE = /```status\s*([\s\S]*?)```/g;

// Cheeky, gamified placeholder labels shown while SASA is streaming a
// status window and the closing fence has not arrived yet. We deliberately
// hide the raw JSON code from the user — they only see a "generating"
// pill until the block finalises.
const PENDING_LABELS = [
  "⚙  COMPILING STATUS…",
  "📡  READING SIGNAL…",
  "🧠  ANALYSING TELEMETRY…",
  "✨  RENDERING STAT WINDOW…",
  "⏳  SASA IS COOKING…",
];

function pickPendingLabel(seed: number): string {
  return PENDING_LABELS[seed % PENDING_LABELS.length];
}

export function parseSasaMessage(content: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  FENCE.lastIndex = 0;
  while ((m = FENCE.exec(content)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ kind: "text", text: content.slice(lastIndex, m.index) });
    }
    const raw = m[1].trim();
    try {
      const status = JSON.parse(raw) as SasaStatus;
      if (Array.isArray(status.categories)) {
        segments.push({ kind: "status", status });
      } else {
        segments.push({ kind: "text", text: "```\n" + raw + "\n```" });
      }
    } catch {
      segments.push({ kind: "text", text: "```\n" + raw + "\n```" });
    }
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < content.length) {
    const tail = content.slice(lastIndex);
    // If the tail contains an OPEN but not-yet-closed ```status fence,
    // hide the raw JSON stream and show a gamified pending pill until
    // the closing ``` arrives on a later tick.
    const openIdx = tail.indexOf("```status");
    if (openIdx !== -1) {
      const before = tail.slice(0, openIdx);
      if (before.trim()) segments.push({ kind: "text", text: before });
      segments.push({ kind: "pending", label: pickPendingLabel(content.length) });
    } else {
      segments.push({ kind: "text", text: tail });
    }
  }
  return segments;
}

export function extractLatestStatus(content: string): SasaStatus | null {
  const segs = parseSasaMessage(content);
  for (let i = segs.length - 1; i >= 0; i--) {
    if (segs[i].kind === "status") return (segs[i] as { kind: "status"; status: SasaStatus }).status;
  }
  return null;
}