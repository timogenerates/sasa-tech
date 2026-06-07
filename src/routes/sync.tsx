import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Link2, Lock } from "lucide-react";

export const Route = createFileRoute("/sync")({
  head: () => ({ meta: [{ title: "Synchronization — SASA" }] }),
  component: SyncPage,
});

const PROVIDERS = [
  { name: "Notion", desc: "Pull goal docs & journal pages so SASA can read context.", color: "from-zinc-200 to-zinc-400" },
  { name: "Google Calendar", desc: "Read schedule density to refine stress & social energy.", color: "from-blue-400 to-cyan-400" },
  { name: "GitHub", desc: "Commit cadence feeds focus & momentum stats.", color: "from-purple-400 to-pink-400" },
  { name: "Spotify", desc: "Listening mood feeds mental clarity inferences.", color: "from-green-400 to-emerald-500" },
  { name: "Strava", desc: "Workouts auto-fill the PHYSICAL stat block.", color: "from-orange-400 to-red-500" },
] as const;

function SyncPage() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen px-4 md:px-8 py-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link to="/" className="text-xs text-muted-foreground underline">← Back to SASA</Link>
        <header className="flex items-center gap-3">
          <Link2 size={22} className="text-primary" />
          <h1 className="sasa-display text-3xl tracking-widest sasa-text-glow">SYNCHRONIZATION</h1>
        </header>
        <p className="text-sm text-muted-foreground max-w-xl">
          Connect external accounts so SASA can understand you better. Each integration ships when its OAuth app is configured —
          right now they're parked. Tell the creator which to prioritize~
        </p>
        {!user && (
          <div className="sasa-panel rounded-md p-4 text-sm">
            <Link to="/" className="underline text-primary">Sign up or log in</Link> to enable connections.
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          {PROVIDERS.map((p) => (
            <div key={p.name} className="sasa-panel rounded-md p-4 flex items-center justify-between gap-3">
              <div>
                <div className={`sasa-display text-sm tracking-widest bg-gradient-to-r ${p.color} bg-clip-text text-transparent`}>{p.name}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{p.desc}</div>
              </div>
              <button disabled className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground border border-dashed rounded px-2 py-1 cursor-not-allowed">
                <Lock size={10} /> Soon
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}