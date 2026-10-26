import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CalendarCheck,
  ListChecks,
  AlertTriangle,
  ClipboardList,
  ArrowRight,
  Clock,
  FileText,
  Users,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { invokeWithSession } from "@/lib/invoke-session";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

interface ProjectDashboardProps {
  jobId: string;
  technicianNames: string[];
  start: Date;
  end: Date;
  logs: Array<{
    id: string;
    action_type: string;
    change_summary: string | null;
    timestamp: string;
  }>;
  onNavigateTab: (tab: string) => void;
}

interface NextActivity {
  title: string;
  scheduled_date: string | null;
  start_time: string | null;
}

export function ProjectDashboard({
  jobId,
  technicianNames,
  start,
  end,
  logs,
  onNavigateTab,
}: ProjectDashboardProps) {
  const [nextActivity, setNextActivity] = useState<NextActivity | null>(null);
  const [openTasks, setOpenTasks] = useState(0);
  const [overdueTasks, setOverdueTasks] = useState(0);
  const [riskCount, setRiskCount] = useState(0);
  const [criticalRiskCount, setCriticalRiskCount] = useState(0);
  const [formCounts, setFormCounts] = useState({ not_started: 0, in_progress: 0, completed: 0, signed: 0 });
  const [recentDocs, setRecentDocs] = useState<Array<{ id: string; file_name: string; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(false);

  const resendJobInfo = async () => {
    setResending(true);
    try {
      const { data, error } = await invokeWithSession("create-approval", { body: { job_id: jobId, resend: true } });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error);
      const results: any[] = (data as any)?.results || [];
      const sent = results.filter((r) => r.emailSent).length;
      const failed = results.filter((r) => !r.emailSent);
      if (sent > 0 && failed.length === 0) toast.success(`Jobbinfo med vedlegg sendt til ${sent} montør(er)`);
      else if (sent > 0) toast.warning(`Sendt til ${sent}, men ${failed.length} feilet`);
      else toast.error("E-post ble ikke sendt", { description: "Logg inn på nytt med Microsoft og prøv igjen." });
    } catch (e: any) {
      toast.error("Kunne ikke sende jobbinfo", { description: e?.message });
    } finally {
      setResending(false);
    }
  };

  const fetchData = useCallback(async () => {
    const today = new Date().toISOString().split("T")[0];

    // Parallel fetches
    const [tasksRes, risksRes, formsRes, docsRes] = await Promise.all([
      supabase
        .from("job_tasks")
        .select("id, title, status, scheduled_date, start_time")
        .eq("job_id", jobId)
        .order("scheduled_date", { ascending: true }),
      supabase
        .from("job_risk_items")
        .select("id, severity, status")
        .eq("job_id", jobId)
        .eq("status", "open"),
      supabase
        .from("form_instances")
        .select("id, status")
        .eq("project_id", jobId),
      supabase
        .from("documents")
        .select("id, file_name, created_at")
        .eq("entity_id", jobId)
        .eq("entity_type", "job")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

    // Tasks
    if (tasksRes.data) {
      const pending = tasksRes.data.filter((t: any) => t.status !== "completed");
      setOpenTasks(pending.length);
      setOverdueTasks(pending.filter((t: any) => t.scheduled_date && t.scheduled_date < today).length);
      const upcoming = pending.find((t: any) => t.scheduled_date && t.scheduled_date >= today);
      setNextActivity(upcoming ? { title: upcoming.title, scheduled_date: upcoming.scheduled_date, start_time: upcoming.start_time } : null);
    }

    // Risks
    if (risksRes.data) {
      setRiskCount(risksRes.data.length);
      setCriticalRiskCount(risksRes.data.filter((r: any) => r.severity === "critical" || r.severity === "high").length);
    }

    // Forms
    if (formsRes.data) {
      const counts = { not_started: 0, in_progress: 0, completed: 0, signed: 0 };
      formsRes.data.forEach((f: any) => {
        if (f.status in counts) counts[f.status as keyof typeof counts]++;
      });
      setFormCounts(counts);
    }

    // Docs
    if (docsRes.data) setRecentDocs(docsRes.data as any);

    setLoading(false);
  }, [jobId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="py-12 flex justify-center"><Clock className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const totalForms = formCounts.not_started + formCounts.in_progress + formCounts.completed + formCounts.signed;

  return (
    <div className="space-y-6">
      {/* Row 1: Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Next activity */}
        <SummaryCard
          icon={<CalendarCheck className="h-4 w-4 text-primary" />}
          iconBg="bg-primary/10"
          label="Neste aktivitet"
          onClick={() => onNavigateTab("plan")}
          cta="Åpne plan"
        >
          {nextActivity ? (
            <>
              <p className="text-sm font-semibold truncate">{nextActivity.title}</p>
              <p className="text-xs text-muted-foreground">
                {nextActivity.scheduled_date && format(new Date(nextActivity.scheduled_date), "EEE d. MMM", { locale: nb })}
                {nextActivity.start_time && ` kl. ${nextActivity.start_time.slice(0, 5)}`}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground/60">Ingen planlagte aktiviteter</p>
          )}
        </SummaryCard>

        {/* Open tasks */}
        <SummaryCard
          icon={<ListChecks className="h-4 w-4 text-primary" />}
          iconBg={openTasks > 0 ? "bg-accent/10" : "bg-success/10"}
          label="Åpne arbeidspakker"
          onClick={() => onNavigateTab("plan")}
          cta="Se arbeidspakker"
        >
          <p className="text-2xl font-bold leading-tight">{openTasks}</p>
          {overdueTasks > 0 && (
            <p className="text-xs text-destructive font-medium">{overdueTasks} forsinket</p>
          )}
        </SummaryCard>

        {/* Forms */}
        <SummaryCard
          icon={<ClipboardList className="h-4 w-4 text-primary" />}
          iconBg="bg-primary/10"
          label="Skjema-status"
          onClick={() => onNavigateTab("skjemaer")}
          cta="Se skjemaer"
        >
          {totalForms > 0 ? (
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {formCounts.signed > 0 && <span className="text-success font-medium">{formCounts.signed} signert</span>}
              {formCounts.completed > 0 && <span className="text-foreground">{formCounts.completed} ferdig</span>}
              {formCounts.in_progress > 0 && <span className="text-accent">{formCounts.in_progress} pågår</span>}
              {formCounts.not_started > 0 && <span className="text-muted-foreground">{formCounts.not_started} ikke startet</span>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground/60">Ingen skjemaer</p>
          )}
        </SummaryCard>

        {/* Risks */}
        <SummaryCard
          icon={<AlertTriangle className={`h-4 w-4 ${riskCount > 0 ? "text-destructive" : "text-success"}`} />}
          iconBg={riskCount > 0 ? "bg-destructive/10" : "bg-success/10"}
          label="Risiko"
          onClick={() => onNavigateTab("risiko")}
          cta="Se risikoer"
        >
          <p className="text-2xl font-bold leading-tight">{riskCount}</p>
          {criticalRiskCount > 0 && (
            <p className="text-xs text-destructive font-medium">{criticalRiskCount} kritisk/høy</p>
          )}
          {riskCount === 0 && <p className="text-xs text-muted-foreground/60">Ingen aktive</p>}
        </SummaryCard>
      </div>

      {/* Row 2: Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Plan & Resources */}
        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                Plan og ressurser
              </h3>
              <Button variant="ghost" size="sm" className="text-xs h-7 rounded-xl gap-1" onClick={() => onNavigateTab("plan")}>
                Åpne plan <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Periode</span>
                <span>{format(start, "d. MMM", { locale: nb })} – {format(end, "d. MMM yyyy", { locale: nb })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Montører</span>
                <span className="text-right">{technicianNames.length > 0 ? technicianNames.join(", ") : "Ingen tildelt"}</span>
              </div>
            </div>
            {technicianNames.length > 0 && (
              <Button variant="outline" size="sm" className="mt-4 w-full rounded-xl gap-2" disabled={resending} onClick={resendJobInfo}>
                <Send className="h-3.5 w-3.5" />
                {resending ? "Sender…" : "Send jobbinfo til montør på nytt"}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Recent Documents */}
        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Dokumenter
              </h3>
              <Button variant="ghost" size="sm" className="text-xs h-7 rounded-xl gap-1" onClick={() => onNavigateTab("dokumenter")}>
                Se alle <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
            {recentDocs.length > 0 ? (
              <div className="space-y-2">
                {recentDocs.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between text-sm">
                    <span className="truncate">{doc.file_name}</span>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">
                      {format(new Date(doc.created_at), "d. MMM", { locale: nb })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground/60">Ingen dokumenter lastet opp</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Recent activity – compact, max 5 entries */}
      {logs.length > 0 && (
        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Siste aktivitet
            </h3>
            <div className="space-y-1.5">
              {logs.slice(0, 5).map((log) => (
                <div key={log.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-1 w-1 rounded-full bg-border shrink-0" />
                  <span className="truncate flex-1">{log.change_summary || log.action_type}</span>
                  <span className="shrink-0 text-[10px]">
                    {format(new Date(log.timestamp), "d. MMM", { locale: nb })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── Summary Card Helper ── */
function SummaryCard({
  icon,
  iconBg,
  label,
  children,
  onClick,
  cta,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  cta: string;
}) {
  return (
    <Card
      className="rounded-2xl border-border/50 cursor-pointer hover:bg-secondary/30 transition-colors"
      onClick={onClick}
    >
      <CardContent className="py-4 px-4">
        <div className="flex items-start gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
            {icon}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
            {children}
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-border/30">
          <span className="text-xs text-primary font-medium flex items-center gap-1">
            {cta} <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
