import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useThreadParticipants } from "@/hooks/useThreadParticipants";
import { ThreadDetail } from "@/components/conversations/ThreadDetail";
import { ThreadParticipants } from "@/components/conversations/ThreadParticipants";
import { ThreadAdminActions } from "@/components/conversations/ThreadAdminActions";
import {
  ArrowLeft, Loader2, MessageSquare, Mail, Lock, Globe,
  AlertTriangle, Repeat, Gavel, XCircle, Link2, Mail as MailIcon,
  UserPlus, Users, ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ── Avatar helpers ── */
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

export default function ConversationDetailPage() {
  const { id: projectId, threadId } = useParams<{ id: string; threadId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [thread, setThread] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [linkedOffer, setLinkedOffer] = useState<any>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { participants } = useThreadParticipants(threadId || null);

  useEffect(() => {
    if (!threadId) return;
    (async () => {
      const { data } = await supabase
        .from("conversation_threads")
        .select("*")
        .eq("id", threadId)
        .single();
      setThread(data);
      setLoading(false);

      if (data?.linked_offer_id) {
        const { data: offer } = await supabase
          .from("offers")
          .select("id, offer_number, project_title")
          .eq("id", data.linked_offer_id)
          .maybeSingle();
        setLinkedOffer(offer);
      }
    })();
  }, [threadId]);

  useEffect(() => {
    if (!user || !projectId) return;
    (async () => {
      const { data } = await supabase.rpc("is_project_admin", {
        _auth_user_id: user.id,
        _project_id: projectId,
      });
      setIsAdmin(!!data);
    })();
  }, [user, projectId]);

  const toggleParticipantsOnly = async () => {
    if (!thread) return;
    const newValue = !thread.participants_only;
    const { error } = await (supabase as any)
      .from("conversation_threads")
      .update({ participants_only: newValue })
      .eq("id", thread.id);
    if (error) {
      toast.error("Kunne ikke endre tilgang");
    } else {
      setThread({ ...thread, participants_only: newValue });
      toast.success(newValue ? "Begrenset til deltakere" : "Åpen for alle med romtilgang");
    }
  };

  const toggleEmailEnabled = async () => {
    if (!thread) return;
    const newValue = !thread.email_enabled;
    const { error } = await (supabase as any)
      .from("conversation_threads")
      .update({ email_enabled: newValue })
      .eq("id", thread.id);
    if (error) {
      toast.error("Kunne ikke endre e-postinnstilling");
    } else {
      setThread({ ...thread, email_enabled: newValue });
      toast.success(newValue ? "E-postkopi aktivert" : "E-postkopi deaktivert");
    }
  };

  const handleThreadUpdate = (patch: Record<string, any>) => {
    setThread((prev: any) => prev ? { ...prev, ...patch } : prev);
    if (patch.linked_offer_id) {
      supabase
        .from("offers")
        .select("id, offer_number, project_title")
        .eq("id", patch.linked_offer_id)
        .maybeSingle()
        .then(({ data }) => setLinkedOffer(data));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-muted/40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-muted/40">
        <p className="text-muted-foreground">Samtale ikke funnet</p>
      </div>
    );
  }

  const isEmail = thread.thread_type === "email_thread";
  const isClosed = thread.status === "closed";
  const category = thread.thread_category || "normal";

  // Show max 4 avatars, then +N
  const visibleParticipants = participants.slice(0, 4);
  const extraCount = Math.max(0, participants.length - 4);

  return (
    <div className="min-h-dvh flex flex-col bg-muted/40">
      {/* Compact header */}
      <div className="sticky top-0 z-30 border-b border-border/30 bg-card/95 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-3">
          {/* Top row: back + title + actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/projects/${projectId}`)}
              className="flex items-center justify-center h-11 w-11 md:h-8 md:w-8 rounded-full hover:bg-muted/50 transition-colors cursor-pointer shrink-0"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-foreground truncate">{thread.title}</h1>
                {thread.participants_only && <Lock className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />}
                {category === "risk" && <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                {category === "change" && <Repeat className="h-3.5 w-3.5 text-warning shrink-0" />}
                {thread.is_formal_decision && <Gavel className="h-3.5 w-3.5 text-primary shrink-0" />}
                {isClosed && <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              </div>
            </div>

            {/* Member avatars strip */}
            <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
              <SheetTrigger asChild>
                <button className="flex items-center -space-x-1.5 cursor-pointer hover:opacity-80 transition-opacity shrink-0">
                  {visibleParticipants.map((p) => {
                    const name = p.full_name || p.display_name || p.email || "U";
                    return (
                      <div
                        key={p.id}
                        className={cn(
                          "h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold ring-2 ring-card",
                          avatarColor(name)
                        )}
                        title={name}
                      >
                        {initials(name)}
                      </div>
                    );
                  })}
                  {extraCount > 0 && (
                    <div className="h-7 w-7 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-bold ring-2 ring-card">
                      +{extraCount}
                    </div>
                  )}
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:w-[380px] pb-[max(1rem,env(safe-area-inset-bottom))]">
                <div className="space-y-6 mt-4">
                  {/* Participants */}
                  <ThreadParticipants
                    threadId={thread.id}
                    companyId={thread.company_id}
                    projectId={projectId!}
                    isAdmin={isAdmin}
                    allowParticipantsInvite={thread.allow_participants_invite ?? true}
                  />

                  {/* Thread settings */}
                  {isAdmin && (
                    <div className="space-y-3 pt-4 border-t border-border/20">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Innstillinger</p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {thread.participants_only ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                          <span>{thread.participants_only ? "Kun deltakere" : "Åpen for rom"}</span>
                        </div>
                        <Switch checked={thread.participants_only} onCheckedChange={toggleParticipantsOnly} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <MailIcon className="h-3 w-3" />
                          <span>E-postkopi</span>
                        </div>
                        <Switch checked={thread.email_enabled} onCheckedChange={toggleEmailEnabled} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <UserPlus className="h-3 w-3" />
                          <span>Deltakere kan invitere</span>
                        </div>
                        <Switch
                          checked={thread.allow_participants_invite ?? true}
                          onCheckedChange={async () => {
                            const newVal = !(thread.allow_participants_invite ?? true);
                            const { error } = await (supabase as any)
                              .from("conversation_threads")
                              .update({ allow_participants_invite: newVal })
                              .eq("id", thread.id);
                            if (error) {
                              toast.error("Kunne ikke endre innstilling");
                            } else {
                              setThread({ ...thread, allow_participants_invite: newVal });
                              toast.success(newVal ? "Delegert invitasjon aktivert" : "Delegert invitasjon deaktivert");
                            }
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Admin actions */}
                  {isAdmin && (
                    <div className="border-t border-border/20 pt-4">
                      <ThreadAdminActions
                        thread={thread}
                        isAdmin={isAdmin}
                        onUpdate={handleThreadUpdate}
                      />
                    </div>
                  )}

                  {/* Linked offer */}
                  {linkedOffer && (
                    <div className="border-t border-border/20 pt-4">
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 gap-1 border-primary/20 text-primary">
                        <Link2 className="h-2.5 w-2.5" />
                        Tilbud {linkedOffer.offer_number || linkedOffer.project_title}
                      </Badge>
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>

            {/* Admin actions in header for quick access */}
            {isAdmin && (
              <ThreadAdminActions
                thread={thread}
                isAdmin={isAdmin}
                onUpdate={handleThreadUpdate}
              />
            )}
          </div>

          {/* Decision summary */}
          {thread.is_formal_decision && thread.decision_summary && (
            <div className="mt-2 p-2.5 rounded-lg bg-primary/5 border border-primary/10 ml-11">
              <p className="text-xs font-medium text-primary flex items-center gap-1.5">
                <Gavel className="h-3 w-3" />
                Beslutning
              </p>
              <p className="text-xs text-foreground/80 mt-1">{thread.decision_summary}</p>
            </div>
          )}
        </div>
      </div>

      {/* Thread posts - full height */}
      <div className="flex-1 mx-auto max-w-3xl w-full">
        <div className="rounded-none sm:rounded-[14px] sm:border border-border bg-card sm:shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden sm:my-4 sm:mx-4 flex flex-col min-h-[calc(100dvh-120px)]">
          <ThreadDetail
            threadId={thread.id}
            threadTitle={thread.title}
            threadType={thread.thread_type}
            projectId={projectId!}
            companyId={thread.company_id}
            isClosed={isClosed}
            emailEnabled={thread.email_enabled}
          />
        </div>
      </div>
    </div>
  );
}
