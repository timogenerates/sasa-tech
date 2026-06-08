import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const DAY_MS = 24 * 60 * 60 * 1000;

export function FreeResetCountdown() {
  const { user, profile } = useAuth();
  const [resetAt, setResetAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!user || !profile || profile.tier !== "free") { setResetAt(null); return; }
    let cancelled = false;
    supabase
      .from("profiles")
      .select("daily_reset_at")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const base = data?.daily_reset_at ? new Date(data.daily_reset_at).getTime() : Date.now();
        setResetAt(base + DAY_MS);
      });
    return () => { cancelled = true; };
  }, [user, profile]);

  useEffect(() => {
    if (!resetAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [resetAt]);

  if (!user || !profile || profile.tier !== "free" || !resetAt) return null;

  const remain = Math.max(0, resetAt - now);
  const h = Math.floor(remain / 3_600_000);
  const m = Math.floor((remain % 3_600_000) / 60_000);
  const s = Math.floor((remain % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="w-full flex justify-center pointer-events-none">
      <div
        className="mt-2 sasa-mono text-[10px] md:text-[11px] tracking-widest px-3 py-1 rounded-sm sasa-neon-chip pointer-events-auto"
        style={{ borderColor: "var(--sasa-cyan)", color: "var(--sasa-cyan)", textShadow: "0 0 8px var(--sasa-cyan)" }}
        title="Time until your free daily prompts reset"
      >
        FREE RESET IN {pad(h)}:{pad(m)}:{pad(s)}
      </div>
    </div>
  );
}