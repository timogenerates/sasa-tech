import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { updateDisplayName } from "@/lib/profile.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile — SASA" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setName(profile?.display_name ?? ""); }, [profile?.display_name]);

  if (!user) {
    return (
      <Shell>
        <p className="text-sm">You're a guest right now. <Link to="/" className="underline text-primary">Sign up or log in</Link> to manage your profile.</p>
      </Shell>
    );
  }

  async function saveName() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await updateDisplayName({ data: { displayName: name.trim() } });
      await refreshProfile();
      toast.success("Name updated~");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  }

  async function changePassword() {
    if (pw.length < 8) return toast.error("8+ chars please");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast.error(error.message);
    setPw("");
    toast.success("Password changed~");
  }

  return (
    <Shell>
      <section className="sasa-panel rounded-md p-5 space-y-3">
        <div className="sasa-mono text-[10px] uppercase tracking-widest text-muted-foreground">Display Name</div>
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <Button onClick={saveName} disabled={busy}>Save</Button>
        </div>
      </section>

      <section className="sasa-panel rounded-md p-5 space-y-3">
        <div className="sasa-mono text-[10px] uppercase tracking-widest text-muted-foreground">Account</div>
        <div className="text-sm"><span className="text-muted-foreground">Email:</span> {user.email}</div>
        <div className="text-sm"><span className="text-muted-foreground">Tier:</span> <span className="sasa-mono uppercase text-primary">{profile?.tier ?? "free"}</span></div>
        <p className="text-[11px] text-muted-foreground">Email can't be changed here — contact the creator if you need it migrated.</p>
      </section>

      <section className="sasa-panel rounded-md p-5 space-y-3">
        <Label>New password</Label>
        <div className="flex gap-2">
          <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="8+ characters" />
          <Button onClick={changePassword} disabled={busy || !pw}>Update</Button>
        </div>
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen px-4 md:px-8 py-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link to="/" className="text-xs text-muted-foreground underline">← Back to SASA</Link>
        <header className="flex items-center gap-3">
          <UserCircle2 size={22} className="text-primary" />
          <h1 className="sasa-display text-3xl tracking-widest sasa-text-glow">USER PROFILE</h1>
        </header>
        {children}
      </div>
    </div>
  );
}