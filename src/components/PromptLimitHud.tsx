import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

const GUEST_KEY = "sasa:guest:prompts_used";
const GUEST_LIMIT = 10;
const FREE_LIMIT = 25;

export function getGuestUsed(): number {
  if (typeof window === "undefined") return 0;
  return parseInt(localStorage.getItem(GUEST_KEY) ?? "0", 10) || 0;
}
export function incGuestUsed() {
  const n = getGuestUsed() + 1;
  localStorage.setItem(GUEST_KEY, String(n));
  window.dispatchEvent(new CustomEvent("sasa:usage-changed"));
  return n;
}

export function PromptLimitHud({ pulse }: { pulse: number }) {
  const { user, profile } = useAuth();
  const [flash, setFlash] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const h = () => setTick((t) => t + 1);
    window.addEventListener("sasa:usage-changed", h);
    return () => window.removeEventListener("sasa:usage-changed", h);
  }, []);

  useEffect(() => {
    if (pulse === 0) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1200);
    return () => clearTimeout(t);
  }, [pulse]);

  let label = "";
  let tone: "ok" | "warn" | "out" = "ok";

  if (!user) {
    const used = getGuestUsed();
    const remaining = Math.max(0, GUEST_LIMIT - used);
    label = `${remaining}/${GUEST_LIMIT} GUEST PROMPTS`;
    tone = remaining === 0 ? "out" : remaining <= 3 ? "warn" : "ok";
  } else if (profile) {
    if (profile.tier === "monthly") {
      label = "MONTHLY · UNLIMITED";
    } else if (profile.tier === "prompts") {
      label = `${profile.prompts_remaining} PROMPTS LEFT`;
      tone = profile.prompts_remaining === 0 ? "out" : profile.prompts_remaining <= 10 ? "warn" : "ok";
    } else {
      const remaining = Math.max(0, FREE_LIMIT - (profile.daily_prompts_used ?? 0));
      label = `${remaining}/${FREE_LIMIT} TODAY`;
      tone = remaining === 0 ? "out" : remaining <= 5 ? "warn" : "ok";
    }
  } else {
    return null;
  }

  const color =
    tone === "out" ? "oklch(0.72 0.22 25)" :
    tone === "warn" ? "oklch(0.85 0.18 80)" :
    "var(--sasa-cyan)";

  return (
    <div
      className={`sasa-mono text-[10px] md:text-[11px] tracking-widest px-2.5 py-1 rounded-sm sasa-neon-chip ${flash ? "sasa-neon-flash" : ""}`}
      style={{ borderColor: color, color, textShadow: `0 0 8px ${color}` }}
    >
      {label}
    </div>
  );
}