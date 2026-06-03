import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export function AuthDialog({
  open, onOpenChange, defaultMode = "signup",
}: { open: boolean; onOpenChange: (v: boolean) => void; defaultMode?: "signup" | "login" }) {
  const [mode, setMode] = useState<"signup" | "login" | "forgot">(defaultMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const passwordOk = (p: string) =>
    p.length >= 8 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p);

  async function doSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("A name (any name) is required, master~");
    if (!passwordOk(password)) return toast.error("Password needs 8+ chars, upper, lower, number, symbol.");
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: window.location.origin, data: { display_name: name } },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Account created! Check your email to verify, then log in.");
    setMode("login");
  }

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back, master~ ✨");
    onOpenChange(false);
  }

  async function doForgot(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset-password",
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Reset link sent to your email.");
    setMode("login");
  }

  async function doGoogle() {
    setBusy(true);
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) { setBusy(false); toast.error("Google sign-in failed"); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md sasa-panel border-0">
        <DialogHeader>
          <DialogTitle className="sasa-display text-xl tracking-widest sasa-text-glow">
            {mode === "signup" ? "JOIN SASA" : mode === "login" ? "WELCOME BACK" : "RESET PASSWORD"}
          </DialogTitle>
          <DialogDescription>
            {mode === "signup" ? "Sync your stats across sessions and unlock chat history." :
             mode === "login" ? "Pick up where you left off with SASA." :
             "We'll email you a link to set a new password."}
          </DialogDescription>
        </DialogHeader>

        {mode !== "forgot" && (
          <Button type="button" variant="outline" onClick={doGoogle} disabled={busy} className="w-full">
            Continue with Google
          </Button>
        )}

        <form onSubmit={mode === "signup" ? doSignup : mode === "login" ? doLogin : doForgot} className="space-y-3">
          {mode === "signup" && (
            <div>
              <Label>Name (anything works)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          )}
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          {mode !== "forgot" && (
            <div>
              <Label>Password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              {mode === "signup" && (
                <p className="text-[10px] text-muted-foreground mt-1">8+ chars · upper · lower · number · symbol</p>
              )}
            </div>
          )}
          <Button type="submit" disabled={busy} className="w-full" style={{ background: "linear-gradient(135deg, var(--sasa-cyan), var(--sasa-violet))", color: "oklch(0.12 0.04 265)" }}>
            {busy ? "…" : mode === "signup" ? "Create account" : mode === "login" ? "Log in" : "Send reset link"}
          </Button>
        </form>

        <div className="text-xs text-center text-muted-foreground space-x-3">
          {mode === "login" && <button onClick={() => setMode("forgot")} className="underline">Forgot password?</button>}
          {mode !== "signup" && <button onClick={() => setMode("signup")} className="underline">Need an account?</button>}
          {mode !== "login" && <button onClick={() => setMode("login")} className="underline">Have an account?</button>}
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-2">
          SASA verifies your email before letting you in.
        </p>
      </DialogContent>
    </Dialog>
  );
}