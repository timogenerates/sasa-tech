import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { MessageSquarePlus, BarChart3, UserCircle2, Settings, LogOut, Crown, Sparkles, Link2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ChatHistoryList } from "./ChatHistoryList";
import { useNavigate } from "@tanstack/react-router";

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
  const navigate = useNavigate();

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
            <div className="text-xs text-muted-foreground">Guest mode · 7 prompts total</div>
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
            {item(<Crown size={16} />, "Upgrade Plan", () => { navigate({ to: "/upgrade" }); onOpenChange(false); })}
            {item(<UserCircle2 size={16} />, "User Profile", () => { if (!user) return guestOnly(); navigate({ to: "/profile" }); onOpenChange(false); }, !user)}
            {item(<Settings size={16} />, "Settings", () => { navigate({ to: "/settings" }); onOpenChange(false); })}
            {item(<Link2 size={16} />, "Synchronization", () => { if (!user) return guestOnly(); navigate({ to: "/sync" }); onOpenChange(false); }, !user)}
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
            <Button className="w-full" onClick={() => { onRequestAuth("signup"); onOpenChange(false); }}>
              Sign up / Log in
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}