
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  ShieldCheck, AlertTriangle, Clock, Users,
  FileCheck, FileWarning, Inbox, FileBarChart2, ArrowRight,
  Smartphone, ShieldAlert,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HandbookAckStatusCard } from "@/components/hms/HandbookAckStatusCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface KpiCard {
  title: string;
  value: number | string;
  hint: string;
  href: string;
  icon: React.ElementType;
  tone: "ok" | "warn" | "alert" | "neutral";
}

interface ActionRow {
  id: string;
  title: string;
  detail: string;
  severity: "info" | "warning" | "critical";
  due?: string | null;
  href: string;
  cta: string;
}

export default function HmsOverviewPage() {
  const { activeCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  // Montør on mobile → operative HMS flow
  if (isMobile && user?.role === "montør") {
    return <Navigate to="/hms/mobile" replace />;
  }


  const { data, isLoading } = useQuery({
    queryKey: ["hms-overview-v2", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const cid = activeCompanyId!;
      const sb = supabase as any;
      const countOf = async (p: any): Promise<number> => {
        const { count } = await p;
        return count ?? 0;
      };

      const since7 = new Date(Date.now() - 7 * 86400000).toISOString();

      const [
        handbooks, openAlerts, criticalAlerts, pendingOvertime, openActions,
        profiles, pendingReview, submitted7d, importBatchesIssues, missingProfiles,
        openIncidents, criticalIncidents, overdueActions, unassignedIncidents,
      ] = await Promise.all([
        countOf(sb.from("hms_handbooks").select("id", { count: "exact", head: true }).eq("company_id", cid).is("deleted_at", null)),
        countOf(sb.from("worktime_alerts").select("id", { count: "exact", head: true }).eq("company_id", cid).eq("status", "open")),
        countOf(sb.from("worktime_alerts").select("id", { count: "exact", head: true }).eq("company_id", cid).eq("status", "open").eq("severity", "critical")),
        countOf(sb.from("overtime_approvals").select("id", { count: "exact", head: true }).eq("company_id", cid).eq("status", "pending")),
        countOf(sb.from("hms_action_items").select("id", { count: "exact", head: true }).eq("company_id", cid).in("status", ["open", "in_progress"]).is("deleted_at", null)),
        countOf(sb.from("employee_work_profiles").select("id", { count: "exact", head: true }).eq("company_id", cid).eq("is_active", true)),
        countOf(sb.from("hms_submissions").select("id", { count: "exact", head: true }).eq("company_id", cid).eq("status", "submitted").is("deleted_at", null)),
        countOf(sb.from("hms_submissions").select("id", { count: "exact", head: true }).eq("company_id", cid).gte("submitted_at", since7).is("deleted_at", null)),
        countOf(sb.from("worktime_import_batches").select("id", { count: "exact", head: true }).eq("company_id", cid).gt("skipped_rows", 0)),
        countOf(sb.from("user_accounts").select("id", { count: "exact", head: true }).eq("is_active", true)),
        countOf(sb.from("hms_incidents").select("id", { count: "exact", head: true }).eq("company_id", cid).is("deleted_at", null).not("status", "in", "(closed,rejected)")),
        countOf(sb.from("hms_incidents").select("id", { count: "exact", head: true }).eq("company_id", cid).is("deleted_at", null).in("severity", ["critical","high"]).not("status", "in", "(closed,rejected)")),
        countOf(sb.from("hms_action_items").select("id", { count: "exact", head: true }).eq("company_id", cid).in("status", ["open","in_progress"]).is("deleted_at", null).not("due_date", "is", null).lte("due_date", new Date().toISOString().slice(0,10))),
        countOf(sb.from("hms_incidents").select("id", { count: "exact", head: true }).eq("company_id", cid).is("deleted_at", null).is("assigned_to", null).not("status", "in", "(closed,rejected)")),
      ]);

      // ---- Krever handling ----
      const actions: ActionRow[] = [];

      const { data: critAlerts } = await sb
        .from("worktime_alerts")
        .select("id, title, explanation, why, severity, period_end, user_id")
        .eq("company_id", cid).eq("status", "open").eq("severity", "critical")
        .order("period_end", { ascending: false }).limit(5);
      for (const a of critAlerts ?? []) {
        actions.push({
          id: `alert-${a.id}`,
          title: a.title || "Kritisk AML-varsel",
          detail: a.explanation || a.why || "Krever umiddelbar oppfølging",
          severity: "critical",
          due: a.period_end,
          href: `/hms/aml/${a.user_id}`,
          cta: "Åpne",
        });
      }

      const { data: penOt } = await sb
        .from("overtime_approvals")
        .select("id, period_start, period_end, approved_hours, user_id")
        .eq("company_id", cid).eq("status", "pending")
        .order("created_at", { ascending: false }).limit(5);
      for (const o of penOt ?? []) {
        actions.push({
          id: `ot-${o.id}`,
          title: "Overtid venter godkjenning",
          detail: `${o.period_start} – ${o.period_end} · ${Number(o.approved_hours).toFixed(1)}t`,
          severity: "warning",
          href: "/hms/overtime",
          cta: "Behandle",
        });
      }

      const { data: pendSubs } = await sb
        .from("hms_submissions")
        .select("id, title, submitted_at")
        .eq("company_id", cid).eq("status", "submitted").is("deleted_at", null)
        .order("submitted_at", { ascending: false }).limit(5);
      for (const s of pendSubs ?? []) {
        actions.push({
          id: `sub-${s.id}`,
          title: s.title || "SJA / sjekkliste til godkjenning",
          detail: s.submitted_at ? `Sendt ${new Date(s.submitted_at).toLocaleDateString("nb-NO")}` : "Sendt fra felt",
          severity: "warning",
          href: `/hms/submissions/${s.id}`,
          cta: "Gjennomgå",
        });
      }

      const { data: rejSubs } = await sb
        .from("hms_submissions")
        .select("id, title, rejection_reason, updated_at")
        .eq("company_id", cid).eq("status", "rejected").is("deleted_at", null)
        .order("updated_at", { ascending: false }).limit(3);
      for (const s of rejSubs ?? []) {
        actions.push({
          id: `rej-${s.id}`,
          title: `Avvist: ${s.title || "innsending"}`,
          detail: s.rejection_reason || "Krever nytt forsøk fra felt",
          severity: "warning",
          href: `/hms/submissions/${s.id}`,
          cta: "Se",
        });
      }

      const { data: dueActions } = await sb
        .from("hms_action_items")
        .select("id, title, due_date, priority")
        .eq("company_id", cid).in("status", ["open", "in_progress"]).is("deleted_at", null)
        .not("due_date", "is", null)
        .lte("due_date", new Date().toISOString().slice(0, 10))
        .order("due_date").limit(5);
      for (const a of dueActions ?? []) {
        actions.push({
          id: `act-${a.id}`,
          title: a.title,
          detail: `Forfalt ${a.due_date}`,
          severity: a.priority === "high" ? "critical" : "warning",
          due: a.due_date,
          href: "/hms",
          cta: "Åpne",
        });
      }

      // (sort moved below, after HMS incidents pushed)


      // Top employees by open alerts
      const { data: openAlertRows } = await sb
        .from("worktime_alerts")
        .select("user_id, severity")
        .eq("company_id", cid)
        .in("status", ["open", "acknowledged"]);
      const perUser = new Map<string, { crit: number; warn: number; total: number }>();
      for (const a of openAlertRows ?? []) {
        const v = perUser.get(a.user_id) ?? { crit: 0, warn: 0, total: 0 };
        v.total++;
        if (a.severity === "critical") v.crit++;
        else if (a.severity === "warning") v.warn++;
        perUser.set(a.user_id, v);
      }
      const topUserIds = [...perUser.entries()]
        .sort((a, b) => (b[1].crit - a[1].crit) || (b[1].warn - a[1].warn) || (b[1].total - a[1].total))
        .slice(0, 5);
      let topNames: Record<string, string> = {};
      if (topUserIds.length > 0) {
        const { data: accs } = await sb
          .from("user_accounts")
          .select("auth_user_id, person:people!user_accounts_person_id_fkey(full_name, email)")
          .in("auth_user_id", topUserIds.map(([uid]) => uid));
        topNames = Object.fromEntries(
          (accs ?? []).map((a: any) => [a.auth_user_id, a.person?.full_name || a.person?.email || "Ukjent"])
        );
      }
      const topEmployees = topUserIds.map(([uid, c]) => ({ user_id: uid, name: topNames[uid] ?? "Ukjent", ...c }));

      // Critical/high open HMS incidents → Krever handling
      const { data: critIncidents } = await sb
        .from("hms_incidents")
        .select("id, title, severity, occurred_at, assigned_to, reported_by")
        .eq("company_id", cid).is("deleted_at", null)
        .in("severity", ["critical","high"])
        .not("status", "in", "(closed,rejected)")
        .order("occurred_at", { ascending: false }).limit(5);
      for (const x of critIncidents ?? []) {
        actions.push({
          id: `inc-${x.id}`,
          title: x.severity === "critical" ? `Kritisk HMS-avvik: ${x.title}` : `HMS-avvik (høy): ${x.title}`,
          detail: x.assigned_to ? "Under behandling" : "Ingen ansvarlig satt",
          severity: x.severity === "critical" ? "critical" : "warning",
          href: `/hms/incidents/${x.id}`,
          cta: "Åpne",
        });
      }

      // sort by severity
      const sevOrder = { critical: 0, warning: 1, info: 2 };
      actions.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

      return {
        handbooks, openAlerts, criticalAlerts, pendingOvertime, openActions,
        profiles, pendingReview, submitted7d, importBatchesIssues, missingProfiles,
        openIncidents, criticalIncidents, overdueActions, unassignedIncidents,
        actions: actions.slice(0, 10),
        topEmployees,
      };
    },
  });

  const cards: KpiCard[] = [
    { title: "Åpne HMS-avvik", value: data?.openIncidents ?? 0, hint: data?.unassignedIncidents ? `${data.unassignedIncidents} uten ansvarlig` : "Følges opp", href: "/hms/incidents", icon: ShieldAlert, tone: data?.openIncidents ? "warn" : "ok" },
    { title: "Kritiske HMS-avvik", value: data?.criticalIncidents ?? 0, hint: "Høy / kritisk åpen", href: "/hms/incidents?sev=critical", icon: ShieldAlert, tone: data?.criticalIncidents ? "alert" : "ok" },
    { title: "Forfalte HMS-tiltak", value: data?.overdueActions ?? 0, hint: "Frist passert", href: "/hms/incidents", icon: Clock, tone: data?.overdueActions ? "alert" : "ok" },
    { title: "Kritiske AML-varsler", value: data?.criticalAlerts ?? 0, hint: data?.openAlerts ? `${data.openAlerts} åpne totalt` : "Ingen åpne", href: "/hms/aml", icon: AlertTriangle, tone: data?.criticalAlerts ? "alert" : data?.openAlerts ? "warn" : "ok" },
    { title: "Overtid til godkjenning", value: data?.pendingOvertime ?? 0, hint: "Venter på leder", href: "/hms/overtime", icon: Clock, tone: data?.pendingOvertime ? "warn" : "ok" },
    { title: "Til godkjenning (SJA)", value: data?.pendingReview ?? 0, hint: "SJA / sjekklister fra felt", href: "/hms/submissions", icon: FileCheck, tone: data?.pendingReview ? "warn" : "ok" },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
            <ShieldCheck className="h-3.5 w-3.5" /> HMS &amp; HR
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Kontrollsenter</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Status på håndbøker, SJA, risiko og arbeidsmiljølovens grenser for MCS Service.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button asChild variant="default" size="sm" className="bg-rose-600 hover:bg-rose-700 text-white">
            <Link to="/hms/incidents/new"><ShieldAlert className="h-3.5 w-3.5 mr-1" /> Meld avvik</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/hms/mobile"><Smartphone className="h-3.5 w-3.5 mr-1" /> Mobil utfylling</Link>
          </Button>
          <Button asChild variant="outline" size="sm"><Link to="/hms/incidents">Avvik</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/hms/reports">Rapporter</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/hms/rulesets">Regelsett</Link></Button>
          <Button asChild size="sm"><Link to="/hms/aml">AML-status</Link></Button>
        </div>
      </div>

      {/* ---- Krever handling ---- */}
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Inbox className="h-4 w-4 text-primary" /> Krever handling
            {data?.actions.length ? (
              <Badge variant="outline" className="ml-1">{data.actions.length}</Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4">Laster…</p>
          ) : data?.actions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Ingenting krever handling akkurat nå. ✓
            </p>
          ) : (
            data?.actions.map((a) => (
              <Link
                key={a.id}
                to={a.href}
                className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2 hover:border-primary/40 transition group"
              >
                <div className={
                  a.severity === "critical" ? "h-2 w-2 rounded-full bg-destructive shrink-0"
                  : a.severity === "warning" ? "h-2 w-2 rounded-full bg-amber-500 shrink-0"
                  : "h-2 w-2 rounded-full bg-muted-foreground/40 shrink-0"
                } />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{a.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{a.detail}</div>
                </div>
                <Badge variant="outline" className="text-[10px] uppercase">{a.severity}</Badge>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition" />
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      {/* ---- KPI-kort ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map((c) => (
          <Link key={c.title} to={c.href} className="group">
            <Card className="h-full transition-all border-border/60 hover:border-primary/40 hover:shadow-sm">
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
                <c.icon className={
                  c.tone === "alert" ? "h-4 w-4 text-destructive"
                  : c.tone === "warn" ? "h-4 w-4 text-amber-500"
                  : c.tone === "ok" ? "h-4 w-4 text-emerald-500"
                  : "h-4 w-4 text-muted-foreground"
                } />
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-2xl font-semibold tracking-tight">{isLoading ? "–" : c.value}</div>
                <div className="text-xs text-muted-foreground">{c.hint}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* ---- HMS-status: dokumentbekreftelser ---- */}
      <HandbookAckStatusCard />

      <ChemicalStatusCard />


      {/* ---- Topp ansatte med åpne AML-varsler ---- */}
      {data?.topEmployees && data.topEmployees.length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Ansatte med flest åpne AML-varsler
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {data.topEmployees.map((u) => (
              <Link key={u.user_id} to={`/hms/aml/${u.user_id}`}
                className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2 hover:border-primary/40 transition">
                <div className="flex-1 min-w-0 text-sm font-medium truncate">{u.name}</div>
                {u.crit > 0 && <Badge variant="destructive" className="text-[10px]">{u.crit} kritisk</Badge>}
                {u.warn > 0 && <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600">{u.warn} adv</Badge>}
                <Badge variant="outline" className="text-[10px]">{u.total} totalt</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ---- Snarveier ---- */}
      <Card className="border-border/60">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Snarveier</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/hms/import">Importer timer</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/hms/import/batches">Importbatcher</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/hms/overtime">Overtidsgodkjenning</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/hms/templates">SJA-maler</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/hms/areas">Bransjeområder</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/hms/reports"><FileBarChart2 className="h-3.5 w-3.5 mr-1" />Rapporter</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}
