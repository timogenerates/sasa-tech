import { createFileRoute, Link } from "@tanstack/react-router";
import { Settings as SettingsIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — SASA" }] }),
  component: SettingsPage,
});

const KEYS = {
  sfx: "sasa.sfx.enabled",
  amb: "sasa.amb.enabled",
  vol: "sasa.vol",
  reduce: "sasa.reduceMotion",
  typing: "sasa.typingSpeed",
} as const;

function useLocal<T>(key: string, init: T) {
  const [v, setV] = useState<T>(init);
  useEffect(() => {
    try { const raw = localStorage.getItem(key); if (raw !== null) setV(JSON.parse(raw) as T); } catch { /* ignore */ }
  }, [key]);
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
  }, [key, v]);
  return [v, setV] as const;
}

function SettingsPage() {
  const [sfx, setSfx] = useLocal<boolean>(KEYS.sfx, true);
  const [amb, setAmb] = useLocal<boolean>(KEYS.amb, false);
  const [vol, setVol] = useLocal<number>(KEYS.vol, 60);
  const [reduce, setReduce] = useLocal<boolean>(KEYS.reduce, false);
  const [typing, setTyping] = useLocal<number>(KEYS.typing, 55);

  return (
    <div className="min-h-screen px-4 md:px-8 py-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link to="/" className="text-xs text-muted-foreground underline">← Back to SASA</Link>
        <header className="flex items-center gap-3">
          <SettingsIcon size={22} className="text-primary" />
          <h1 className="sasa-display text-3xl tracking-widest sasa-text-glow">SETTINGS</h1>
        </header>

        <section className="sasa-panel rounded-md p-5 space-y-5">
          <div className="sasa-mono text-[10px] uppercase tracking-widest text-muted-foreground">Audio</div>
          <Row label="Click & typing SFX"><Switch checked={sfx} onCheckedChange={setSfx} /></Row>
          <Row label="Ambient synthwave"><Switch checked={amb} onCheckedChange={setAmb} /></Row>
          <div>
            <Label className="text-xs">Master volume · {vol}%</Label>
            <Slider value={[vol]} min={0} max={100} step={5} onValueChange={(v) => setVol(v[0] ?? 0)} className="mt-2" />
          </div>
        </section>

        <section className="sasa-panel rounded-md p-5 space-y-5">
          <div className="sasa-mono text-[10px] uppercase tracking-widest text-muted-foreground">Display</div>
          <Row label="Reduce motion / scanlines"><Switch checked={reduce} onCheckedChange={setReduce} /></Row>
          <div>
            <Label className="text-xs">Deliberate typing speed · {typing} chars/sec</Label>
            <Slider value={[typing]} min={20} max={120} step={5} onValueChange={(v) => setTyping(v[0] ?? 55)} className="mt-2" />
          </div>
        </section>

        <p className="text-[11px] text-muted-foreground">Preferences are stored locally on this device.</p>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}