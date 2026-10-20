import { Check, Inbox, Reply, Sparkles, Pin, AtSign, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { type InboxItem } from "@/hooks/useInbox";

const REASON_CONFIG: Record<string, { icon: typeof AtSign; label: string; color: string }> = {
  mention: { icon: AtSign, label: "Nevnt", color: "text-info" },
  ai: { icon: Sparkles, label: "AI-forslag", color: "text-primary" },
  pinned: { icon: Pin, label: "Festet", color: "text-warning" },
  reply: { icon: Reply, label: "Svar til deg", color: "text-success" },
};

interface InboxModeProps {
  items: InboxItem[];
  loading: boolean;
  onMarkHandled: (itemId: string) => void;
  onScrollToPost: (postId: string) => void;
  onSwitchToChat: () => void;
}

export function InboxMode({ items, loading, onMarkHandled, onScrollToPost, onSwitchToChat }: InboxModeProps) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center mb-3">
          <Check className="h-6 w-6 text-success" />
        </div>
        <h3 className="text-sm font-semibold text-foreground/80 mb-1">Alt håndtert!</h3>
        <p className="text-xs text-muted-foreground mb-4">Ingen meldinger krever oppfølging.</p>
        <Button variant="outline" size="sm" onClick={onSwitchToChat} className="text-xs">
          Tilbake til chat
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[900px] mx-auto py-2">
        {items.map(item => {
          const config = REASON_CONFIG[item.reason] || REASON_CONFIG.mention;
          const Icon = config.icon;
          return (
            <div
              key={item.id}
              className="group flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors border-b border-border/10 cursor-pointer"
              onClick={() => {
                onScrollToPost(item.post_id);
                onSwitchToChat();
              }}
            >
              <div className={cn("mt-1 shrink-0", config.color)}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="text-[12px] font-semibold text-foreground/80 truncate">
                    {item.post_author_name || "Ukjent"}
                  </span>
                  <span className="text-[10px] text-muted-foreground/50 shrink-0">
                    {item.post_created_at && format(new Date(item.post_created_at), "d. MMM HH:mm", { locale: nb })}
                  </span>
                  <span className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded-full", config.color, "bg-current/5")}>
                    {config.label}
                  </span>
                </div>
                <p className="text-[12px] text-muted-foreground line-clamp-2">
                  {item.post_body}
                </p>
                {/* AI suggestion chips */}
                {item.suggested_actions && item.suggested_actions.length > 0 && (
                  <div className="flex gap-1 mt-1.5">
                    {item.suggested_actions.slice(0, 3).map((a: any, i: number) => (
                      <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                        {a.title}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-11 md:h-7 text-xs md:text-[10px] gap-1 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkHandled(item.id);
                }}
              >
                <Check className="h-3 w-3" />
                Håndtert
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
