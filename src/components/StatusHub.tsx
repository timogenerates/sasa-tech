import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusWindow } from "./StatusWindow";
import { listStatusSnapshots, type SnapshotRow } from "@/lib/status.functions";
import { toast } from "sonner";
import { motion } from "framer-motion";

type Props = { open: boolean; onOpenChange: (v: boolean) => void; refreshKey?: number };

const STATUS_COLOR: Record<string, string> = {
  OPTIMAL: "oklch(0.78 0.2 145)",
  FUNCTIONAL: "oklch(0.82 0.18 210)",
  DEGRADED: "oklch(0.78 0.18 70)",
  CRITICAL: "oklch(0.65 0.24 25)",
};

export function StatusHub({ open, onOpenChange, refreshKey = 0 }: Props) {
  const [rows, setRows] = useState<SnapshotRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listStatusSnapshots()
      .then((data) => {
        setRows(data);
        setSelected(data[0]?.id ?? null);
      })
      .catch((e) => { console.error(e); toast.error("Couldn't load status history"); })
      .finally(() => setLoading(false));
  }, [open, refreshKey]);

  const current = useMemo(
    () => rows?.find((r) => r.id === selected) ?? rows?.[0] ?? null,
    [rows, selected],
  );

  // sparkline points: oldest → newest, capped to 30
  const trend = useMemo(() => {
    if (!rows) return [] as { x: number; y: number; status: string | null }[];
    const arr = [...rows].reverse().slice(-30);
    return arr.map((r, i) => ({ x: i, y: r.overall ?? 0, status: r.status }));
  }, [rows]);

  const max = 100;
  const w = 520; const h = 90;
  const path = trend.length
    ? trend
        .map((p, i) => {
          const x = (i / Math.max(1, trend.length - 1)) * w;
          const y = h - (p.y / max) * (h - 8) - 4;
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ")
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sasa-panel max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="sasa-display tracking-widest sasa-text-glow text-base">
            ⚡ STATUS HUB
          </DialogTitle>
        </DialogHeader>

        {loading && <div className="text-xs text-muted-foreground">Loading snapshots…</div>}
        {!loading && rows && rows.length === 0 && (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No status snapshots yet, master~ Chat with SASA to generate your first reading.
          </div>
        )}

        {rows && rows.length > 0 && (
          <div className="flex-1 overflow-y-auto pr-1 space-y-4">
            <div className="sasa-panel rounded-md p-3">
              <div className="text-[10px] tracking-widest text-muted-foreground mb-2">
                OVERALL TREND · last {trend.length} snapshot{trend.length === 1 ? "" : "s"}
              </div>
              <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[90px]">
                <defs>
                  <linearGradient id="sasaTrend" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="var(--sasa-cyan)" />
                    <stop offset="100%" stopColor="var(--sasa-violet)" />
                  </linearGradient>
                </defs>
                <motion.path
                  d={path}
                  fill="none"
                  stroke="url(#sasaTrend)"
                  strokeWidth={2}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.8 }}
                />
                {trend.map((p, i) => {
                  const x = (i / Math.max(1, trend.length - 1)) * w;
                  const y = h - (p.y / max) * (h - 8) - 4;
                  return (
                    <circle
                      key={i}
                      cx={x}
                      cy={y}
                      r={2.5}
                      fill={STATUS_COLOR[p.status ?? ""] ?? "var(--sasa-cyan)"}
                    />
                  );
                })}
              </svg>
            </div>

            <div className="grid grid-cols-[180px_1fr] gap-3">
              <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
                <div className="text-[10px] tracking-widest text-muted-foreground px-2 pb-1">
                  SNAPSHOTS
                </div>
                {rows.map((r) => {
                  const isActive = r.id === (current?.id ?? "");
                  const accent = STATUS_COLOR[r.status ?? ""] ?? "oklch(0.82 0.18 210)";
                  return (
                    <button
                      key={r.id}
                      onClick={() => setSelected(r.id)}
                      className={`w-full text-left px-2 py-2 rounded text-xs border transition-colors ${isActive ? "bg-secondary" : "hover:bg-secondary/60"}`}
                      style={{ borderColor: isActive ? accent : "oklch(0.32 0.07 250 / 0.4)" }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="tabular-nums" style={{ color: accent }}>
                          {r.overall ?? "—"}/100
                        </span>
                        <span className="text-[9px] tracking-widest opacity-70">{r.status ?? ""}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(r.created_at).toLocaleString()}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="min-w-0">
                {current && <StatusWindow data={current.data} />}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}