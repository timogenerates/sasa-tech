import { motion } from "framer-motion";
import sasaAsset from "@/assets/sasa-avatar.png.asset.json";

export type SasaMood = "happy" | "neutral" | "concerned" | "thinking";

/**
 * SASA's animated profile picture. Uses the pink-haired anime portrait
 * with idle motion (breathe + sway), a periodic blink overlay, and a
 * mood-tinted glow that reacts to the last message sentiment.
 */
export function SasaAvatar({
  size = 72,
  speaking = false,
  mood = "neutral",
}: {
  size?: number;
  speaking?: boolean;
  mood?: SasaMood;
}) {
  const moodGlow: Record<SasaMood, string> = {
    happy: "oklch(0.82 0.18 210 / 0.55)",
    neutral: "oklch(0.78 0.16 220 / 0.45)",
    concerned: "oklch(0.7 0.18 30 / 0.45)",
    thinking: "oklch(0.68 0.22 300 / 0.55)",
  };
  const moodFilter: Record<SasaMood, string> = {
    happy: "saturate(1.1)",
    neutral: "saturate(1)",
    concerned: "saturate(0.85) hue-rotate(-8deg)",
    thinking: "saturate(1.05) hue-rotate(10deg)",
  };

  return (
    <motion.div
      className="relative grid place-items-center sasa-sway"
      style={{ width: size, height: size }}
      animate={speaking ? { scale: [1, 1.03, 1] } : { scale: 1 }}
      transition={{ duration: 0.7, repeat: speaking ? Infinity : 0 }}
    >
      {/* outer mood glow */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, ${moodGlow[mood]}, transparent 70%)`,
          filter: "blur(6px)",
          transition: "background 600ms ease",
        }}
      />
      {/* portrait disc */}
      <div
        className="relative overflow-hidden rounded-full sasa-breathe"
        style={{
          width: size,
          height: size,
          boxShadow:
            "0 0 18px oklch(0.82 0.18 210 / 0.5), inset 0 0 0 2px oklch(0.82 0.18 210 / 0.7)",
        }}
      >
        <img
          src={sasaAsset.url}
          alt="SASA"
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: moodFilter[mood],
            transition: "filter 500ms ease",
          }}
        />
        {/* blink overlay — a thin shutter that briefly drops over the eyes */}
        <div
          aria-hidden
          className="sasa-blink absolute"
          style={{
            top: `${size * 0.42}px`,
            left: `${size * 0.22}px`,
            width: `${size * 0.56}px`,
            height: `${size * 0.06}px`,
            background:
              "linear-gradient(180deg, transparent, oklch(0.18 0.04 260 / 0.85), transparent)",
            borderRadius: "999px",
            pointerEvents: "none",
          }}
        />
        {/* scanline shimmer */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, oklch(0.82 0.18 210 / 0.06) 50%, transparent 100%)",
            mixBlendMode: "screen",
          }}
        />
      </div>
      {/* orbiting ring */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: size + 8,
          height: size + 8,
          border: "1px dashed oklch(0.82 0.18 210 / 0.35)",
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
      />
    </motion.div>
  );
}

/** Pick a mood for SASA from her latest message text. */
export function deriveMood(text: string | undefined, isThinking: boolean): SasaMood {
  if (isThinking) return "thinking";
  if (!text) return "neutral";
  const t = text.toLowerCase();
  if (/\b(sad|sorry|worried|stress|tough|hard time|tired|burnout|cry|hurt|loss|grief)\b/.test(t)) return "concerned";
  if (/\b(great|amazing|love it|nice|awesome|brilliant|smart|win|congrats|proud|wow|yay|cute)\b/.test(t)) return "happy";
  return "neutral";
}