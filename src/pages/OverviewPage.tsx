import { MyPlanningTasks } from "@/components/planning/MyPlanningTasks";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, endOfDay, addDays, isPast, isToday } from "date-fns";
import { nb } from "date-fns/locale";
import {
  Loader2, ArrowRight, AlertTriangle, CalendarX, ShieldAlert,
  ChevronRight, Clock, Send, ListX, CalendarPlus, Plus,
  ClipboardList, TriangleAlert, CalendarDays, Inbox, ReceiptText,
  FolderKanban, ListChecks, Circle, AlertCircle, MapPin, User,
  CalendarCheck, Wrench, MessageSquare,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { JobStatus } from "@/lib/job-status";
import { Button } from "@/components/ui/button";
import { EventDrawer } from "@/components/EventDrawer";
import { fetchActiveLeads } from "@/lib/lead-queries";
import { useUnreadOrderMessages } from "@/hooks/useUnreadOrderMessages";
import { cn } from "@/lib/utils";

// ── Types ──

interface KpiMetric {
  label: string;
  value: number;
  icon: React.ReactNode;
  severity: "neutral" | "warning" | "critical";
  route: string;
}

interface PriorityItem {
  icon: React.ReactNode;
  label: string;
  count: number;
  severity: "critical" | "warning" | "info";
  route: string;
  description?: string;
}

interface DayBlock {
  id: string;
  start_at: string;
  end_at: string;
  title: string;
  project_id: string | null;
  project_title: string | null;
  location: string | null;
  technician_name: string | null;
}

interface TaskEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  project_type: string;
  status: string;
  customer: string | null;
}

interface ProjectCard {
  id: string;
  title: string;
  internal_number: string | null;
  customer: string;
  hasPlanned: boolean;
  taskCount: number;
}

