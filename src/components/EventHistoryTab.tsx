import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  Clock, UserPlus, UserMinus, Edit, Bell, BellOff, CheckCircle2, XCircle,
  CalendarPlus, Loader2, AlertTriangle, Link2, Paperclip, Zap, History,
  ArrowRight, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EventLogEntry {
  id: string;
  action_type: string;
  performed_by: string | null;
  performer_name: string | null;
  timestamp: string;
  change_summary: string | null;
  metadata: Record<string, any> | null;
}

interface ApprovalEntry {
  id: string;
  status: string;
  responded_at: string | null;
  created_at: string;
  comment: string | null;
  technician_user_id: string;
  tech_name?: string;
}

interface Props {
  eventId: string;
}

const ACTION_CONFIG: Record<string, { icon: typeof Clock; label: string; color: string }> = {
  created: { icon: CalendarPlus, label: "Opprettet", color: "text-green-600" },
  updated: { icon: Edit, label: "Oppdatert", color: "text-blue-600" },
  status_changed: { icon: ArrowRight, label: "Status endret", color: "text-amber-600" },
  time_changed: { icon: Clock, label: "Tid endret", color: "text-orange-600" },
  title_changed: { icon: Edit, label: "Tittel endret", color: "text-blue-500" },
  technician_added: { icon: UserPlus, label: "Montør lagt til", color: "text-green-600" },
  technician_removed: { icon: UserMinus, label: "Montør fjernet", color: "text-red-500" },
  technician_assigned: { icon: UserPlus, label: "Montør tildelt", color: "text-green-600" },
  technician_assignment_changed: { icon: UserPlus, label: "Montørplan endret", color: "text-indigo-600" },
  technician_unplanned: { icon: UserMinus, label: "Montør avplanlagt", color: "text-red-500" },
  notifications_sent: { icon: Bell, label: "Varsel sendt", color: "text-amber-500" },
  calendar_sync_requested: { icon: CalendarPlus, label: "Outlook-oppdatering", color: "text-blue-500" },
  description_changed: { icon: Edit, label: "Beskrivelse endret", color: "text-blue-500" },
  location_changed: { icon: Edit, label: "Sted endret", color: "text-blue-500" },
  manual_reminder: { icon: Bell, label: "Påminnelse sendt", color: "text-amber-500" },
  reminders_paused: { icon: BellOff, label: "Påminnelser pauset", color: "text-muted-foreground" },
  reminders_resumed: { icon: Bell, label: "Påminnelser gjenopptatt", color: "text-amber-500" },
  profile_changed: { icon: Zap, label: "Profil endret", color: "text-purple-600" },
  marked_followed_up: { icon: Shield, label: "Markert som fulgt opp", color: "text-muted-foreground" },
  attachment_added: { icon: Paperclip, label: "Vedlegg lagt til", color: "text-blue-500" },
  project_linked: { icon: Link2, label: "Koblet til prosjekt", color: "text-indigo-600" },
  approval_approved: { icon: CheckCircle2, label: "Godkjent", color: "text-green-600" },
  approval_declined: { icon: XCircle, label: "Avslått", color: "text-red-500" },
  approval_time_change: { icon: AlertTriangle, label: "Tidsendring foreslått", color: "text-amber-500" },
  approval_created: { icon: Bell, label: "Forespørsel sendt", color: "text-blue-500" },
  approval_reset: { icon: Clock, label: "Godkjenning tilbakestilt", color: "text-orange-500" },
};

function getConfig(actionType: string) {
  return ACTION_CONFIG[actionType] || { icon: History, label: actionType, color: "text-muted-foreground" };
}

