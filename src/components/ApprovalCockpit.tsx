import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Bell, BellOff, Clock, Check, AlertTriangle, Zap,
  Pause, Play, CheckCircle2, History, Send, ChevronDown, TrendingUp, TrendingDown, AlertCircle
} from "lucide-react";
import { getNextReminderInfo, type ApprovalSummary } from "@/hooks/useApprovalSummaries";
import type { TechApproval } from "@/hooks/useJobApprovals";
import { useTechnicianInsights } from "@/hooks/useTechnicianInsights";

const PROFILE_LABELS: Record<string, string> = {
  standard: "Standard",
  urgent: "Haster",
  none: "Ingen",
  company_default: "Selskapsstandard",
  custom: "Egendefinert",
};

interface TimelineEntry {
  timestamp: string;
  label: string;
  type: "info" | "reminder" | "response" | "action";
}

interface Props {
  jobId: string;
  eventStart: Date;
  summary: ApprovalSummary;
  approvals: TechApproval[];
  onRefresh: () => void;
  readOnly?: boolean;
}

export function ApprovalCockpit({ jobId, eventStart, summary, approvals, onRefresh, readOnly }: Props) {
  const [sending, setSending] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [showTimeline, setShowTimeline] = useState(false);

  const s = summary;
  const nextReminder = getNextReminderInfo(s, eventStart);
  const allApproved = s.approved === s.total;
  const hasDeclined = s.declined > 0;
  const hasChange = s.changeRequest > 0;
  const hasPending = s.pending > 0;
  const isPaused = approvals.some((a) => a.status === "pending" && a.remindersPaused);
  const hoursUntilStart = (eventStart.getTime() - Date.now()) / (1000 * 60 * 60);
  const isRisk = hasPending && hoursUntilStart > 0 && hoursUntilStart < 12;

  // Tech insights
  const techUserIds = useMemo(() => approvals.map(a => a.technicianUserId), [approvals]);
  const { insights } = useTechnicianInsights(techUserIds);

  // Build timeline from approvals + event_logs
  const loadTimeline = useCallback(async () => {
    const entries: TimelineEntry[] = [];

    // Add approval creation
    for (const a of approvals) {
      entries.push({
        timestamp: a.createdAt || "",
        label: `Forespørsel sendt til ${a.technicianName}`,
        type: "info",
      });
      if (a.respondedAt) {
        const statusLabel = a.status === "approved" ? "Godkjent" : a.status === "declined" ? "Avslått" : a.status === "change_request" ? "Foreslått nytt tidspunkt" : a.status;
        entries.push({
          timestamp: a.respondedAt,
          label: `${a.technicianName}: ${statusLabel}${a.comment ? ` – "${a.comment}"` : ""}`,
          type: "response",
        });
      }
    }

    // Fetch reminder + assignment/notification logs from event_logs
    const REMINDER_ACTIONS = ["reminder_sent", "manual_reminder", "reminders_paused", "reminders_resumed", "marked_followed_up", "profile_changed"];
    const ASSIGNMENT_ACTIONS = [
      "technician_added", "technician_removed", "technician_assigned",
      "technician_assignment_changed", "technician_unplanned",
      "approval_reset", "notifications_sent", "time_changed",
    ];
    const { data: logs } = await supabase
      .from("event_logs")
      .select("timestamp, action_type, change_summary")
      .eq("event_id", jobId)
      .in("action_type", [...REMINDER_ACTIONS, ...ASSIGNMENT_ACTIONS])
      .order("timestamp", { ascending: true });

    for (const log of logs || []) {
      entries.push({
        timestamp: log.timestamp,
        label: log.change_summary || log.action_type,
        type: REMINDER_ACTIONS.includes(log.action_type) ? "reminder" : "action",
      });
    }

    entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    setTimeline(entries);
  }, [jobId, approvals]);

  useEffect(() => {
    if (showTimeline) loadTimeline();
  }, [showTimeline, loadTimeline]);

  // ── ACTIONS ──

  const handleSendReminder = async () => {
    setSending(true);
    try {
      // Update all pending approvals: bump reminder_count, set last_reminded_at
      const pendingApprovals = approvals.filter((a) => a.status === "pending");
      if (pendingApprovals.length === 0) {
        toast.info("Ingen montører venter på svar");
        return;
      }

      // Invoke the edge function for a single job
      const { data, error } = await supabase.functions.invoke("approval-reminder", {
        body: { jobId, manual: true },
      });

      if (error) throw error;
      
      await supabase.from("event_logs").insert({
        event_id: jobId,
        action_type: "manual_reminder",
        change_summary: `Manuell påminnelse sendt til ${pendingApprovals.length} montør(er)`,
      });

      toast.success("Påminnelse sendt");
      onRefresh();
    } catch (err: any) {
      toast.error("Kunne ikke sende påminnelse: " + (err.message || "Ukjent feil"));
    } finally {
      setSending(false);
    }
  };

  const handlePauseToggle = async () => {
    const newPaused = !isPaused;
    try {
      const { error } = await supabase
        .from("job_approvals")
        .update({ reminders_paused: newPaused } as any)
        .eq("job_id", jobId)
        .eq("status", "pending");

      if (error) throw error;

      await supabase.from("event_logs").insert({
        event_id: jobId,
        action_type: newPaused ? "reminders_paused" : "reminders_resumed",
        change_summary: newPaused ? "Påminnelser pauset" : "Påminnelser gjenopptatt",
      });

      toast.success(newPaused ? "Påminnelser pauset" : "Påminnelser gjenopptatt");
      onRefresh();
    } catch (err: any) {
      toast.error("Feil: " + err.message);
    }
  };

  const handleRestart = async () => {
    try {
      const { error } = await supabase
        .from("job_approvals")
        .update({
          reminder_count: 0,
          last_reminded_at: null,
          reminders_paused: false,
        } as any)
        .eq("job_id", jobId)
        .eq("status", "pending");

      if (error) throw error;

      await supabase.from("event_logs").insert({
        event_id: jobId,
        action_type: "reminders_resumed",
        change_summary: "Påminnelser startet på nytt (teller nullstilt)",
      });

      toast.success("Påminnelser startet på nytt");
      onRefresh();
    } catch (err: any) {
      toast.error("Feil: " + err.message);
    }
  };

  const handleMarkFollowedUp = async () => {
    try {
      const { error } = await supabase
        .from("job_approvals")
        .update({ response_required: false } as any)
        .eq("job_id", jobId)
        .eq("status", "pending");

      if (error) throw error;

      await supabase.from("event_logs").insert({
        event_id: jobId,
        action_type: "marked_followed_up",
        change_summary: "Markert som fulgt opp – ingen videre påminnelser",
      });

      toast.success("Markert som fulgt opp");
      onRefresh();
    } catch (err: any) {
      toast.error("Feil: " + err.message);
    }
  };

  const handleProfileChange = async (profile: string) => {
    try {
      const updateData: any = { reminder_profile: profile };
      if (profile === "none") {
        updateData.response_required = false;
      }

      const { error } = await supabase
        .from("job_approvals")
        .update(updateData)
        .eq("job_id", jobId)
        .eq("status", "pending");

      if (error) throw error;

      await supabase.from("event_logs").insert({
        event_id: jobId,
        action_type: "profile_changed",
        change_summary: `Påminnelsesprofil endret til ${PROFILE_LABELS[profile] || profile}`,
      });

      toast.success("Profil oppdatert");
      onRefresh();
    } catch (err: any) {
      toast.error("Feil: " + err.message);
    }
  };

  return (
    <div className={cn(
      "rounded-lg border p-3 space-y-3",
      allApproved ? "border-emerald-500/30 bg-emerald-500/5" :
      hasDeclined ? "border-destructive/30 bg-destructive/5" :
      hasChange ? "border-blue-500/30 bg-blue-500/5" :
      "border-amber-500/30 bg-amber-500/5"
    )}>
      {/* ── STATUS HEADER ── */}
      <div className="flex items-center gap-2">
        {allApproved ? (
          <Check className="h-4 w-4 text-emerald-600 shrink-0" />
        ) : hasDeclined ? (
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
        ) : (
          <Clock className="h-4 w-4 text-amber-600 shrink-0" />
        )}
        <span className="text-sm font-semibold">
          {allApproved
            ? "Alle montører har godkjent"
            : hasDeclined
              ? `Avslått av ${s.declined} montør`
              : `Venter på svar (${s.approved}/${s.total} godkjent)`}
        </span>
        {s.reminderProfile === "urgent" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-[10px] font-semibold">
            <Zap className="h-2.5 w-2.5" /> Haster
          </span>
        )}
        {isPaused && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px] font-semibold">
            <Pause className="h-2.5 w-2.5" /> Pauset
          </span>
        )}
      </div>

      {/* ── RISK BANNER ── */}
      {isRisk && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/30 px-2.5 py-1.5">
          <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
          <span className="text-[11px] font-semibold text-destructive">
            ⚠ Risiko – starter om {hoursUntilStart < 1 ? `${Math.round(hoursUntilStart * 60)} min` : `${Math.round(hoursUntilStart)}t`} uten fullt svar
          </span>
        </div>
      )}

      {/* ── NEXT REMINDER ── */}
      {hasPending && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Bell className="h-3 w-3 shrink-0" />
          {isPaused ? (
            <span>Påminnelser er pauset</span>
          ) : nextReminder.nextAt ? (
            <span>Neste påminnelse kl {format(nextReminder.nextAt, "HH:mm")}</span>
          ) : (
            <span>{nextReminder.label}</span>
          )}
        </div>
      )}

      {/* ── TECH INSIGHTS ── */}
      {approvals.filter(a => a.status === "pending").length > 0 && (
        <div className="space-y-0.5">
          {approvals.filter(a => a.status === "pending").map(a => {
            const insight = insights.get(a.technicianUserId);
            if (!insight || !insight.label) return null;
            return (
              <div key={a.technicianUserId} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                {insight.label === "Svarer raskt" ? (
                  <TrendingUp className="h-2.5 w-2.5 text-emerald-500 shrink-0" />
                ) : (
                  <TrendingDown className="h-2.5 w-2.5 text-amber-500 shrink-0" />
                )}
                <span>{a.technicianName.split(" ")[0]}: {insight.label}</span>
                {insight.avgResponseMinutes !== null && (
                  <span className="opacity-60">
                    (snitt {insight.avgResponseMinutes < 60
                      ? `${insight.avgResponseMinutes}m`
                      : `${Math.round(insight.avgResponseMinutes / 60)}t`})
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── PROFILE (inline change) ── */}
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-muted-foreground">Profil:</span>
        {readOnly ? (
          <span className="font-medium">{PROFILE_LABELS[s.reminderProfile || "standard"]}</span>
        ) : (
          <Select
            value={s.reminderProfile || "standard"}
            onValueChange={handleProfileChange}
          >
            <SelectTrigger className="h-6 w-auto min-w-[130px] text-[11px] border-none bg-transparent p-0 pl-1 gap-1 shadow-none focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PROFILE_LABELS).map(([k, label]) => (
                <SelectItem key={k} value={k} className="text-xs">{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {!s.responseRequired && (
          <span className="flex items-center gap-1 text-amber-600">
            <BellOff className="h-3 w-3" /> Ingen oppfølging
          </span>
        )}
      </div>

      {/* ── ACTION BUTTONS ── */}
      {!readOnly && hasPending && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Button
            variant="outline" size="sm"
            className="h-7 text-[11px] gap-1.5"
            onClick={handleSendReminder}
            disabled={sending}
          >
            <Send className="h-3 w-3" />
            {sending ? "Sender…" : "Send påminnelse nå"}
          </Button>

          {isPaused ? (
            <Button
              variant="outline" size="sm"
              className="h-7 text-[11px] gap-1.5"
              onClick={handleRestart}
            >
              <Play className="h-3 w-3" />
              Start på nytt
            </Button>
          ) : (
            <Button
              variant="outline" size="sm"
              className="h-7 text-[11px] gap-1.5"
              onClick={handlePauseToggle}
            >
              <Pause className="h-3 w-3" />
              Pause
            </Button>
          )}

          <Button
            variant="outline" size="sm"
            className="h-7 text-[11px] gap-1.5"
            onClick={handleMarkFollowedUp}
          >
            <CheckCircle2 className="h-3 w-3" />
            Fulgt opp
          </Button>
        </div>
      )}

      {/* ── TIMELINE TOGGLE ── */}
      <button
        type="button"
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors pt-1"
        onClick={() => setShowTimeline((v) => !v)}
      >
        <History className="h-3 w-3" />
        {showTimeline ? "Skjul historikk" : "Vis historikk"}
        <ChevronDown className={cn("h-3 w-3 transition-transform", showTimeline && "rotate-180")} />
      </button>

      {/* ── TIMELINE ── */}
      {showTimeline && (
        <div className="space-y-0 border-l-2 border-border/50 ml-1.5 pl-3">
          {timeline.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-1">Ingen historikk ennå</p>
          ) : (
            timeline.map((entry, i) => (
              <div key={i} className="relative pb-2 last:pb-0">
                <div className="absolute -left-[19px] top-1 h-2 w-2 rounded-full bg-border" />
                <p className="text-[10px] text-muted-foreground">
                  {format(new Date(entry.timestamp), "d. MMM HH:mm", { locale: nb })}
                </p>
                <p className="text-[11px]">{entry.label}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
