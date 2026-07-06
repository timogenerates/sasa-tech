import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUp, ArrowDown, Minus, Lock } from "lucide-react";
import { listStatusSnapshots, type SnapshotRow } from "@/lib/status.functions";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const STATUS_COLOR: Record<string, string> = {
  OPTIMAL: "oklch(0.78 0.2 145)",
  FUNCTIONAL: "oklch(0.82 0.18 210)",
  DEGRADED: "oklch(0.78 0.18 70)",
  CRITICAL: "oklch(0.65 0.24 25)",
};

type Aggregate = {
  name: string;
  latest: number;
  previous: number | null;
  avg: number;
  best: number;
  worst: number;
  descriptor: string;
  trend: "up" | "down" | "stable";
  count: number;
};

function aggregate(rows: SnapshotRow[]): Aggregate[] {
  // rows are newest-first from the server
  const map = new Map<string, { scores: number[]; latestDescriptor: string }>();
  const ordered = [...rows].reverse(); // oldest → newest
  for (const r of ordered) {
    const cats = r.data?.categories ?? [];
    for (const c of cats) {
      if (!c?.name) continue;
      const key = c.name.toUpperCase();
      const entry = map.get(key) ?? { scores: [], latestDescriptor: "" };
      entry.scores.push(Math.max(0, Math.min(100, Number(c.score) || 0)));
      entry.latestDescriptor = c.descriptor ?? entry.latestDescriptor;
      map.set(key, entry);
    }
  }
  const out: Aggregate[] = [];
  for (const [name, e] of map.entries()) {
    const latest = e.scores[e.scores.length - 1] ?? 0;
    const previous = e.scores.length > 1 ? e.scores[e.scores.length - 2] : null;
    const avg = e.scores.reduce((a, b) => a + b, 0) / e.scores.length;
    const best = Math.max(...e.scores);
    const worst = Math.min(...e.scores);
    const delta = previous == null ? 0 : latest - previous;
    const trend: Aggregate["trend"] = delta > 1 ? "up" : delta < -1 ? "down" : "stable";
    out.push({
      name,
      latest,
      previous,
      avg,
      best,
      worst,
      descriptor: e.latestDescriptor,
      trend,
      count: e.scores.length,
    });
  }
  return out.sort((a, b) => b.latest - a.latest);
}

function TrendGlyph({ trend }: { trend: Aggregate["trend"] }) {
  if (trend === "up") return <ArrowUp size={12} className="text-emerald-300" />;
  if (trend === "down") return <ArrowDown size={12} className="text-rose-300" />;
  return <Minus size={12} className="text-muted-foreground" />;
}

type Props = { refreshKey?: number; onRequestAuth?: (mode: "signup" | "login") => void };

