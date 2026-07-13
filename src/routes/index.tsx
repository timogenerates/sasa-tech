import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { SasaAvatar } from "@/components/SasaAvatar";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Menu, Activity } from "lucide-react";
import { SasaSidebar } from "@/components/SasaSidebar";
import { AuthDialog } from "@/components/AuthDialog";
import { PromptLimitHud } from "@/components/PromptLimitHud";
import { StatusHub } from "@/components/StatusHub";
import { FreeResetCountdown } from "@/components/FreeResetCountdown";
import { LifetimeStatsPanel } from "@/components/LifetimeStatsPanel";
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
  // Persist active chat across route navigations so returning from
  // /settings, /upgrade, etc. does NOT drop the user back to a blank
  // "new chat". Keyed by user id (or "guest") so switching accounts is
  // still clean.
  const { user } = useAuth();
  const activeKey = `sasa:active-chat:v1:${user?.id ?? "guest"}`;
  const [activeChatId, setActiveChatIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try { return localStorage.getItem(activeKey); } catch { return null; }
  });
  const setActiveChatId = (id: string | null) => {
    setActiveChatIdState(id);
    try {
      if (id) localStorage.setItem(activeKey, id);
      else localStorage.removeItem(activeKey);
    } catch { /* ignore */ }
  };
  const [chatsRefreshKey, setChatsRefreshKey] = useState(0);
  const [statusHubOpen, setStatusHubOpen] = useState(false);
  const [statusRefreshKey, setStatusRefreshKey] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    // On account switch, re-hydrate from the new user's saved chat id.
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(activeKey);
      setActiveChatIdState(saved);
    } catch { /* ignore */ }
    setChatsRefreshKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      <Toaster />
      <FreeResetCountdown />
      <header className="px-3 md:px-8 py-3 md:py-4 border-b shrink-0" style={{ borderColor: "oklch(0.32 0.07 250 / 0.5)" }}>
        <div className="max-w-5xl mx-auto flex items-center gap-2 md:gap-3">
          <Button size="icon" variant="ghost" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </Button>
          <SasaAvatar size={44} />
          <div className="flex-1 min-w-0">
            <h1 className="text-sm md:text-xl font-bold tracking-widest sasa-text-glow truncate">
              SELF-ANALYSIS SYSTEMS AI <span className="opacity-50">·</span> SASA
            </h1>
            <p className="sasa-subheading-sm mt-0.5 max-w-2xl hidden md:block">
              Your floating AI companion. Real-life stats, gamified.
            </p>
          </div>
          <div className="flex items-center gap-1 md:gap-2 shrink-0">
            <PromptLimitHud pulse={usagePulse} />
            {/* Mobile / tablet: stats button opens the hub since the side rail hides on <lg */}
            <Button
              size="icon"
              variant="ghost"
              className="lg:hidden"
              aria-label="Open status hub"
              onClick={() => setStatusHubOpen(true)}
            >
              <Activity size={18} />
            </Button>
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
      <main className="flex-1 min-h-0 max-w-5xl w-full mx-auto px-2 md:px-6 py-3 md:py-4 overflow-hidden">
        <div className="grid gap-4 h-full lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="sasa-panel sasa-frame-corner rounded-md overflow-hidden min-w-0 h-full">
            <ChatPanel
              onPromptConsumed={() => setUsagePulse((p) => p + 1)}
              onRequestAuth={(mode) => { setAuthMode(mode); setAuthOpen(true); }}
              activeChatId={activeChatId}
              onActiveChatChange={setActiveChatId}
              onChatsMutated={() => setChatsRefreshKey((k) => k + 1)}
              onStatusSaved={() => setStatusRefreshKey((k) => k + 1)}
              onNavigate={(to) => navigate({ to })}
              onOpenStatusHub={() => setStatusHubOpen(true)}
              onOpenSidebar={() => setSidebarOpen(true)}
            />
          </div>
          {/* Side rail — only on lg+. Mobile users open the same stats via
              the header Activity button (opens StatusHub dialog). */}
          <div className="min-w-0 h-full hidden lg:block">
            <LifetimeStatsPanel
              refreshKey={statusRefreshKey}
              onRequestAuth={(mode) => { setAuthMode(mode); setAuthOpen(true); }}
            />
          </div>
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
        onOpenStatusHub={() => setStatusHubOpen(true)}
      />
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} defaultMode={authMode} />
      <StatusHub open={statusHubOpen} onOpenChange={setStatusHubOpen} refreshKey={statusRefreshKey} />
    </div>
  );
}
