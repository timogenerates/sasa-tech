import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export function SasaAvatar({
  size = 72,
  speaking = false,
}: {
  size?: number;
  speaking?: boolean;
}) {
  return (
    <motion.div
      className="relative grid place-items-center sasa-float"
      style={{ width: size, height: size }}
      animate={speaking ? { scale: [1, 1.06, 1] } : {}}
      transition={{ duration: 0.6, repeat: speaking ? Infinity : 0 }}
    >
      <div
        className="absolute inset-0 rounded-full sasa-pulse-glow"
        style={{
          background:
            "radial-gradient(circle, oklch(0.82 0.18 210 / 0.5), transparent 70%)",
        }}
      />
      <div
        className="relative grid place-items-center rounded-full"
        style={{
          width: size * 0.7,
          height: size * 0.7,
          background:
            "radial-gradient(circle at 30% 30%, oklch(0.95 0.05 210), oklch(0.55 0.2 260) 60%, oklch(0.3 0.15 280))",
          boxShadow:
            "0 0 25px oklch(0.82 0.18 210 / 0.8), inset 0 0 18px oklch(1 0 0 / 0.4)",
        }}
      >
        <Sparkles className="text-white" size={size * 0.32} strokeWidth={1.5} />
      </div>
      <motion.div
        className="absolute inset-0 rounded-full border"
        style={{ borderColor: "oklch(0.82 0.18 210 / 0.4)" }}
        animate={{ rotate: 360 }}
        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
      >
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full"
          style={{ background: "var(--sasa-cyan)", boxShadow: "0 0 8px var(--sasa-cyan)" }}
        />
      </motion.div>
    </motion.div>
  );
}