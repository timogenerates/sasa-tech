import { motion } from "framer-motion";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { SasaStatus } from "@/lib/sasa-prompt";

const STATUS_COLOR: Record<SasaStatus["status"], string> = {
  OPTIMAL: "oklch(0.78 0.2 145)",
  FUNCTIONAL: "oklch(0.82 0.18 210)",
  DEGRADED: "oklch(0.78 0.18 70)",
  CRITICAL: "oklch(0.65 0.24 25)",
};

function TrendIcon({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up") return <ArrowUp size={14} className="text-emerald-300" />;
  if (trend === "down") return <ArrowDown size={14} className="text-rose-300" />;
  return <Minus size={14} className="text-muted-foreground" />;
}

export function StatusWindow({ data }: { data: SasaStatus }) {
  const accent = STATUS_COLOR[data.status] ?? "oklch(0.82 0.18 210)";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35 }}
      className="sasa-panel sasa-frame-corner sasa-scanline relative overflow-hidden rounded-md p-4 my-3"
      style={{ borderColor: accent }}
    >
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-[10px] tracking-[0.3em] text-muted-foreground">
          ⚡ {data.title ?? "SASA STATUS WINDOW"}
        </div>
        {data.subject && (
          <div className="text-[10px] tracking-widest opacity-70">{data.subject}</div>
        )}
      </div>

      <div className="space-y-2">
        {data.categories.map((c, i) => (
          <div key={i} className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold tracking-wider sasa-text-glow">{c.name}</span>
              <span className="flex items-center gap-1 tabular-nums">
                <span style={{ color: accent }}>{c.score}</span>
                <span className="opacity-50">/100</span>
                <TrendIcon trend={c.trend} />
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${accent}, var(--sasa-violet))`,
                  boxShadow: `0 0 8px ${accent}`,
                }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(0, Math.min(100, c.score))}%` }}
                transition={{ duration: 0.8, delay: i * 0.05 }}
              />
            </div>
            <div className="text-[10px] text-muted-foreground italic">{c.descriptor}</div>
          </div>
        ))}
      </div>

      <div
        className="mt-4 pt-3 border-t flex items-center justify-between"
        style={{ borderColor: "oklch(0.32 0.07 250)" }}
      >
        <div>
          <div className="text-[10px] tracking-widest opacity-70">OVERALL ABILITIES SCORE</div>
          <div className="text-2xl font-bold tabular-nums sasa-text-glow" style={{ color: accent }}>
            {data.overall}
            <span className="text-sm opacity-50">/100</span>
          </div>
        </div>
        <div
          className="px-3 py-1.5 text-xs font-bold tracking-widest rounded border"
          style={{ color: accent, borderColor: accent }}
        >
          {data.status}
        </div>
      </div>

      {data.analysis && (
        <div className="mt-3 pt-3 border-t text-xs leading-relaxed text-foreground/90" style={{ borderColor: "oklch(0.32 0.07 250)" }}>
          <div className="text-[10px] tracking-widest opacity-70 mb-1">SASA ANALYSIS</div>
          {data.analysis}
        </div>
      )}
    </motion.div>
  );
}