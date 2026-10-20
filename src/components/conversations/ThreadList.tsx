import { useState } from "react";
import { useConversationThreads, type ConversationThread, type ThreadFilter } from "@/hooks/useConversations";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import {
  MessageSquare, Mail, Loader2, Plus, Lock,
  AlertTriangle, Repeat, Gavel, XCircle, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ThreadListProps {
  projectId: string;
}

const FILTERS: { key: ThreadFilter; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "risk", label: "Risiko" },
  { key: "change", label: "Endring" },
  { key: "decision", label: "Beslutning" },
  { key: "closed", label: "Lukkede" },
];

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700",
  "bg-purple-100 text-purple-700", "bg-teal-100 text-teal-700",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

export function ThreadList({ projectId }: ThreadListProps) {
  const [filter, setFilter] = useState<ThreadFilter>("all");
  const { threads, loading, refresh } = useConversationThreads(projectId, filter);
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState<ConversationThread | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await (supabase as any)
      .from("conversation_threads")
      .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id })
      .eq("id", deleteTarget.id);
    if (error) {
      toast.error("Kunne ikke slette samtalen");
    } else {
      toast.success("Samtale flyttet til papirkurv");
      refresh();
    }
    setDeleting(false);
    setDeleteTarget(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <Button
          onClick={() => navigate(`/projects/${projectId}/conversations/new`)}
          className="gap-2 rounded-xl h-10 text-sm font-semibold shrink-0"
        >
          <Plus className="h-4 w-4" />
          Ny samtale
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer",
              filter === f.key
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted/60"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {threads.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <MessageSquare className="h-10 w-10 text-muted-foreground/30 mx-auto" />
          <p className="text-muted-foreground text-sm">
            {filter === "all" ? "Ingen samtaler ennå." : "Ingen treff for dette filteret."}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {threads.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              onClick={() => navigate(`/projects/${projectId}/conversations/${thread.id}`)}
              canDelete={isAdmin}
              onDelete={() => setDeleteTarget(thread)}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Flytt samtale til papirkurv?</AlertDialogTitle>
            <AlertDialogDescription>
              «{deleteTarget?.title}» flyttes til papirkurv og kan gjenopprettes derfra.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Flytt til papirkurv
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ThreadRow({ thread, onClick, canDelete, onDelete }: { thread: ConversationThread; onClick: () => void; canDelete?: boolean; onDelete?: () => void }) {
  const isClosed = thread.status === "closed";
  const category = thread.thread_category;
  const authorName = thread.last_author_name || "";
  const firstName = authorName.split(" ")[0] || "";
  const color = avatarColor(authorName || thread.title);
  const ini = initials(authorName || thread.title);

  // Derive time display
  const timeAgo = formatDistanceToNow(new Date(thread.last_activity_at), { addSuffix: false, locale: nb });

  return (
    <div className="group relative flex items-center">
      <button
        onClick={onClick}
        className={cn(
          "flex items-center gap-3 w-full text-left px-4 py-3.5 transition-all rounded-xl cursor-pointer",
          "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isClosed && "opacity-60"
        )}
      >
        {/* Avatar */}
        <div className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full text-[12px] font-bold shrink-0",
          color
        )}>
          {ini}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <h4 className={cn(
                "text-sm font-semibold truncate",
                isClosed ? "text-muted-foreground" : "text-foreground"
              )}>
                {thread.title}
              </h4>
              {thread.participants_only && !isClosed && (
                <Lock className="h-3 w-3 text-muted-foreground/50 shrink-0" />
              )}
              {category === "risk" && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}
              {category === "change" && <Repeat className="h-3 w-3 text-amber-500 shrink-0" />}
              {thread.is_formal_decision && <Gavel className="h-3 w-3 text-primary shrink-0" />}
              {isClosed && <XCircle className="h-3 w-3 text-muted-foreground shrink-0" />}
            </div>
            <span className="text-[11px] text-muted-foreground/60 shrink-0 whitespace-nowrap">{timeAgo}</span>
          </div>

          <p className="text-[13px] text-muted-foreground truncate mt-0.5">
            {firstName ? (
              <>
                <span className="text-foreground/70 font-medium">{firstName}:</span>{" "}
                <span>{thread.post_count} melding{thread.post_count !== 1 ? "er" : ""}</span>
              </>
            ) : (
              <span>{thread.post_count} melding{thread.post_count !== 1 ? "er" : ""}</span>
            )}
          </p>
        </div>

        {thread.post_count > 0 && !isClosed && (
          <div className="flex items-center shrink-0">
            <Badge variant="secondary" className="h-5 min-w-[20px] text-[10px] font-bold px-1.5 rounded-full bg-primary/10 text-primary border-0">
              {thread.post_count}
            </Badge>
          </div>
        )}
      </button>

      {/* Delete button on hover */}
      {canDelete && onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute right-2 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity p-2.5 md:p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
          title="Slett samtale"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
