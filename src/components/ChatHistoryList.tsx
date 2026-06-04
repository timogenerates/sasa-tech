import { useEffect, useState, useCallback } from "react";
import { archiveChat, listChats, renameChat, type ChatRow } from "@/lib/chats.functions";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  activeChatId: string | null;
  onSelect: (id: string) => void;
  refreshKey?: number;
};

export function ChatHistoryList({ activeChatId, onSelect, refreshKey = 0 }: Props) {
  const { user } = useAuth();
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const rows = await listChats();
      setChats(rows);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  if (!user) return null;

  if (loading && chats.length === 0) {
    return <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>;
  }
  if (chats.length === 0) {
    return <div className="px-3 py-2 text-xs text-muted-foreground">No chats yet. Say hi to SASA~</div>;
  }

  async function doRename(c: ChatRow) {
    const title = prompt("Rename chat", c.title)?.trim();
    if (!title || title === c.title) return;
    try {
      await renameChat({ data: { chatId: c.id, title } });
      await load();
    } catch (e) {
      toast.error("Couldn't rename chat");
      console.error(e);
    }
  }

  async function doArchive(c: ChatRow) {
    if (!confirm(`Archive "${c.title}"?`)) return;
    try {
      await archiveChat({ data: { chatId: c.id } });
      await load();
    } catch (e) {
      toast.error("Couldn't archive chat");
      console.error(e);
    }
  }

  return (
    <div className="space-y-0.5">
      {chats.map((c) => {
        const active = c.id === activeChatId;
        return (
          <div
            key={c.id}
            className={`group flex items-center gap-1 rounded-md text-sm transition-colors ${
              active ? "bg-secondary" : "hover:bg-secondary/60"
            }`}
          >
            <button
              onClick={() => onSelect(c.id)}
              className="flex-1 text-left px-3 py-2 truncate"
              title={c.title}
            >
              <span className={active ? "text-primary" : ""}>{c.title}</span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100"
                  aria-label="Chat options"
                >
                  <MoreHorizontal size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="sasa-panel">
                <DropdownMenuItem onClick={() => doRename(c)}>
                  <Pencil size={12} className="mr-2" /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => doArchive(c)} className="text-destructive focus:text-destructive">
                  <Trash2 size={12} className="mr-2" /> Archive
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}
    </div>
  );
}