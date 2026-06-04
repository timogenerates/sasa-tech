import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { SasaAvatar } from "@/components/SasaAvatar";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { SasaSidebar } from "@/components/SasaSidebar";
import { AuthDialog } from "@/components/AuthDialog";
import { PromptLimitHud } from "@/components/PromptLimitHud";
import { useAuth } from "@/hooks/useAuth";

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [usagePulse, setUsagePulse] = useState(0);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatsRefreshKey, setChatsRefreshKey] = useState(0);
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <Toaster />
      <header className="px-4 md:px-8 py-4 border-b" style={{ borderColor: "oklch(0.32 0.07 250 / 0.5)" }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Button size="icon" variant="ghost" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </Button>
          <SasaAvatar size={56} />
          <div className="flex-1">
            <h1 className="text-base md:text-xl font-bold tracking-widest sasa-text-glow">
              SELF-ANALYSIS SYSTEMS AI <span className="opacity-50">·</span> SASA
            </h1>
            <p className="text-[11px] md:text-xs text-muted-foreground mt-0.5 max-w-2xl leading-relaxed">
              Meet SASA! Your very own system for increasing your life quality. She acts like a status window that relays back your real-life stats, in accordance with the data you feed her.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PromptLimitHud pulse={usagePulse} />
            {!user && (
              <Button
                size="sm"
                onClick={() => { setAuthMode("signup"); setAuthOpen(true); }}
                style={{ background: "linear-gradient(135deg, var(--sasa-cyan), var(--sasa-violet))", color: "oklch(0.12 0.04 265)" }}
              >
                Sign up
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-5xl w-full mx-auto px-2 md:px-6 py-4">
        <div className="sasa-panel sasa-frame-corner rounded-md h-[calc(100vh-180px)] min-h-[500px] overflow-hidden">
          <ChatPanel
            onPromptConsumed={() => setUsagePulse((p) => p + 1)}
            onRequestAuth={(mode) => { setAuthMode(mode); setAuthOpen(true); }}
            activeChatId={activeChatId}
            onActiveChatChange={setActiveChatId}
            onChatsMutated={() => setChatsRefreshKey((k) => k + 1)}
          />
        </div>
      </main>
      <SasaSidebar
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        onNewChat={() => setActiveChatId(null)}
        onRequestAuth={(mode) => { setAuthMode(mode); setAuthOpen(true); }}
        activeChatId={activeChatId}
        onSelectChat={(id) => setActiveChatId(id)}
        chatsRefreshKey={chatsRefreshKey}
      />
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} defaultMode={authMode} />
    </div>
  );
}
