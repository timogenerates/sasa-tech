import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { SasaAvatar } from "@/components/SasaAvatar";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — SASA" },
      { name: "description", content: "Set a new password for your SASA account." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Supabase places recovery tokens on the URL hash (#access_token=...&type=recovery).
  // The client auto-consumes them and fires a PASSWORD_RECOVERY event; wait for
  // either that event or an existing session before allowing the form.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setReady(true);
        setSessionError(null);
      }
    });
    // If nothing happens in 4s and no hash, tell the user the link is stale.
    const t = setTimeout(() => {
      if (!ready && typeof window !== "undefined" && !window.location.hash) {
        setSessionError("This reset link is missing or has expired. Request a new one from the sign-in dialog.");
      }
    }, 4000);
    return () => { cancelled = true; sub.subscription.unsubscribe(); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const passwordOk = (p: string) =>
    p.length >= 8 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordOk(password)) return toast.error("Password needs 8+ chars, upper, lower, number, symbol.");
    if (password !== confirm) return toast.error("Passwords don't match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(error.message);
    setDone(true);
    // Sign the user out so they're forced to log in with the new password.
    await supabase.auth.signOut().catch(() => {});
    toast.success("Password updated. Please log in with your new password.");
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 py-10">
      <Toaster />
      <div className="w-full max-w-md sasa-panel sasa-frame-corner rounded-md p-6 space-y-5">
        <div className="flex items-center gap-3">
          <SasaAvatar size={44} />
          <div>
            <div className="sasa-display text-lg tracking-widest sasa-text-glow">RESET PASSWORD</div>
            <div className="sasa-subheading-sm">Set a new password for your SASA account.</div>
          </div>
        </div>

        {done ? (
          <div className="space-y-4">
            <div className="text-sm">
              All set, master~ Your password has been updated. Head back to the sign-in
              page and log in with your email and the new password.
            </div>
            <Button
              className="w-full"
              style={{ background: "linear-gradient(135deg, var(--sasa-cyan), var(--sasa-violet))", color: "oklch(0.12 0.04 265)" }}
              onClick={() => navigate({ to: "/" })}
            >
              Back to sign-in
            </Button>
          </div>
        ) : sessionError ? (
          <div className="space-y-3 text-sm">
            <div className="text-rose-300">{sessionError}</div>
            <Link to="/" className="text-primary underline text-xs">← Back to SASA</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label>New password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={!ready} />
              <p className="text-[10px] text-muted-foreground mt-1">8+ chars · upper · lower · number · symbol</p>
            </div>
            <div>
              <Label>Confirm new password</Label>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required disabled={!ready} />
            </div>
            <Button
              type="submit"
              disabled={busy || !ready}
              className="w-full"
              style={{ background: "linear-gradient(135deg, var(--sasa-cyan), var(--sasa-violet))", color: "oklch(0.12 0.04 265)" }}
            >
              {busy ? "Updating…" : ready ? "Update password" : "Waiting for reset link…"}
            </Button>
            <div className="text-xs text-center text-muted-foreground">
              <Link to="/" className="underline">Back to SASA</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}