export default function OverviewPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeCompanyId, allowedCompanyIds } = useCompanyContext();
  const { unreadSubmissionCount: orderMsgUnread } = useUnreadOrderMessages();
  const [loading, setLoading] = useState(true);
  const [showTaskDrawer, setShowTaskDrawer] = useState(false);

  // Data
  const [kpis, setKpis] = useState<KpiMetric[]>([]);
  const [priorities, setPriorities] = useState<PriorityItem[]>([]);
  const [dayBlocks, setDayBlocks] = useState<DayBlock[]>([]);
  const [tasks, setTasks] = useState<TaskEvent[]>([]);
  const [projects, setProjects] = useState<ProjectCard[]>([]);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const now = new Date();
    const dayStart = startOfDay(now).toISOString();
    const dayEnd = endOfDay(now).toISOString();
    const weekEnd = endOfDay(addDays(now, 7)).toISOString();
    const activeStatuses: JobStatus[] = ["requested", "approved", "scheduled", "in_progress", "time_change_proposed"];
    const d7 = new Date(now.getTime() - 7 * 86400000).toISOString();

    const techPromise = supabase
      .from("technicians").select("id").eq("user_id", user.id).maybeSingle();

    let projectQuery = supabase.from("events")
      .select("id, title, customer, status, internal_number")
      .in("status", activeStatuses)
      .neq("project_type", "task")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(6);
    if (activeCompanyId) projectQuery = projectQuery.eq("company_id", activeCompanyId);
    else if (allowedCompanyIds.length > 0) projectQuery = projectQuery.in("company_id", allowedCompanyIds);

    // All active projects for unplanned count
    let allProjQuery = supabase.from("events")
      .select("id")
      .in("status", ["approved", "in_progress", "scheduled"])
      .is("deleted_at", null);
    if (activeCompanyId) allProjQuery = allProjQuery.eq("company_id", activeCompanyId);
    else if (allowedCompanyIds.length > 0) allProjQuery = allProjQuery.in("company_id", allowedCompanyIds);

    // Today's jobs count
    let todayJobsQuery = supabase.from("events")
      .select("id", { count: "exact", head: true })
      .in("status", activeStatuses)
      .is("deleted_at", null)
      .gte("start_time", dayStart)
      .lt("start_time", dayEnd);
    if (activeCompanyId) todayJobsQuery = todayJobsQuery.eq("company_id", activeCompanyId);
    else if (allowedCompanyIds.length > 0) todayJobsQuery = todayJobsQuery.in("company_id", allowedCompanyIds);

    // Overbooked
    let overbookedQuery = supabase.from("schedule_blocks")
      .select("technician_id, start_at, end_at")
      .is("deleted_at", null)
      .gte("start_at", dayStart)
      .lt("start_at", dayEnd);
    if (activeCompanyId) overbookedQuery = overbookedQuery.eq("company_id", activeCompanyId);
    else if (allowedCompanyIds.length > 0) overbookedQuery = overbookedQuery.in("company_id", allowedCompanyIds);

    // Deviations
    const deviationsQuery = supabase.from("job_risk_items" as any).select("id").eq("status", "open");

    // Orders awaiting info
    let ordersQuery = supabase.from("order_form_submissions")
      .select("id", { count: "exact", head: true })
      .in("status", ["missing_info", "waiting_customer"]);
    if (activeCompanyId) ordersQuery = ordersQuery.eq("company_id", activeCompanyId);
    else if (allowedCompanyIds.length > 0) ordersQuery = ordersQuery.in("company_id", allowedCompanyIds);

    // Ready for invoicing
    let invoiceQuery = supabase.from("events")
      .select("id", { count: "exact", head: true })
      .eq("status", "ready_for_invoicing")
      .is("deleted_at", null);
    if (activeCompanyId) invoiceQuery = invoiceQuery.eq("company_id", activeCompanyId);
    else if (allowedCompanyIds.length > 0) invoiceQuery = invoiceQuery.in("company_id", allowedCompanyIds);

    // Sales data
    const leadsPromise = fetchActiveLeads("id, status, updated_at, next_action_type, next_action_date", activeCompanyId, allowedCompanyIds);
    let calcsQuery = supabase.from("calculations")
      .select("id, status, created_at")
      .is("deleted_at", null)
      .in("status", ["sent", "generated"])
      .limit(100);
    if (activeCompanyId) calcsQuery = calcsQuery.eq("company_id", activeCompanyId);
    else if (allowedCompanyIds.length > 0) calcsQuery = calcsQuery.in("company_id", allowedCompanyIds);

    const [
      techRes, projectsRes, allProjRes, todayJobsRes, overbookedRes,
      deviationsRes, ordersRes, invoiceRes, leadsRes, calcsRes,
    ] = await Promise.all([
      techPromise, projectQuery, allProjQuery, todayJobsQuery,
      overbookedQuery, deviationsQuery, ordersQuery, invoiceQuery, leadsPromise, calcsQuery,
    ]);

    const techId = techRes.data?.id;
    const rawProjects = (projectsRes.data || []) as Array<{
      id: string; title: string; customer: string; status: JobStatus; internal_number: string | null;
    }>;
    const projectIds = rawProjects.map(p => p.id);

    // My events for tasks
    let myEventsData: any[] = [];
    if (techId) {
      const { data: etData } = await supabase
        .from("event_technicians")
        .select("event_id, events!inner(id, title, start_time, end_time, project_type, status, customer)")
        .eq("technician_id", techId);
      const techEvents = (etData || []).map((et: any) => et.events).filter(Boolean);
      const { data: taskData } = await supabase
        .from("events")
        .select("id, title, start_time, end_time, project_type, status, customer")
        .eq("created_by", user.id)
        .eq("project_type", "task")
        .is("deleted_at", null)
        .gte("start_time", dayStart)
        .lte("start_time", weekEnd)
        .order("start_time", { ascending: true })
        .limit(20);
      const combined = [...techEvents, ...(taskData || [])];
      const seen = new Set<string>();
      myEventsData = combined.filter((e: any) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        const s = new Date(e.start_time);
        return s >= startOfDay(now) && s <= new Date(weekEnd);
      }).sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    } else {
      const { data } = await supabase
        .from("events")
        .select("id, title, start_time, end_time, project_type, status, customer")
        .eq("created_by", user.id)
        .is("deleted_at", null)
        .gte("start_time", dayStart)
        .lte("start_time", weekEnd)
        .order("start_time", { ascending: true })
        .limit(30);
      myEventsData = data || [];
    }

    // Day blocks for schedule
    let blocksData: any[] = [];
    if (techId) {
      const { data } = await supabase.from("schedule_blocks")
        .select("id, start_at, end_at, title, project_id, location, technicians!inner(name), events!schedule_blocks_project_id_fkey(title)")
        .eq("technician_id", techId)
        .is("deleted_at", null)
        .gte("start_at", dayStart)
        .lt("start_at", dayEnd)
        .order("start_at", { ascending: true })
        .limit(10);
      blocksData = data || [];
    }

    // Unplanned projects
    const allProjectIds = (allProjRes.data || []).map((p: any) => p.id);
    let unplannedCount = 0;
    if (allProjectIds.length > 0) {
      const { data: plannedBlocks } = await supabase
        .from("schedule_blocks")
        .select("project_id")
        .in("project_id", allProjectIds)
        .is("deleted_at", null)
        .gte("start_at", now.toISOString());
      const pIds = new Set((plannedBlocks || []).map((b: any) => b.project_id));
      unplannedCount = allProjectIds.filter((id: string) => !pIds.has(id)).length;
    }

    // Overbooked technicians
    const techHours: Record<string, number> = {};
    (overbookedRes.data || []).forEach((b: any) => {
      if (!b.technician_id) return;
      const hours = (new Date(b.end_at).getTime() - new Date(b.start_at).getTime()) / 3600000;
      techHours[b.technician_id] = (techHours[b.technician_id] || 0) + hours;
    });
    const overbookedCount = Object.values(techHours).filter(h => h > 8).length;
    const deviationCount = (deviationsRes.data || []).length;
    const ordersWaiting = ordersRes.count || 0;
    const readyForInvoicing = invoiceRes.count || 0;
    const todayJobs = todayJobsRes.count || 0;

    // Sales action items
    const leads = leadsRes.data || [];
    const calcs = calcsRes.data || [];
    const activeLeads = leads.filter((l: any) => !["won", "lost"].includes(l.status));
    const inactiveLeads = activeLeads.filter((l: any) => !l.updated_at || new Date(l.updated_at) < new Date(d7)).length;
    const leadsWithoutNextStep = activeLeads.filter((l: any) => !l.next_action_type && !l.next_action_date).length;
    const sentOffers = calcs.filter((c: any) => c.status === "sent");
    const offersOverdue = sentOffers.filter((c: any) => (now.getTime() - new Date(c.created_at).getTime()) / 86400000 > 5).length;

    // Task counts for project cards
    let tasksByProject: Record<string, number> = {};
    if (projectIds.length > 0) {
      const { data: tc } = await supabase.from("job_tasks").select("job_id, status").in("job_id", projectIds).neq("status", "completed");
      (tc || []).forEach((t: any) => { tasksByProject[t.job_id] = (tasksByProject[t.job_id] || 0) + 1; });
    }

    // Planned status for project cards
    let plannedProjectIds = new Set<string>();
    if (projectIds.length > 0) {
      const { data: pb } = await supabase.from("schedule_blocks")
        .select("project_id")
        .in("project_id", projectIds)
        .is("deleted_at", null)
        .gte("start_at", now.toISOString());
      plannedProjectIds = new Set((pb || []).map((b: any) => b.project_id).filter(Boolean));
    }

    // ── Set KPIs ──
    setKpis([
      { label: "Uplanlagte", value: unplannedCount, icon: <CalendarX className="h-4 w-4" />, severity: unplannedCount > 0 ? "warning" : "neutral", route: "/jobs" },
      { label: "Åpne avvik", value: deviationCount, icon: <ShieldAlert className="h-4 w-4" />, severity: deviationCount > 0 ? "critical" : "neutral", route: "/jobs" },
      { label: "Jobber i dag", value: todayJobs, icon: <CalendarDays className="h-4 w-4" />, severity: "neutral", route: "/projects/plan" },
      { label: "Venter på kunde", value: ordersWaiting, icon: <Inbox className="h-4 w-4" />, severity: ordersWaiting > 0 ? "warning" : "neutral", route: "/orders" },
      { label: "Forfalt oppfølging", value: offersOverdue, icon: <Clock className="h-4 w-4" />, severity: offersOverdue > 0 ? "warning" : "neutral", route: "/sales/offers" },
      { label: "Klar for faktura", value: readyForInvoicing, icon: <ReceiptText className="h-4 w-4" />, severity: "neutral", route: "/jobs" },
    ]);

    // ── Set Priorities ──
    const pItems: PriorityItem[] = [];
    if (unplannedCount > 0) pItems.push({ icon: <CalendarX className="h-4 w-4" />, label: "Prosjekter uten plan", count: unplannedCount, severity: "warning", route: "/jobs", description: "Aktive prosjekter uten planlagte kalenderblokker" });
    if (overbookedCount > 0) pItems.push({ icon: <AlertTriangle className="h-4 w-4" />, label: "Overbooking i dag", count: overbookedCount, severity: "critical", route: "/resource-plan", description: "Montører med over 8 timer planlagt" });
    if (deviationCount > 0) pItems.push({ icon: <ShieldAlert className="h-4 w-4" />, label: "Åpne avvik", count: deviationCount, severity: "critical", route: "/jobs", description: "Ubehandlede avvik krever oppfølging" });
    if (ordersWaiting > 0) pItems.push({ icon: <Inbox className="h-4 w-4" />, label: "Bestillinger venter på kundesvar", count: ordersWaiting, severity: "warning", route: "/orders" });
    if (offersOverdue > 0) pItems.push({ icon: <Send className="h-4 w-4" />, label: "Tilbud uten oppfølging", count: offersOverdue, severity: "warning", route: "/sales/offers" });
    if (inactiveLeads > 0) pItems.push({ icon: <Clock className="h-4 w-4" />, label: "Leads uten aktivitet > 7 dager", count: inactiveLeads, severity: "info", route: "/sales/leads" });
    if (leadsWithoutNextStep > 0) pItems.push({ icon: <ListX className="h-4 w-4" />, label: "Leads uten neste steg", count: leadsWithoutNextStep, severity: "info", route: "/sales/leads" });
    if (readyForInvoicing > 0) pItems.push({ icon: <ReceiptText className="h-4 w-4" />, label: "Klar for fakturering", count: readyForInvoicing, severity: "info", route: "/jobs" });
    setPriorities(pItems);

    // ── Set Day Blocks ──
    setDayBlocks(blocksData.map((b: any) => ({
      id: b.id, start_at: b.start_at, end_at: b.end_at, title: b.title,
      project_id: b.project_id, project_title: b.events?.title ?? null,
      location: b.location, technician_name: b.technicians?.name ?? null,
    })));

    // ── Set Tasks ──
    setTasks(myEventsData.map((e: any) => ({
      id: e.id, title: e.title, start_time: e.start_time, end_time: e.end_time,
      project_type: e.project_type || "project", status: e.status, customer: e.customer,
    })));

    // ── Set Projects ──
    setProjects(rawProjects.map(p => ({
      id: p.id, title: p.title, internal_number: p.internal_number,
      customer: p.customer, hasPlanned: plannedProjectIds.has(p.id),
      taskCount: tasksByProject[p.id] || 0,
    })));

    setLoading(false);
  }, [user, activeCompanyId, allowedCompanyIds]);

  useEffect(() => {
    if (!user) return;
    fetchAll();
  }, [user, fetchAll]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 10) return "God morgen";
    if (h < 17) return "Hei";
    return "God kveld";
  }, []);

  const firstName = user?.name?.split(" ")[0] || "";
  const weekNumber = format(new Date(), "w");
  const dateStr = format(new Date(), "EEEE d. MMMM", { locale: nb });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
          <p className="text-xs text-muted-foreground/50">Laster kontrollsenteret…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 pb-28 lg:pb-10">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-extrabold text-foreground tracking-tight leading-none">
            {greeting}, {firstName}
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1.5">
            {dateStr} · <span className="font-medium">Uke {weekNumber}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <QuickAction icon={<CalendarPlus className="h-3.5 w-3.5" />} label="Planlegg" onClick={() => navigate("/projects/plan")} />
          <QuickAction icon={<Plus className="h-3.5 w-3.5" />} label="Ny oppgave" onClick={() => setShowTaskDrawer(true)} />
          <QuickAction icon={<ClipboardList className="h-3.5 w-3.5" />} label="Ny bestilling" onClick={() => navigate("/orders")} />
          <QuickAction icon={<TriangleAlert className="h-3.5 w-3.5" />} label="Avvik" onClick={() => navigate("/jobs")} />
        </div>
      </div>

      <div className="mb-8"><MyPlanningTasks /></div>

      {/* ─── KPI Row ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3 mb-8">
        {kpis.map((kpi) => (
          <button
            key={kpi.label}
            onClick={() => navigate(kpi.route)}
            className={cn(
              "group relative rounded-2xl border p-4 sm:p-5 text-left transition-all duration-200",
              "hover:shadow-card-hover hover:-translate-y-0.5 cursor-pointer",
              kpi.severity === "critical"
                ? "bg-destructive/[0.03] border-destructive/15"
                : kpi.severity === "warning"
                  ? "bg-accent/[0.03] border-accent/15"
                  : "bg-card border-border/40",
            )}
          >
            <div className={cn(
              "flex items-center gap-1.5 mb-3",
              kpi.severity === "critical" ? "text-destructive" :
              kpi.severity === "warning" ? "text-accent" :
              "text-muted-foreground/60",
            )}>
              {kpi.icon}
            </div>
            <p className={cn(
              "text-[28px] sm:text-[32px] font-extrabold tracking-tight leading-none",
              kpi.value === 0 ? "text-muted-foreground/25" : "text-foreground",
            )}>
              {kpi.value}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1.5 leading-tight">{kpi.label}</p>
          </button>
        ))}
      </div>

      {/* ─── Priority Section ─── */}
      {(() => {
        const displayPriorities: PriorityItem[] = [...priorities];
        if (orderMsgUnread > 0) {
          displayPriorities.unshift({
            icon: <MessageSquare className="h-4 w-4" />,
            label: "Nye kundemeldinger på bestillinger",
            count: orderMsgUnread,
            severity: "critical",
            route: "/orders?filter=unread_messages",
            description: "Uleste meldinger fra bestiller/kunde",
          });
        }
        if (displayPriorities.length === 0) return null;
        return (
        <div className="mb-8">
          <SectionLabel title="Krever handling" />
          <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
            {displayPriorities.map((item, i) => (
              <button
                key={i}
                onClick={() => navigate(item.route)}
                className={cn(
                  "flex items-center gap-4 w-full px-5 py-4 text-left transition-all group cursor-pointer",
                  "hover:bg-primary/[0.03]",
                  i > 0 && "border-t border-border/30",
                )}
              >
                <div className={cn(
                  "h-9 w-9 rounded-xl flex items-center justify-center shrink-0",
                  item.severity === "critical" ? "bg-destructive/8 text-destructive" :
                  item.severity === "warning" ? "bg-accent/8 text-accent" :
                  "bg-muted/60 text-muted-foreground",
                )}>
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                    {item.label}
                  </p>
                  {item.description && (
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5 truncate">{item.description}</p>
                  )}
                </div>
                <span className={cn(
                  "text-xs font-bold font-mono px-2.5 py-1 rounded-lg shrink-0",
                  item.severity === "critical" ? "bg-destructive/8 text-destructive border border-destructive/15" :
                  item.severity === "warning" ? "bg-accent/8 text-accent border border-accent/15" :
                  "bg-muted text-muted-foreground border border-border/40",
                )}>
                  {item.count}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/15 group-hover:text-primary/40 shrink-0" />
              </button>
            ))}
          </div>
        </div>
        );
      })()}

      {/* ─── My Day + My Tasks ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 mb-8">
        {/* My Day */}
        <div>
          <SectionLabel title="Din dag" />
          <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
            {dayBlocks.length > 0 ? (
              <div className="divide-y divide-border/20">
                {dayBlocks.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => b.project_id && navigate(`/projects/${b.project_id}`)}
                    disabled={!b.project_id}
                    className="flex items-center gap-4 w-full px-5 py-4 text-left hover:bg-primary/[0.03] transition-colors group disabled:opacity-50 disabled:cursor-default cursor-pointer"
                  >
                    <div className="flex flex-col items-center w-14 shrink-0">
                      <span className="text-sm font-bold text-foreground tabular-nums">{format(new Date(b.start_at), "HH:mm")}</span>
                      <span className="text-[10px] text-muted-foreground/40 tabular-nums">{format(new Date(b.end_at), "HH:mm")}</span>
                    </div>
                    <div className="w-0.5 self-stretch rounded-full bg-primary/30 shrink-0 min-h-[28px]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                        {b.project_title || b.title}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5">
                        {b.location && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50 truncate">
                            <MapPin className="h-2.5 w-2.5 shrink-0" /> {b.location}
                          </span>
                        )}
                      </div>
                    </div>
                    {b.project_id && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/15 group-hover:text-primary/40 shrink-0" />}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-4 px-5 py-8">
                <div className="h-10 w-10 rounded-xl bg-muted/40 flex items-center justify-center shrink-0">
                  <CalendarDays className="h-5 w-5 text-muted-foreground/25" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground/50 font-medium">Ingen planlagte jobber i dag</p>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs shrink-0" onClick={() => navigate("/projects/plan")}>
                  <CalendarPlus className="h-3.5 w-3.5" /> Planlegg
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* My Tasks */}
        <div>
          <SectionLabel title="Mine gjøremål" count={tasks.length} />
          <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
            {tasks.length > 0 ? (
              <div className="divide-y divide-border/20">
                {tasks.slice(0, 8).map((ev) => {
                  const overdue = isPast(new Date(ev.end_time)) && ev.status !== "completed";
                  const isTask = ev.project_type === "task";
                  const isTaskToday = isToday(new Date(ev.start_time));
                  return (
                    <button
                      key={ev.id}
                      onClick={() => navigate(`/projects/${ev.id}`)}
                      className="flex items-center gap-3.5 w-full px-5 py-3.5 text-left hover:bg-primary/[0.03] transition-all group cursor-pointer"
                    >
                      {isTask ? (
                        <Circle className={cn("h-[16px] w-[16px] shrink-0 stroke-[2.5]", overdue ? "text-destructive" : "text-border")} />
                      ) : (
                        <CalendarDays className="h-[16px] w-[16px] shrink-0 text-primary/40" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{ev.title}</p>
                        <div className="flex items-center gap-2.5 mt-0.5">
                          <span className="text-[10px] text-muted-foreground/40 font-mono tabular-nums">
                            {format(new Date(ev.start_time), "HH:mm")}–{format(new Date(ev.end_time), "HH:mm")}
                          </span>
                          {!isTaskToday && (
                            <span className="text-[10px] text-muted-foreground/40">
                              {format(new Date(ev.start_time), "EEE d. MMM", { locale: nb })}
                            </span>
                          )}
                          {ev.customer && (
                            <span className="text-[10px] text-muted-foreground/30 flex items-center gap-0.5">
                              <User className="h-2.5 w-2.5" /> {ev.customer}
                            </span>
                          )}
                        </div>
                      </div>
                      {overdue && <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/10 group-hover:text-primary/40 shrink-0" />
                    </button>
                  );
                })}
                {/* Add task */}
                <button
                  onClick={() => setShowTaskDrawer(true)}
                  className="flex items-center gap-3.5 w-full px-5 py-3 text-left hover:bg-primary/[0.03] transition-colors text-muted-foreground/25 hover:text-primary cursor-pointer"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span className="text-sm font-medium">Legg til oppgave</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-4 px-5 py-8">
                <div className="h-10 w-10 rounded-xl bg-success/8 flex items-center justify-center shrink-0">
                  <ListChecks className="h-5 w-5 text-success/40" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground/50 font-medium">Ingen planlagte gjøremål</p>
                  <p className="text-[11px] text-muted-foreground/30 mt-0.5">Alt er i rute</p>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs shrink-0" onClick={() => setShowTaskDrawer(true)}>
                  <Plus className="h-3.5 w-3.5" /> Ny oppgave
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── My Projects ─── */}
      {projects.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <SectionLabel title="Mine prosjekter" count={projects.length} />
            <Button
              variant="ghost" size="sm"
              className="text-xs text-muted-foreground hover:text-primary gap-1 -mt-1"
              onClick={() => navigate("/jobs")}
            >
              Se alle <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate(`/projects/${p.id}`)}
                className="bg-card rounded-2xl border border-border/40 p-5 text-left
                  shadow-[var(--shadow-card)] hover:shadow-card-hover hover:-translate-y-0.5
                  transition-all duration-200 group cursor-pointer"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="h-9 w-9 rounded-xl bg-primary/6 flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                    <FolderKanban className="h-4.5 w-4.5 text-primary/70" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold text-foreground truncate group-hover:text-primary transition-colors leading-tight">
                      {p.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {p.internal_number && <span className="font-mono text-muted-foreground/60">#{p.internal_number}</span>}
                      {p.internal_number && p.customer && " · "}
                      {p.customer || "Ingen kunde"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {!p.hasPlanned && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2.5 py-0.5 bg-warning/8 text-warning">
                      <Clock className="h-2.5 w-2.5" /> Ikke planlagt
                    </span>
                  )}
                  {p.hasPlanned && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2.5 py-0.5 bg-primary/6 text-primary">
                      <CalendarCheck className="h-2.5 w-2.5" /> Planlagt
                    </span>
                  )}
                  {p.taskCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2.5 py-0.5 bg-accent/6 text-accent">
                      <ListChecks className="h-2.5 w-2.5" /> {p.taskCount}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Task Drawer */}
      <EventDrawer
        open={showTaskDrawer}
        onOpenChange={setShowTaskDrawer}
        onSaved={() => { setShowTaskDrawer(false); fetchAll(); }}
      />
    </div>
  );
}

// ── Shared sub-components ──

function SectionLabel({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60">{title}</h2>
      {count !== undefined && count > 0 && (
        <span className="text-[10px] font-mono font-semibold text-muted-foreground/40 bg-muted/50 px-1.5 py-0.5 rounded-md">{count}</span>
      )}
      <div className="flex-1 h-px bg-border/30" />
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-medium
        text-muted-foreground bg-card border border-border/40
        hover:bg-primary/5 hover:text-primary hover:border-primary/20
        transition-all duration-200 cursor-pointer"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
