import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export type DailyLog = {
  sleepHours: string;
  sleepQuality: string;
  physical: string;
  nutrition: string;
  mentalClarity: string;
  stress: string;
  stressSource: string;
  socialEnergy: string;
  wins: string;
  losses: string;
  mood: string;
};

const EMPTY: DailyLog = {
  sleepHours: "", sleepQuality: "", physical: "", nutrition: "",
  mentalClarity: "", stress: "", stressSource: "", socialEnergy: "",
  wins: "", losses: "", mood: "",
};

export function DailyLogForm({
  open, onClose, onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (log: DailyLog) => void;
}) {
  const [log, setLog] = useState<DailyLog>(EMPTY);
  const set = (k: keyof DailyLog) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setLog((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sasa-panel max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="tracking-widest text-sm sasa-text-glow">
            ⚡ DAILY DATA LOG
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Sleep (hrs)" value={log.sleepHours} onChange={set("sleepHours")} placeholder="7.5" />
            <Field label="Sleep quality 1-10" value={log.sleepQuality} onChange={set("sleepQuality")} placeholder="8" />
          </div>
          <Field label="Physical (trained? intensity? pain?)" value={log.physical} onChange={set("physical")} placeholder="Lifted, 8/10, no pain" />
          <Field label="Nutrition + hydration 1-10" value={log.nutrition} onChange={set("nutrition")} placeholder="Ate clean, hydration 7" />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Focus 1-10" value={log.mentalClarity} onChange={set("mentalClarity")} placeholder="6" />
            <Field label="Stress 1-10" value={log.stress} onChange={set("stress")} placeholder="4" />
          </div>
          <Field label="Main stress source" value={log.stressSource} onChange={set("stressSource")} placeholder="Deadline" />
          <Field label="Social energy" value={log.socialEnergy} onChange={set("socialEnergy")} placeholder="Energising" />
          <TArea label="Win today" value={log.wins} onChange={set("wins")} />
          <TArea label="Loss today" value={log.losses} onChange={set("losses")} />
          <Field label="Overall mood (one word)" value={log.mood} onChange={set("mood")} placeholder="Sharp" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => { onSubmit(log); setLog(EMPTY); }}
            style={{ background: "linear-gradient(135deg, var(--sasa-cyan), var(--sasa-violet))", color: "oklch(0.12 0.04 265)" }}
          >
            Submit to SASA
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: React.ChangeEventHandler<HTMLInputElement>; placeholder?: string }) {
  return (
    <div>
      <Label className="text-[10px] tracking-widest opacity-70">{label}</Label>
      <Input value={value} onChange={onChange} placeholder={placeholder} className="h-8 text-xs mt-1" />
    </div>
  );
}

function TArea({ label, value, onChange }: { label: string; value: string; onChange: React.ChangeEventHandler<HTMLTextAreaElement> }) {
  return (
    <div>
      <Label className="text-[10px] tracking-widest opacity-70">{label}</Label>
      <Textarea value={value} onChange={onChange} rows={2} className="text-xs mt-1" />
    </div>
  );
}