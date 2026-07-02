import { motion } from "framer-motion";
import sasaAsset from "@/assets/sasa-avatar.png.asset.json";

export type SasaMood = "happy" | "neutral" | "concerned" | "thinking";

/**
 * SASA's profile picture. Clean, unfiltered image inside a neon ring
 * with only a subtle "speaking" pulse — no blur, blink, or scanline
 * overlays so the portrait always reads crisply.
 */
export function SasaAvatar({
  size = 72,
  speaking = false,
}: {
  size?: number;
  speaking?: boolean;
  mood?: SasaMood;
}) {
  return (
    <motion.div
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
      animate={speaking ? { scale: [1, 1.03, 1] } : { scale: 1 }}
      transition={{ duration: 0.7, repeat: speaking ? Infinity : 0 }}
    >
      <div
        className="relative overflow-hidden rounded-full"
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
          }}
        />
      </div>
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