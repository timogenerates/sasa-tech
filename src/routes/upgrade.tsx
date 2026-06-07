import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Crown, ExternalLink, Copy, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/upgrade")({
  head: () => ({
    meta: [
      { title: "Upgrade SASA — Patreon Tiers" },
      { name: "description", content: "Support SASA on Patreon to unlock unlimited prompts, status trends, and creator perks." },
    ],
  }),
  component: UpgradePage,
});

function UpgradePage() {
  const { user, profile } = useAuth();
  const email = user?.email ?? "";

  const copyEmail = async () => {
    if (!email) return toast.error("Log in first so I can show your account email~");
    await navigator.clipboard.writeText(email);
    toast.success("Email copied — paste it on Patreon, master~");
  };

  return (
    <div className="min-h-screen px-4 md:px-8 py-10">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-xs text-muted-foreground underline">← Back to SASA</Link>
        </div>

        <header className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <Crown size={20} />
            <span className="sasa-mono text-xs uppercase tracking-widest">Power Up</span>
          </div>
          <h1 className="sasa-display text-3xl md:text-4xl tracking-widest sasa-text-glow">UPGRADE PLAN</h1>
          <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">
            SASA is a tiny indie project, master. If you love what I do, becoming a Patreon supporter
            keeps the servers humming — and you get the good stuff. ♡
          </p>
        </header>

        {!user && (
          <div className="sasa-panel rounded-md p-4 text-sm">
            You're browsing as a guest. <Link to="/" className="underline text-primary">Sign up or log in</Link> first,
            then come back here so your Patreon email matches.
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-4">
          {[
            { name: "Free", price: "$0", perks: ["25 prompts / day", "Chat history", "Status Hub (view only)"], current: profile?.tier === "free" || !profile },
            { name: "Monthly", price: "Patreon $", perks: ["Unlimited prompts", "Cross-comparison charts", "Trend graphs", "Priority responses"], current: profile?.tier === "monthly" },
            { name: "Prompts Pack", price: "Patreon $", perks: ["Pre-paid prompt bundle", "Cross-comparison charts", "Trend graphs"], current: profile?.tier === "prompts" },
          ].map((t) => (
            <div key={t.name} className={`sasa-panel rounded-md p-4 ${t.current ? "ring-2 ring-primary" : ""}`}>
              <div className="sasa-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t.name}</div>
              <div className="sasa-display text-2xl mt-1 sasa-text-glow">{t.price}</div>
              <ul className="mt-3 space-y-1.5 text-xs">
                {t.perks.map((p) => <li key={p} className="flex gap-2"><span className="text-primary">▸</span>{p}</li>)}
              </ul>
              {t.current && <div className="mt-3 sasa-mono text-[10px] uppercase text-primary">Active</div>}
            </div>
          ))}
        </div>

        <div className="sasa-panel rounded-md p-4 space-y-3 border border-amber-500/30">
          <div className="flex gap-2 items-start text-amber-400">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div className="text-xs leading-relaxed">
              <strong>Important:</strong> Patreon upgrades are matched manually by email. You MUST use the
              same email on Patreon as your SASA account, or your tier won't sync.
            </div>
          </div>
          {user && (
            <div className="flex items-center gap-2 bg-background/50 rounded p-2">
              <code className="text-xs flex-1 truncate sasa-mono">{email}</code>
              <Button size="sm" variant="ghost" onClick={copyEmail}>
                <Copy size={14} className="mr-1" /> Copy
              </Button>
            </div>
          )}
        </div>

        <Button
          size="lg"
          className="w-full"
          style={{ background: "linear-gradient(135deg, var(--sasa-cyan), var(--sasa-violet))", color: "oklch(0.12 0.04 265)" }}
          onClick={() => window.open("https://www.patreon.com/sasaupgrades", "_blank", "noopener")}
        >
          Open Patreon · sasaupgrades <ExternalLink size={16} className="ml-2" />
        </Button>
      </div>
    </div>
  );
}