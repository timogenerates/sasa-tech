import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { MessageSquarePlus, BarChart3, UserCircle2, Settings, LogOut, Crown, Sparkles, Link2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ChatHistoryList } from "./ChatHistoryList";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onNewChat: () => void;
  onRequestAuth: (mode: "signup" | "login") => void;
  activeChatId?: string | null;
  onSelectChat?: (id: string) => void;
  chatsRefreshKey?: number;
  onOpenStatusHub?: () => void;
};

export function SasaSidebar({
  open, onOpenChange, onNewChat, onRequestAuth,
  activeChatId = null, onSelectChat, chatsRefreshKey = 0,
  onOpenStatusHub,
}: Props) {
  const { user, profile, signOut } = useAuth();

  const item = (icon: React.ReactNode, label: string, onClick: () => void, disabled = false) => (
    <button
      onClick={() => { onClick(); }}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
    >
      <span className="text-primary">{icon}</span>
      <span className="tracking-wide">{label}</span>
    </button>
  );

  const guestOnly = () => toast.info("Log in to unlock this section, master~");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[300px] sasa-panel border-r-0 p-0">
        <SheetHeader className="px-4 py-4 border-b" style={{ borderColor: "oklch(0.32 0.07 250 / 0.4)" }}>
          <SheetTitle className="sasa-display tracking-widest sasa-text-glow text-base">
            SASA · MENU
          </SheetTitle>
          {user ? (
            <div className="text-xs text-muted-foreground truncate">
              {profile?.display_name ?? user.email}
              <span className="ml-2 sasa-mono text-[10px] uppercase">{profile?.tier ?? "free"}</span>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">Guest mode · 10 prompts total</div>
          )}
        </SheetHeader>

        <div className="flex flex-col h-[calc(100%-140px)] overflow-hidden">
          <div className="p-2 space-y-0.5 shrink-0">
            {item(<MessageSquarePlus size={16} />, "New Chat", () => { onNewChat(); onOpenChange(false); })}
          </div>

          {user && (
            <div className="flex-1 overflow-y-auto px-2 pb-2">
              <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                Chat History
              </div>
              <ChatHistoryList
                activeChatId={activeChatId}
                refreshKey={chatsRefreshKey}
                onSelect={(id) => { onSelectChat?.(id); onOpenChange(false); }}
              />
            </div>
          )}

          <div className="p-2 space-y-0.5 border-t shrink-0" style={{ borderColor: "oklch(0.32 0.07 250 / 0.3)" }}>
            {item(<BarChart3 size={16} />, "Status Hub", () => {
              if (!user) return guestOnly();
              onOpenStatusHub?.();
              onOpenChange(false);
            }, !user)}
            {item(<Sparkles size={16} />, "Character Design", () => toast.info("3D avatar customization — paid tier feature, coming soon"))}
            {item(<Crown size={16} />, "Upgrade Plan", () => {
              const email = user?.email ?? "";
              toast(
                `Patreon: patreon.com/sasaupgrades · use email "${email || "your SASA email"}" or your tier won't sync.`,
                { duration: 6000 },
              );
              window.open("https://www.patreon.com/sasaupgrades", "_blank", "noopener");
            })}
            {item(<UserCircle2 size={16} />, "User Profile", () => user ? toast.info("Profile editor — coming next phase") : guestOnly(), !user)}
            {item(<Settings size={16} />, "Settings", () => toast.info("Settings panel — coming next phase"))}
            {item(<Link2 size={16} />, "Synchronization", () => user ? toast.info("Account sync — coming next phase") : guestOnly(), !user)}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-2 border-t" style={{ borderColor: "oklch(0.32 0.07 250 / 0.4)" }}>
          {user ? (
            <Button
              variant="ghost" className="w-full justify-start"
              onClick={async () => {
                if (!confirm("Sign out of SASA? Your chat will be archived, master~")) return;
                await signOut();
                onOpenChange(false);
                toast.success("Signed out. Until next time~");
              }}
            >
              <LogOut size={16} className="mr-2" /> Sign out
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => { onRequestAuth("login"); onOpenChange(false); }}>Log in</Button>
              <Button variant="outline" className="flex-1" onClick={() => { onRequestAuth("signup"); onOpenChange(false); }}>Sign up</Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}