export function LifetimeStatsPanel({ refreshKey = 0, onRequestAuth }: Props) {
  const { user } = useAuth();
  const [rows, setRows] = useState<SnapshotRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) { setRows(null); return; }
    let cancelled = false;
    setLoading(true);
    listStatusSnapshots()
      .then((data) => { if (!cancelled) setRows(data); })
      .catch((e) => {
        console.error(e);
        if (!cancelled) toast.error("Couldn't load lifetime stats");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, refreshKey]);

  const stats = useMemo(() => (rows ? aggregate(rows) : []), [rows]);
  const latestSnapshot = rows?.[0] ?? null;
  const overall = latestSnapshot?.overall ?? null;
  const status = latestSnapshot?.status ?? null;
  const accent = STATUS_COLOR[status ?? ""] ?? "var(--sasa-cyan)";

  // Sparkline of overall trend (oldest → newest, capped 30)
  const spark = useMemo(() => {
    if (!rows) return [] as { x: number; y: number }[];
    const arr = [...rows].reverse().slice(-30);
    return arr.map((r, i) => ({ x: i, y: r.overall ?? 0 }));
  }, [rows]);
  const w = 320, h = 48;
  const sparkPath = spark.length
    ? spark.map((p, i) => {
        const x = (i / Math.max(1, spark.length - 1)) * w;
        const y = h - (p.y / 100) * (h - 6) - 3;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ")
    : "";

  if (!user) {
    return (
      <div className="sasa-panel sasa-frame-corner rounded-md h-full p-5 flex flex-col items-center justify-center text-center gap-3">
        <Lock size={22} className="opacity-70" />
        <div className="sasa-display tracking-widest text-sm sasa-text-glow">LIFETIME STATS</div>
        <p className="sasa-subheading-sm max-w-[240px]">
          Sign up to unlock your full stat archive, master~ Every category SASA has ever read on you lives here.
        </p>
        <button
          onClick={() => onRequestAuth?.("signup")}
          className="px-3 py-1.5 rounded text-xs tracking-widest border"
          style={{
            background: "linear-gradient(135deg, var(--sasa-cyan), var(--sasa-violet))",
            color: "oklch(0.12 0.04 265)",
            borderColor: "var(--sasa-cyan)",
          }}
        >
          SIGN UP
        </button>
      </div>
    );
  }

  return (
    <div className="sasa-panel sasa-frame-corner rounded-md h-full flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b" style={{ borderColor: "oklch(0.32 0.07 250 / 0.6)" }}>
        <div className="flex items-center justify-between mb-2">
          <div className="sasa-display text-xs tracking-[0.3em] sasa-text-glow">⚡ LIFETIME STATS</div>
          {status && (
            <span
              className="px-2 py-0.5 text-[9px] tracking-widest rounded border"
              style={{ color: accent, borderColor: accent }}
            >
              {status}
            </span>
          )}
        </div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[9px] tracking-widest opacity-70">OVERALL</div>
            <div className="text-3xl font-bold tabular-nums sasa-mono sasa-text-glow" style={{ color: accent }}>
              {overall ?? "—"}
              <span className="text-xs opacity-50">/100</span>
            </div>
          </div>
          {spark.length > 1 && (
            <svg viewBox={`0 0 ${w} ${h}`} className="w-[60%] h-[48px]">
              <defs>
                <linearGradient id="lspTrend" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="var(--sasa-cyan)" />
                  <stop offset="100%" stopColor="var(--sasa-violet)" />
                </linearGradient>
              </defs>
              <motion.path
                d={sparkPath}
                fill="none"
                stroke="url(#lspTrend)"
                strokeWidth={1.8}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.8 }}
              />
            </svg>
          )}
        </div>
        <div className="mt-2 text-[10px] tracking-widest opacity-60">
          {rows ? `${rows.length} snapshot${rows.length === 1 ? "" : "s"} · ${stats.length} tracked stat${stats.length === 1 ? "" : "s"}` : ""}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto sasa-scroll-neon px-3 py-3 space-y-2">
        {loading && (
          <div className="text-xs text-muted-foreground py-4 text-center">Loading stats…</div>
        )}
        {!loading && stats.length === 0 && (
          <div className="text-xs text-muted-foreground py-6 text-center px-2">
            No readings yet, master~ Chat with SASA to generate your first stat window.
          </div>
        )}
        {stats.map((s, i) => {
          const barAccent =
            s.latest >= 75 ? "oklch(0.78 0.2 145)" :
            s.latest >= 50 ? "oklch(0.82 0.18 210)" :
            s.latest >= 30 ? "oklch(0.78 0.18 70)" :
            "oklch(0.65 0.24 25)";
          return (
            <motion.div
              key={s.name}
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i * 0.02, 0.4) }}
              className="rounded border px-2.5 py-2 space-y-1"
              style={{ borderColor: "oklch(0.32 0.07 250 / 0.4)", background: "oklch(0.18 0.035 265 / 0.5)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-[10.5px] font-semibold tracking-[0.15em] sasa-text-glow truncate min-w-0"
                  title={s.name}
                >
                  {s.name}
                </span>
                <span className="flex items-center gap-1 shrink-0 sasa-mono text-[11px]">
                  <span style={{ color: barAccent }}>{s.latest}</span>
                  <span className="opacity-50">/100</span>
                  <TrendGlyph trend={s.trend} />
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${barAccent}, var(--sasa-violet))`,
                    boxShadow: `0 0 6px ${barAccent}`,
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${s.latest}%` }}
                  transition={{ duration: 0.6 }}
                />
              </div>
              <div className="flex items-center justify-between text-[9px] tracking-wider opacity-60 sasa-mono">
                <span>AVG {s.avg.toFixed(0)}</span>
                <span>HI {s.best}</span>
                <span>LO {s.worst}</span>
                <span>×{s.count}</span>
              </div>
              {s.descriptor && (
                <div className="text-[10px] italic text-muted-foreground truncate" title={s.descriptor}>
                  {s.descriptor}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}