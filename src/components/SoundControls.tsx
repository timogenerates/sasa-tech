import { useEffect, useState } from "react";
import { Volume2, VolumeX, Music, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  initSfx, isSfxMuted, isAmbientOn, setSfxMuted,
  startAmbient, stopAmbient, sfxClick,
} from "@/lib/sasa-sfx";

/** Header toggles for SFX mute and synthwave ambient pad. */
export function SoundControls() {
  const [muted, setMuted] = useState(false);
  const [ambient, setAmbient] = useState(false);

  useEffect(() => {
    initSfx();
    setMuted(isSfxMuted());
    setAmbient(isAmbientOn());
  }, []);

  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm" variant="ghost" className="h-8 w-8 p-0"
        title={muted ? "Unmute SFX" : "Mute SFX"}
        onClick={() => {
          const next = !muted;
          setSfxMuted(next); setMuted(next);
          if (!next) sfxClick();
        }}
      >
        {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
      </Button>
      <Button
        size="sm" variant="ghost" className="h-8 w-8 p-0"
        title={ambient ? "Stop ambient music" : "Start synthwave ambient"}
        onClick={() => {
          if (ambient) { stopAmbient(); setAmbient(false); }
          else { startAmbient(); setAmbient(true); sfxClick(); }
        }}
      >
        {ambient ? <Music2 size={14} className="text-primary" /> : <Music size={14} />}
      </Button>
    </div>
  );
}