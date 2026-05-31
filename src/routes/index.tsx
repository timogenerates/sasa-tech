import { createFileRoute } from "@tanstack/react-router";
import { ChatPanel } from "@/components/ChatPanel";
import { SasaAvatar } from "@/components/SasaAvatar";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SASA — Self-Analysis Systems AI" },
      { name: "description", content: "SASA is your floating AI companion that gamifies your life as a real-time character status window." },
      { property: "og:title", content: "SASA — Self-Analysis Systems AI" },
      { property: "og:description", content: "Your real life as a video-game HUD. Chat with SASA and watch your stats update in real time." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen flex flex-col">
      <Toaster />
      <header className="px-4 md:px-8 py-4 border-b" style={{ borderColor: "oklch(0.32 0.07 250 / 0.5)" }}>
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <SasaAvatar size={56} />
          <div className="flex-1">
            <h1 className="text-base md:text-xl font-bold tracking-widest sasa-text-glow">
              SELF-ANALYSIS SYSTEMS AI <span className="opacity-50">·</span> SASA
            </h1>
            <p className="text-[11px] md:text-xs text-muted-foreground mt-0.5 max-w-2xl leading-relaxed">
              Meet SASA! Your very own system for increasing your life quality. She acts like a status window that relays back your real-life stats, in accordance with the data you feed her.
            </p>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-5xl w-full mx-auto px-2 md:px-6 py-4">
        <div className="sasa-panel sasa-frame-corner rounded-md h-[calc(100vh-180px)] min-h-[500px] overflow-hidden">
          <ChatPanel />
        </div>
      </main>
    </div>
  );
}
