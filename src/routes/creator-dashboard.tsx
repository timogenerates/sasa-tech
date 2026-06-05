import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AuthDialog } from "@/components/AuthDialog";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  isCreator,
  listAllUsers,
  setUserTier,
  setUserFlag,
  type CreatorUserRow,
} from "@/lib/creator.functions";

export const Route = createFileRoute("/creator-dashboard")({
  head: () => ({
    meta: [
      { title: "Creator Dashboard — SASA" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CreatorDashboard,
});

function CreatorDashboard() {
  const { user, loading } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [users, setUsers] = useState<CreatorUserRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) { setAllowed(null); return; }
    isCreator()
      .then((r) => setAllowed(r.ok))
      .catch(() => setAllowed(false));
  }, [user, loading]);

  useEffect(() => {
    if (allowed) refresh();
  }, [allowed]);

  async function refresh() {
    try { setUsers(await listAllUsers()); }
    catch (e) { toast.error((e as Error).message); }
  }

  async function changeTier(u: CreatorUserRow, tier: CreatorUserRow["tier"]) {
    setBusyId(u.id);
    try {
      const expires =
        tier === "monthly"
          ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          : tier === "free"
            ? null
            : u.tier_expires_at;
      const prompts = tier === "prompts" ? Math.max(u.prompts_remaining, 100) : u.prompts_remaining;
      await setUserTier({ data: { userId: u.id, tier, tierExpiresAt: expires, promptsRemaining: prompts } });
      toast.success(`Tier → ${tier}`);
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusyId(null); }
  }

  async function toggleFlag(u: CreatorUserRow) {
    setBusyId(u.id);
    try {
      await setUserFlag({ data: { userId: u.id, flagged: !u.flagged } });
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusyId(null); }
  }

  const filtered = users.filter((u) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (u.email ?? "").toLowerCase().includes(q) || (u.display_name ?? "").toLowerCase().includes(q);
  });

  const expiredOrDepleted = (u: CreatorUserRow) =>
    (u.tier === "monthly" && u.tier_expires_at && new Date(u.tier_expires_at) < new Date()) ||
    (u.tier === "prompts" && u.prompts_remaining <= 0);

  return (
    <div className="min-h-screen p-6">
      <Toaster />
      <div className="max-w-6xl mx-auto">
        <header className="mb-6 flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-widest sasa-text-glow sasa-display">
              ⚡ CREATOR DASHBOARD
            </h1>
            <p className="text-xs text-muted-foreground mt-1">Restricted. Tier management & user flagging.</p>
          </div>
          {user && <div className="text-xs text-muted-foreground">{user.email}</div>}
        </header>

        {!user && (
          <div className="sasa-panel rounded-md p-8 text-center">
            <p className="text-sm mb-4">Sign in with the creator email to continue.</p>
            <Button onClick={() => setAuthOpen(true)}>Log in</Button>
            <AuthDialog open={authOpen} onOpenChange={setAuthOpen} defaultMode="login" />
          </div>
        )}

        {user && allowed === false && (
          <div className="sasa-panel rounded-md p-8 text-center">
            <p className="text-sm text-destructive">403 · Not a creator. This page is restricted.</p>
          </div>
        )}

        {user && allowed === null && (
          <div className="text-xs text-muted-foreground">Verifying creator access…</div>
        )}

        {user && allowed && (
          <>
            <div className="flex gap-2 mb-4 items-center">
              <Input
                placeholder="Search email or name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="max-w-sm"
              />
              <Button variant="outline" size="sm" onClick={refresh}>Refresh</Button>
              <div className="text-xs text-muted-foreground ml-auto">{filtered.length} / {users.length}</div>
            </div>

            <div className="sasa-panel rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-secondary/40">
                    <tr className="text-left">
                      <th className="px-3 py-2">User</th>
                      <th className="px-3 py-2">Tier</th>
                      <th className="px-3 py-2">Prompts</th>
                      <th className="px-3 py-2">Daily</th>
                      <th className="px-3 py-2">Expires</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u) => {
                      const flagAuto = expiredOrDepleted(u);
                      return (
                        <tr key={u.id} className="border-t" style={{ borderColor: "oklch(0.32 0.07 250 / 0.3)" }}>
                          <td className="px-3 py-2">
                            <div className="font-medium">{u.display_name ?? "—"}</div>
                            <div className="text-muted-foreground">{u.email}</div>
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={u.tier}
                              disabled={busyId === u.id}
                              onChange={(e) => changeTier(u, e.target.value as CreatorUserRow["tier"])}
                              className="bg-background border rounded px-2 py-1 text-xs"
                              style={{ borderColor: "oklch(0.32 0.07 250 / 0.5)" }}
                            >
                              <option value="free">free</option>
                              <option value="monthly">monthly</option>
                              <option value="prompts">prompts</option>
                            </select>
                          </td>
                          <td className="px-3 py-2 tabular-nums">{u.prompts_remaining}</td>
                          <td className="px-3 py-2 tabular-nums">{u.daily_prompts_used}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {u.tier_expires_at ? new Date(u.tier_expires_at).toLocaleDateString() : "—"}
                          </td>
                          <td className="px-3 py-2">
                            {u.flagged && <span className="text-destructive">⚑ flagged</span>}
                            {!u.flagged && flagAuto && <span className="text-yellow-500">⚠ auto</span>}
                            {!u.flagged && !flagAuto && <span className="text-muted-foreground">ok</span>}
                          </td>
                          <td className="px-3 py-2 text-right space-x-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busyId === u.id}
                              onClick={() => toggleFlag(u)}
                            >
                              {u.flagged ? "Unflag" : "Flag"}
                            </Button>
                            {u.email && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(`mailto:${u.email}?subject=SASA%20Account`, "_blank")}
                              >
                                Email
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No users.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}