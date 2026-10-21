import { HmsMobileBack } from "@/components/hms/HmsMobileBack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Search,
  ShieldCheck,
  Users,
  Upload,
  PlayCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useHmsEmployeeProfiles } from "@/components/hms/HmsContextGate";

type Severity = "info" | "warning" | "critical";

interface AlertRow {
  id: string;
  user_id: string;
  severity: Severity;
  status: string;
  rule_key: string | null;
  title: string | null;
  explanation: string | null;
  why: string | null;
  period_start: string | null;
  period_end: string | null;
  recommended_action: string | null;
}

type PeriodKey = "30d" | "90d" | "month" | "custom";

function isoWeekStart(d: Date): string {
  const dt = new Date(d);
  const day = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - day);
  return dt.toISOString().slice(0, 10);
}

function periodRange(p: PeriodKey, customFrom: string, customTo: string): { from: string; to: string } {
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  if (p === "30d") {
    const from = new Date(today); from.setDate(from.getDate() - 30);
    return { from: from.toISOString().slice(0, 10), to };
  }
  if (p === "90d") {
    const from = new Date(today); from.setDate(from.getDate() - 90);
    return { from: from.toISOString().slice(0, 10), to };
  }
  if (p === "month") {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: from.toISOString().slice(0, 10), to };
  }
  return { from: customFrom || "2000-01-01", to: customTo || to };
}

