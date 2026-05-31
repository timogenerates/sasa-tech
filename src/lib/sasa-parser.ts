import type { SasaStatus } from "./sasa-prompt";

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "status"; status: SasaStatus };

const FENCE = /```status\s*([\s\S]*?)```/g;

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
    segments.push({ kind: "text", text: content.slice(lastIndex) });
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