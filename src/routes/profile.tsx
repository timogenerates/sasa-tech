import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserCircle2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { updateDisplayName, updateAvatarUrl } from "@/lib/profile.functions";
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
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !user) return;
    if (!f.type.startsWith("image/")) return toast.error("Pick an image file~");
    if (f.size > 5 * 1024 * 1024) return toast.error("5MB max, master~");
    setUploading(true);
    try {
      const ext = (f.name.split(".").pop() || "png").toLowerCase();
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, f, {
        cacheControl: "3600",
        upsert: true,
        contentType: f.type,
      });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage
        .from("avatars")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5); // ~5y
      if (sErr || !signed?.signedUrl) throw sErr ?? new Error("Signed URL failed");
      await updateAvatarUrl({ data: { avatarUrl: signed.signedUrl } });
      await refreshProfile();
      toast.success("Profile picture updated~");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removeAvatar() {
    setUploading(true);
    try {
      await updateAvatarUrl({ data: { avatarUrl: null } });
      await refreshProfile();
      toast.success("Profile picture removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally { setUploading(false); }
  }

  return (
    <Shell>
      <section className="sasa-panel rounded-md p-5 space-y-3">
        <div className="sasa-mono text-[10px] uppercase tracking-widest text-muted-foreground">Profile Picture</div>
        <div className="flex items-center gap-4">
          <div
            className="h-20 w-20 rounded-full overflow-hidden grid place-items-center bg-secondary shrink-0"
            style={{ boxShadow: "0 0 12px oklch(0.82 0.18 210 / 0.4), inset 0 0 0 2px oklch(0.82 0.18 210 / 0.6)" }}
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="You" className="h-full w-full object-cover" />
            ) : (
              <UserCircle2 size={40} className="text-muted-foreground" />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickAvatar} />
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Upload size={14} className="mr-1" /> {uploading ? "Uploading…" : "Upload picture"}
            </Button>
            {profile?.avatar_url && (
              <Button size="sm" variant="ghost" onClick={removeAvatar} disabled={uploading}>
                Remove
              </Button>
            )}
            <p className="sasa-subheading-sm">Shows beside each of your chats. PNG/JPG, up to 5MB.</p>
          </div>
        </div>
      </section>

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