export default function HmsAmlPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { activeCompanyId } = useCompanyContext();
  const employeeProfilesQuery = useHmsEmployeeProfiles(activeCompanyId, !!activeCompanyId);
  const [q, setQ] = useState("");
  const [sevFilter, setSevFilter] = useState<"all" | Severity>("all");
  const [statusFilter, setStatusFilter] = useState<"open_ack" | "open" | "acknowledged" | "resolved" | "all">("open_ack");
  const [ruleFilter, setRuleFilter] = useState<string>("all");
  const [period, setPeriod] = useState<PeriodKey>("90d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [running, setRunning] = useState(false);

  const range = useMemo(() => periodRange(period, customFrom, customTo), [period, customFrom, customTo]);
  const employeeProfileMap = useMemo(() => new Map(
    (employeeProfilesQuery.data ?? []).map((p) => [p.user_id, { name: p.name ?? undefined, email: p.email ?? undefined, ext: p.external_employee_id ?? undefined }])
  ), [employeeProfilesQuery.data]);
  const employeeProfileVersion = useMemo(
    () => (employeeProfilesQuery.data ?? []).map((p) => `${p.user_id}:${p.name ?? ""}:${p.email ?? ""}:${p.external_employee_id ?? ""}`).sort().join("|"),
    [employeeProfilesQuery.data]
  );

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["hms-aml-v5", activeCompanyId, statusFilter, ruleFilter, range.from, range.to, employeeProfileVersion],
    enabled: !!activeCompanyId && !employeeProfilesQuery.isLoading,
    queryFn: async () => {
      const sb = supabase as any;

      let query = sb
        .from("worktime_alerts")
        .select(
          "id, user_id, severity, status, rule_key, title, explanation, why, period_start, period_end, value, threshold, recommended_action, updated_at"
        )
        .eq("company_id", activeCompanyId)
        .gte("period_end", range.from)
        .lte("period_start", range.to);
      if (statusFilter === "open_ack") query = query.in("status", ["open", "acknowledged"]);
      else if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (ruleFilter !== "all") query = query.eq("rule_key", ruleFilter);
      const { data: alerts } = await query;

      const { data: entries } = await sb
        .from("worktime_entries")
        .select("user_id, total_hours, hours_overtime, work_date, employee_name, external_employee_id")
        .eq("company_id", activeCompanyId)
        .gte("work_date", range.from)
        .lte("work_date", range.to)
        .not("user_id", "is", null);

      const today = new Date();
      const ot4wFrom = new Date(today); ot4wFrom.setDate(ot4wFrom.getDate() - 28);
      const ot4wFromStr = ot4wFrom.toISOString().slice(0, 10);

      type S = { hours: number; overtime: number; ot4w: number; lastDate: string | null; maxDay: { date: string; sum: number } | null; maxWeek: { ws: string; sum: number } | null };
      const stats = new Map<string, S>();
      const dayTotals = new Map<string, Map<string, number>>(); // user -> date -> sum
      const weekTotals = new Map<string, Map<string, number>>();

      for (const e of entries ?? []) {
        const s = stats.get(e.user_id) ?? { hours: 0, overtime: 0, ot4w: 0, lastDate: null, maxDay: null, maxWeek: null };
        const h = Number(e.total_hours || 0);
        s.hours += h;
        s.overtime += Number(e.hours_overtime || 0);
        if (e.work_date >= ot4wFromStr) s.ot4w += Number(e.hours_overtime || 0);
        if (!s.lastDate || e.work_date > s.lastDate) s.lastDate = e.work_date;
        stats.set(e.user_id, s);

        const dMap = dayTotals.get(e.user_id) ?? new Map<string, number>();
        dMap.set(e.work_date, (dMap.get(e.work_date) ?? 0) + h);
        dayTotals.set(e.user_id, dMap);

        const ws = isoWeekStart(new Date(e.work_date + "T00:00:00Z"));
        const wMap = weekTotals.get(e.user_id) ?? new Map<string, number>();
        wMap.set(ws, (wMap.get(ws) ?? 0) + h);
        weekTotals.set(e.user_id, wMap);
      }

      for (const [uid, s] of stats.entries()) {
        const dMap = dayTotals.get(uid);
        if (dMap) {
          let best: { date: string; sum: number } | null = null;
          for (const [date, sum] of dMap.entries()) {
            if (!best || sum > best.sum) best = { date, sum };
          }
          s.maxDay = best;
        }
        const wMap = weekTotals.get(uid);
        if (wMap) {
          let best: { ws: string; sum: number } | null = null;
          for (const [ws, sum] of wMap.entries()) {
            if (!best || sum > best.sum) best = { ws, sum };
          }
          s.maxWeek = best;
        }
      }

      const userIds = Array.from(new Set([
        ...((alerts ?? []) as AlertRow[]).map((a) => a.user_id),
        ...stats.keys(),
      ]));

      // Build fallback identifiers from worktime entries (employee_name + external_employee_id)
      const entryFallback = new Map<string, { name?: string; ext?: string }>();
      for (const e of entries ?? []) {
        const cur = entryFallback.get(e.user_id) ?? {};
        if (!cur.name && e.employee_name) cur.name = e.employee_name as string;
        if (!cur.ext && e.external_employee_id) cur.ext = e.external_employee_id as string;
        entryFallback.set(e.user_id, cur);
      }

      let accountInfo: Record<string, { name?: string; email?: string }> = {};
      if (userIds.length > 0) {
        const { data: accs } = await sb
          .from("user_accounts")
          .select("auth_user_id, person:people!user_accounts_person_id_fkey(full_name, email)")
          .in("auth_user_id", userIds);
        accountInfo = Object.fromEntries(
          (accs ?? []).map((a: any) => [a.auth_user_id, { name: a.person?.full_name, email: a.person?.email }])
        );
      }

      function resolveName(uid: string): string {
        const profile = employeeProfileMap.get(uid);
        if (profile?.name) return profile.name;
        const acc = accountInfo[uid];
        if (acc?.name) return acc.name;
        const fb = entryFallback.get(uid);
        if (fb?.name) return fb.name;
        if (profile?.email) return profile.email;
        if (acc?.email) return acc.email;
        if (profile?.ext) return `Ansatt #${profile.ext}`;
        if (fb?.ext) return `Ansatt #${fb.ext}`;
        return "Ukjent";
      }

      const lastRun = ((alerts ?? []) as any[]).reduce((mx: string | null, a: any) => {
        if (!a.updated_at) return mx;
        return !mx || a.updated_at > mx ? a.updated_at : mx;
      }, null as string | null);

      const byUser = new Map<string, { name: string; alerts: AlertRow[]; s: S }>();
      for (const uid of userIds) {
        const s = stats.get(uid) ?? { hours: 0, overtime: 0, ot4w: 0, lastDate: null, maxDay: null, maxWeek: null };
        byUser.set(uid, { name: resolveName(uid), alerts: [], s });
      }
      for (const a of (alerts ?? []) as AlertRow[]) {
        const v = byUser.get(a.user_id);
        if (v) v.alerts.push(a);
      }

      return {
        users: Array.from(byUser.entries()).map(([user_id, v]) => ({ user_id, ...v })),
        lastRun,
        totalEntries: entries?.length ?? 0,
      };
    },
  });

  const users = data?.users ?? [];

  useEffect(() => {
    if (import.meta.env.DEV && !isLoading && !running && data) {
      console.debug("[HMS init] AML rows built", {
        companyId: activeCompanyId,
        employeeProfiles: employeeProfilesQuery.data?.length ?? 0,
        rows: data.users.length,
        unknownRows: data.users.filter((u: any) => u.name === "Ukjent").length,
      });
    }
  }, [activeCompanyId, data, employeeProfilesQuery.data?.length, isLoading, running]);

  const filtered = users.filter((u) => {
    if (q && !u.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (sevFilter !== "all" && !u.alerts.some((a) => a.severity === sevFilter)) return false;
    return true;
  });

  // Sort: most critical, then warning, then highest recent load (max day sum, then ot4w)
  const sorted = [...filtered].sort((a, b) => {
    const ac = a.alerts.filter((x) => x.severity === "critical").length;
    const bc = b.alerts.filter((x) => x.severity === "critical").length;
    if (ac !== bc) return bc - ac;
    const aw = a.alerts.filter((x) => x.severity === "warning").length;
    const bw = b.alerts.filter((x) => x.severity === "warning").length;
    if (aw !== bw) return bw - aw;
    const ad = a.s.maxDay?.sum ?? 0;
    const bd = b.s.maxDay?.sum ?? 0;
    if (ad !== bd) return bd - ad;
    return (b.s.ot4w ?? 0) - (a.s.ot4w ?? 0);
  });

  const counts = { critical: 0, warning: 0, info: 0 };
  for (const u of users) for (const a of u.alerts) counts[a.severity]++;

  async function runEvaluator() {
    if (!activeCompanyId) return;
    setRunning(true);
    try {
      const { data, error } = await (supabase as any).functions.invoke("worktime-aml-evaluate", {
        body: { company_id: activeCompanyId },
      });
      if (error) throw error;
      // Invalidate all AML/employee-related caches so names/data refresh together
      await Promise.all([
        qc.invalidateQueries({ predicate: (q) => {
          const k = q.queryKey?.[0];
          return typeof k === "string" && (k.startsWith("hms-aml") || k === "employee-profiles" || k === "hms-import-batches");
        }}),
      ]);
      await refetch();
      toast({
        title: "AML-motor kjørt",
        description: `${data?.users_evaluated ?? 0} ansatte · ${data?.new_alerts ?? 0} nye varsler · ${data?.resolved_alerts ?? 0} løste`,
      });
    } catch (e: any) {
      toast({ title: "AML-motor feilet", description: String(e.message || e), variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      <HmsMobileBack />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
            <ShieldCheck className="h-3.5 w-3.5" /> HMS &amp; HR
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Arbeidsmiljølov</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Status per ansatt på arbeidstid, hviletid og overtid. AML-motoren oppdateres automatisk
            etter import og manuelle endringer.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/hms/import")}>
            <Upload className="h-4 w-4 mr-2" /> Importer timer
          </Button>
          <Button onClick={runEvaluator} disabled={running}>
            <PlayCircle className="h-4 w-4 mr-2" />
            {running ? "Kjører…" : "Kjør AML-motor"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard title="Kritisk" value={counts.critical} icon={AlertTriangle} tone={counts.critical ? "alert" : "ok"} />
        <SummaryCard title="Advarsel" value={counts.warning} icon={AlertTriangle} tone={counts.warning ? "warn" : "ok"} />
        <SummaryCard title="Info" value={counts.info} icon={AlertTriangle} tone="neutral" />
        <SummaryCard title="Ansatte" value={users.length} icon={Users} tone="neutral" />
      </div>

      {data?.lastRun && (
        <div className="text-xs text-muted-foreground">
          Siste AML-kjøring: {new Date(data.lastRun).toLocaleString("nb-NO")} · {data.totalEntries} timeoppføringer evaluert ({range.from} – {range.to})
        </div>
      )}

      <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
        <div><strong className="text-foreground">Datakilde:</strong> Tripletex månedsoversikt (eller manuelle timer)</div>
        <div><strong className="text-foreground">Start/slutt:</strong> Ikke tilgjengelig på månedsoversikt — eksakt 24-timersvurdering kan ikke kontrolleres.</div>
        <div><strong className="text-foreground">Kontrolltype:</strong> dato-, uke- og periodebasert.</div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søk ansatt" className="pl-8" />
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30d">Siste 30 dager</SelectItem>
            <SelectItem value="90d">Siste 90 dager</SelectItem>
            <SelectItem value="month">Inneværende måned</SelectItem>
            <SelectItem value="custom">Egendefinert</SelectItem>
          </SelectContent>
        </Select>
        {period === "custom" && (
          <>
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-[150px]" />
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-[150px]" />
          </>
        )}
        <Select value={sevFilter} onValueChange={(v) => setSevFilter(v as any)}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle alvorligheter</SelectItem>
            <SelectItem value="critical">Kritisk</SelectItem>
            <SelectItem value="warning">Advarsel</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open_ack">Åpne + kvitterte</SelectItem>
            <SelectItem value="open">Kun åpne</SelectItem>
            <SelectItem value="acknowledged">Kun kvitterte</SelectItem>
            <SelectItem value="resolved">Løst</SelectItem>
            <SelectItem value="all">Alle</SelectItem>
          </SelectContent>
        </Select>
        <Select value={ruleFilter} onValueChange={setRuleFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle regler</SelectItem>
            <SelectItem value="max_hours_24h">Maks t/dag</SelectItem>
            <SelectItem value="approaching_24h">Nærmer seg dagsgrense</SelectItem>
            <SelectItem value="week_over_48">Uke over 48t</SelectItem>
            <SelectItem value="avg_8w_over_48">8-ukers snitt</SelectItem>
            <SelectItem value="rest_below_min">Hviletid</SelectItem>
            <SelectItem value="ot_7d">OT 7 dager</SelectItem>
            <SelectItem value="ot_4w">OT 4 uker</SelectItem>
            <SelectItem value="ot_52w">OT 52 uker</SelectItem>
            <SelectItem value="ot_no_approval">OT uten godkjenning</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {running && (
        <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
          Oppdaterer AML-status og ansattdata… vent til prosessen er ferdig.
        </div>
      )}

      {isLoading || running ? (
        <Skeleton className="h-40" />
      ) : sorted.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground space-y-2">
            <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500/60" />
            <div className="font-medium text-foreground">Ingen ansatte med timer eller varsler</div>
            <p>Importer timer for å se AML-status per ansatt.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((u) => {
            const crit = u.alerts.filter((a) => a.severity === "critical").length;
            const warn = u.alerts.filter((a) => a.severity === "warning").length;
            const tone = crit ? "alert" : warn ? "warn" : "ok";

            // Top alert (highest severity, latest period_end)
            const sevRank = (s: Severity) => (s === "critical" ? 0 : s === "warning" ? 1 : 2);
            const topAlert = [...u.alerts].sort((a, b) => {
              const r = sevRank(a.severity) - sevRank(b.severity);
              if (r !== 0) return r;
              return (b.period_end ?? "").localeCompare(a.period_end ?? "");
            })[0];

            return (
              <Card
                key={u.user_id}
                className="border-border/60 cursor-pointer hover:border-primary/40 transition"
                onClick={() => navigate(`/hms/aml/${u.user_id}`)}
              >
                <CardContent className="py-3 flex items-start gap-3">
                  <div className={
                    "h-2 w-2 rounded-full mt-2 " + (
                      tone === "alert" ? "bg-destructive"
                        : tone === "warn" ? "bg-amber-500"
                        : "bg-emerald-500")
                  } />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-sm font-medium truncate">{u.name}</div>
                      {crit > 0 && <Badge variant="destructive" className="text-[10px]">{crit} kritisk</Badge>}
                      {warn > 0 && <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600">{warn} advarsel</Badge>}
                      {crit === 0 && warn === 0 && u.s.hours > 0 && (
                        <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600">OK</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                      {u.s.maxDay && (
                        <span>Høyeste dagsregistrering: <strong className={u.s.maxDay.sum > 13 ? "text-destructive" : ""}>{u.s.maxDay.sum.toFixed(1)}t</strong> ({u.s.maxDay.date})</span>
                      )}
                      {u.s.maxWeek && (
                        <span>Høyeste uke: <strong className={u.s.maxWeek.sum > 48 ? "text-amber-600" : ""}>{u.s.maxWeek.sum.toFixed(1)}t</strong></span>
                      )}
                      <span>OT 4u: <strong>{u.s.ot4w.toFixed(1)}t</strong></span>
                    </div>
                    {topAlert && (
                      <div className="text-xs text-muted-foreground truncate">
                        <span className="font-medium text-foreground">Viktigste:</span> {topAlert.title || topAlert.explanation}
                        {topAlert.recommended_action && (
                          <span className="block truncate">
                            <span className="font-medium text-foreground">Anbefalt:</span> {topAlert.recommended_action}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ title, value, icon: Icon, tone }: {
  title: string; value: number; icon: React.ElementType;
  tone: "ok" | "warn" | "alert" | "neutral";
}) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm text-muted-foreground font-medium">{title}</CardTitle>
        <Icon className={
          tone === "alert" ? "h-4 w-4 text-destructive"
            : tone === "warn" ? "h-4 w-4 text-amber-500"
            : tone === "ok" ? "h-4 w-4 text-emerald-500"
            : "h-4 w-4 text-muted-foreground"
        } />
      </CardHeader>
      <CardContent><div className="text-2xl font-semibold">{value}</div></CardContent>
    </Card>
  );
}