export function EventHistoryTab({ eventId }: Props) {
  const [entries, setEntries] = useState<Array<{ type: "log" | "approval"; ts: string; data: any }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);

      // Fetch event_logs and job_approvals in parallel
      const [logsRes, approvalsRes] = await Promise.all([
        supabase
          .from("event_logs")
          .select("id, action_type, performed_by, performer_name, timestamp, change_summary, metadata")
          .eq("event_id", eventId)
          .order("timestamp", { ascending: false }),
        supabase
          .from("job_approvals")
          .select("id, status, responded_at, created_at, comment, technician_user_id")
          .eq("job_id", eventId),
      ]);

      if (cancelled) return;

      const logs: EventLogEntry[] = (logsRes.data as any[]) || [];
      const approvals: ApprovalEntry[] = (approvalsRes.data as any[]) || [];

      // Resolve performer names for logs missing performer_name
      const userIds = [...new Set([
        ...logs.filter(l => l.performed_by && !l.performer_name).map(l => l.performed_by!),
        ...approvals.map(a => a.technician_user_id),
      ])];

      let nameMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: people } = await supabase
          .from("user_accounts")
          .select("auth_user_id, people!inner(full_name)")
          .in("auth_user_id", userIds);
        if (people) {
          for (const p of people as any[]) {
            nameMap.set(p.auth_user_id, p.people?.full_name || "Ukjent");
          }
        }
      }

      if (cancelled) return;

      // Build unified timeline
      const timeline: Array<{ type: "log" | "approval"; ts: string; data: any }> = [];

      for (const log of logs) {
        timeline.push({
          type: "log",
          ts: log.timestamp,
          data: {
            ...log,
            performer_name: log.performer_name || (log.performed_by ? nameMap.get(log.performed_by) : null) || "System",
          },
        });
      }

      // Map approval statuses to timeline entries
      for (const appr of approvals) {
        const techName = nameMap.get(appr.technician_user_id) || "Montør";

        // Creation entry
        timeline.push({
          type: "approval",
          ts: appr.created_at,
          data: {
            action_type: "approval_created",
            performer_name: "System",
            change_summary: `Godkjenningsforespørsel sendt til ${techName}`,
          },
        });

        // Response entry
        if (appr.responded_at && appr.status !== "pending") {
          const actionType = appr.status === "approved" ? "approval_approved"
            : appr.status === "declined" ? "approval_declined"
            : appr.status === "time_change" ? "approval_time_change"
            : "updated";
          timeline.push({
            type: "approval",
            ts: appr.responded_at,
            data: {
              action_type: actionType,
              performer_name: techName,
              change_summary: appr.status === "approved"
                ? `${techName} godkjente oppdraget`
                : appr.status === "declined"
                ? `${techName} avslo oppdraget${appr.comment ? `: "${appr.comment}"` : ""}`
                : `${techName} foreslo tidsendring${appr.comment ? `: "${appr.comment}"` : ""}`,
            },
          });
        }
      }

      // Sort by timestamp descending (newest first)
      timeline.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

      setEntries(timeline);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [eventId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <History className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-sm">Ingen historikk registrert ennå</p>
      </div>
    );
  }

  return (
    <div className="space-y-0 relative">
      {/* Vertical timeline line */}
      <div className="absolute left-[15px] top-4 bottom-4 w-px bg-border/60" />

      {entries.map((entry, i) => {
        const config = getConfig(entry.data.action_type);
        const Icon = config.icon;
        const ts = new Date(entry.ts);

        return (
          <div key={`${entry.type}-${i}`} className="flex gap-3 py-2.5 relative">
            {/* Icon circle */}
            <div className={cn(
              "flex-shrink-0 w-[31px] h-[31px] rounded-full border-2 border-background bg-card flex items-center justify-center z-10",
              config.color
            )}>
              <Icon className="h-3.5 w-3.5" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pt-0.5">
              <p className="text-sm leading-snug">
                <span className="font-medium text-foreground">{entry.data.performer_name}</span>
                {" "}
                <span className="text-muted-foreground">
                  {entry.data.change_summary || config.label}
                </span>
              </p>

              {/* Metadata details */}
              {entry.data.metadata && (
                <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                  {entry.data.metadata.old_time && entry.data.metadata.new_time && (
                    <p>
                      <span className="line-through opacity-60">{entry.data.metadata.old_time}</span>
                      {" → "}
                      <span className="font-medium text-foreground">{entry.data.metadata.new_time}</span>
                    </p>
                  )}
                  {entry.data.metadata.old_title && entry.data.metadata.new_title && (
                    <p>
                      <span className="line-through opacity-60">{entry.data.metadata.old_title}</span>
                      {" → "}
                      <span className="font-medium text-foreground">{entry.data.metadata.new_title}</span>
                    </p>
                  )}
                  {entry.data.metadata.added_names && (
                    <p className="text-green-600">+ {entry.data.metadata.added_names.join(", ")}</p>
                  )}
                  {entry.data.metadata.removed_names && (
                    <p className="text-red-500">− {entry.data.metadata.removed_names.join(", ")}</p>
                  )}
                </div>
              )}

              {/* Timestamp */}
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                {format(ts, "d. MMM yyyy 'kl.' HH:mm", { locale: nb })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
