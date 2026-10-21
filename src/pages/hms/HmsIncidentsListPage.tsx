import { useMemo, useState } from "react";
import { LocalExportMenu } from '@/components/LocalExportMenu';
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldAlert, Plus, AlertTriangle, Search, ChevronLeft, Paperclip, Calendar, User as UserIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow, format } from "date-fns";
import { nb } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { HmsMobileBack } from "@/components/hms/HmsMobileBack";
import { groupIncidentHistory } from "@/lib/hms/incident-history";

const SEV_LABEL: Record<string, string> = { low: "Lav", medium: "Middels", high: "Høy", critical: "Kritisk" };
const SEV_TONE: Record<string, string> = {
  critical: "bg-rose-50 text-rose-700 border-rose-200",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-emerald-50 text-emerald-700 border-emerald-200",
};
const TYPE_LABEL: Record<string, string> = {
  hms: "HMS-avvik",
  near_miss: "Nestenulykke",
  personal_injury: "Personskade",
  material_damage: "Materiell skade",
  quality: "Kvalitet",
  environment: "Miljø",
  observation: "HMS-observasjon",
};
const STATUS_LABEL: Record<string, string> = {
  open: "Ny",
  in_progress: "Under behandling",
  action_pending: "Tiltak opprettet",
  closed: "Lukket",
  rejected: "Avvist",
};
const STATUS_TONE: Record<string, string> = {
  open: "bg-rose-50 text-rose-700 border-rose-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  action_pending: "bg-amber-50 text-amber-700 border-amber-200",
  closed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-muted text-muted-foreground border-border",
};

export default function HmsIncidentsListPage() {
  const { activeCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [search, setSearch] = useSearchParams();

  const [q, setQ] = useState(search.get("q") ?? "");
  const scope = search.get("scope") === "mine" ? "mine" : "all";
  const personalMobile = isMobile && scope === "mine";
  const [showSearch, setShowSearch] = useState(!!search.get("q"));
  const [statusF, setStatusF] = useState<string>(search.get("status") ?? "open_all");
  const [sevF, setSevF] = useState<string>(search.get("sev") ?? "all");
  const [typeF, setTypeF] = useState<string>(search.get("type") ?? "all");
  const highlightId = search.get("highlight");
  const effectiveStatus = personalMobile && !search.has("status") ? "all" : statusF;

  const { data: incidents, isLoading } = useQuery({
    queryKey: ["hms-incidents-list", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const sb = supabase as any;
      const { data } = await sb
        .from("hms_incidents")
        .select("id, title, description, severity, status, incident_type, location, occurred_at, created_at, reported_by, project_id, assigned_to, due_date, attachments")
        .eq("company_id", activeCompanyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      return (data ?? []) as any[];
    },
  });

  // Resolve people names + project numbers
  const userIds = useMemo(() => {
    const s = new Set<string>();
    (incidents ?? []).forEach((i) => { if (i.reported_by) s.add(i.reported_by); if (i.assigned_to) s.add(i.assigned_to); });
    return Array.from(s);
  }, [incidents]);
  const projectIds = useMemo(() => Array.from(new Set((incidents ?? []).map((i) => i.project_id).filter(Boolean))), [incidents]);

  const { data: names } = useQuery({
    queryKey: ["hms-incident-names", userIds],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const sb = supabase as any;
      const { data } = await sb
        .from("user_accounts")
        .select("auth_user_id, person:people!user_accounts_person_id_fkey(full_name, email)")
        .in("auth_user_id", userIds);
      return Object.fromEntries((data ?? []).map((a: any) => [a.auth_user_id, a.person?.full_name || a.person?.email || "Ukjent"])) as Record<string, string>;
    },
  });

  const { data: projects } = useQuery({
    queryKey: ["hms-incident-projects-meta", projectIds],
    enabled: projectIds.length > 0,
    queryFn: async () => {
      const sb = supabase as any;
      const { data } = await sb
        .from("events")
        .select("id, project_number, title")
        .in("id", projectIds);
      return Object.fromEntries((data ?? []).map((p: any) => [p.id, { number: p.project_number, title: p.title }])) as Record<string, { number?: string; title?: string }>;
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (incidents ?? []).filter((i) => {
      if (scope === "mine" && i.reported_by !== user?.id && i.assigned_to !== user?.id) return false;
      if (effectiveStatus === "open_all" && i.status === "closed") return false;
      if (effectiveStatus !== "all" && effectiveStatus !== "open_all" && i.status !== effectiveStatus) return false;
      if (sevF !== "all" && i.severity !== sevF) return false;
      if (typeF !== "all" && i.incident_type !== typeF) return false;
      if (term) {
        const hay = `${i.title ?? ""} ${i.description ?? ""} ${i.location ?? ""} ${names?.[i.reported_by] ?? ""} ${projects?.[i.project_id]?.title ?? ""} ${projects?.[i.project_id]?.number ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [incidents, scope, effectiveStatus, sevF, typeF, q, user?.id, names, projects]);

  const history = useMemo(() => groupIncidentHistory(filtered), [filtered]);

  const counts = useMemo(() => {
    const all = incidents ?? [];
    return {
      open: all.filter((i) => i.status !== "closed" && i.status !== "rejected").length,
      critical: all.filter((i) => (i.severity === "critical" || i.severity === "high") && i.status !== "closed").length,
      unassigned: all.filter((i) => !i.assigned_to && i.status !== "closed" && i.status !== "rejected").length,
      mine: all.filter((i) => i.reported_by === user?.id || i.assigned_to === user?.id).length,
    };
  }, [incidents, user?.id]);

  const update = (k: string, v: string | null) => {
    const next = new URLSearchParams(search);
    if (!v || (k !== "status" && (v === "all" || v === "open_all"))) next.delete(k); else next.set(k, v);
    setSearch(next, { replace: true });
  };

  return (
    <div className="min-h-dvh bg-background pb-12">
      {personalMobile ? (
        <header className="px-4 pt-3 pb-2 space-y-3">
          <HmsMobileBack />
          <h1 className="text-xl font-semibold">Mine avvik / RUH</h1>
          <Button asChild className="min-h-12 w-full gap-2 text-base">
            <Link to="/hms/incidents/new"><Plus className="h-5 w-5" />Meld avvik</Link>
          </Button>
        </header>
      ) : <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/60">
        <div className="px-4 lg:px-6 py-3 max-w-7xl mx-auto flex flex-wrap items-center gap-2">
          {isMobile && (
            <Button variant="ghost" className="min-h-11 -ml-2 gap-1 px-2" onClick={() => navigate("/hms")}>
              <ChevronLeft className="h-5 w-5" /> Tilbake
            </Button>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">HMS &amp; HR</div>
            <div className="text-base lg:text-lg font-semibold flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 text-rose-600" /> HMS-avvik / RUH
            </div>
          </div>
          <Button asChild size="sm" className="max-md:min-h-11">
 
            <Link to="/hms/incidents/new"><Plus className="h-4 w-4 mr-1" /> Meld avvik</Link>
          </Button>
          <LocalExportMenu title="HMS-avvik / RUH" module="hms" disabled={isLoading} filters={{Søk:q||'Alle',Utvalg:scope,Status:statusF,Alvorlighet:sevF,Type:typeF}} rows={filtered.map(i=>({'Tittel':i.title,'Type':TYPE_LABEL[i.incident_type]??i.incident_type,'Alvorlighet':SEV_LABEL[i.severity]??i.severity,'Status':STATUS_LABEL[i.status]??i.status,'Sted':i.location,'Dato':i.occurred_at?new Date(i.occurred_at):new Date(i.created_at),'Rapportert av':names?.[i.reported_by]??'Ukjent','Ansvarlig':names?.[i.assigned_to]??'Ikke satt','Prosjekt':projects?.[i.project_id]?.title??'','Prosjektnummer':projects?.[i.project_id]?.number??'','Frist':i.due_date?new Date(i.due_date):null}))}/>
        </div>
      </header>}

      <div className="px-4 lg:px-6 py-5 max-w-7xl mx-auto space-y-4">
        {/* KPI row */}
        {!personalMobile && <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiTile label="Åpne" value={counts.open} tone={counts.open ? "warn" : "ok"} />
          <KpiTile label="Høy / kritisk åpen" value={counts.critical} tone={counts.critical ? "alert" : "ok"} />
          <KpiTile label="Uten ansvarlig" value={counts.unassigned} tone={counts.unassigned ? "warn" : "ok"} />
          <KpiTile label="Mine" value={counts.mine} tone="neutral" />
        </div>}

        {/* Filters */}
        {personalMobile ? (
          <div className="space-y-2">
            <Button variant="ghost" className="min-h-11 gap-2 px-0" aria-expanded={showSearch} aria-controls="incident-history-search" onClick={() => setShowSearch((value) => !value)}>
              <Search className="h-4 w-4" />Søk{q && " · aktivt"}
            </Button>
            {showSearch && <Input id="incident-history-search" aria-label="Søk i mine avvik" placeholder="Søk i mine avvik" value={q} onChange={(e) => { setQ(e.target.value); update("q", e.target.value); }} className="min-h-11 text-base" />}
            {(search.has("status") || sevF !== "all" || typeF !== "all") && <Button variant="outline" className="min-h-11" onClick={() => {
              setStatusF("all"); setSevF("all"); setTypeF("all");
              const next = new URLSearchParams(search); ["status", "sev", "type"].forEach((key) => next.delete(key)); setSearch(next, { replace: true });
            }}>Nullstill filtre</Button>}
          </div>
        ) : <Card>
          <CardContent className="p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => { setQ(e.target.value); update("q", e.target.value); }}
                  placeholder="Søk tittel, beskrivelse, sted, prosjekt, rapportør…"
                  className="pl-8"
                />
              </div>
              <Tabs value={scope} onValueChange={(v) => { update("scope", v); }}>
                <TabsList>
                  <TabsTrigger value="all" className="text-xs">Alle</TabsTrigger>
                  <TabsTrigger value="mine" className="text-xs">Kun mine</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterSelect label="Status" value={statusF} onChange={(v) => { setStatusF(v); update("status", v); }}
                options={[
                  { value: "open_all", label: "Aktive (skjul lukket)" },
                  { value: "all", label: "Alle statuser" },
                  ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
                ]} />
              <FilterSelect label="Alvorlighet" value={sevF} onChange={(v) => { setSevF(v); update("sev", v); }}
                options={[{ value: "all", label: "Alle" }, ...Object.entries(SEV_LABEL).map(([value, label]) => ({ value, label }))]} />
              <FilterSelect label="Type" value={typeF} onChange={(v) => { setTypeF(v); update("type", v); }}
                options={[{ value: "all", label: "Alle" }, ...Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))]} />
            </div>
          </CardContent>
        </Card>}

        {/* Results */}
        {isLoading && <div className="text-sm text-muted-foreground py-12 text-center">Laster…</div>}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <ShieldAlert className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <div className="text-sm">{personalMobile && counts.mine === 0 ? "Du har ingen meldte avvik ennå." : "Ingen HMS-avvik matcher filtrene dine."}</div>
            <Button asChild variant="outline" className="mt-4 min-h-11"><Link to="/hms/incidents/new">{personalMobile ? "Meld avvik" : "Meld nytt avvik"}</Link></Button>
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <>
            {/* Mobile: card list */}
            {personalMobile ? <div className="space-y-6">
              {([{ title: "Åpne", rows: history.open }, { title: "Lukkede", rows: history.closed }]).map((section) => section.rows.length > 0 && (
                <section key={section.title} className="space-y-3">
                  <h2 className="text-sm font-medium text-muted-foreground">{section.title} · {section.rows.length}</h2>
                  {section.rows.map((incident) => <PersonalIncidentCard key={incident.id} i={incident} projects={projects} highlight={incident.id === highlightId} />)}
                </section>
              ))}
            </div> : <div className="lg:hidden space-y-2">
              {filtered.map((i) => (
                <IncidentCard key={i.id} i={i} names={names} projects={projects} highlight={i.id === highlightId} />
              ))}
            </div>}

            {/* Desktop: table */}
            <div className="hidden lg:block">
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="text-left font-medium px-4 py-2.5">Tittel</th>
                        <th className="text-left font-medium px-3 py-2.5">Type</th>
                        <th className="text-left font-medium px-3 py-2.5">Alvorlighet</th>
                        <th className="text-left font-medium px-3 py-2.5">Status</th>
                        <th className="text-left font-medium px-3 py-2.5">Rapportør</th>
                        <th className="text-left font-medium px-3 py-2.5">Ansvarlig</th>
                        <th className="text-left font-medium px-3 py-2.5">Prosjekt</th>
                        <th className="text-left font-medium px-3 py-2.5">Frist</th>
                        <th className="text-left font-medium px-3 py-2.5">Meldt</th>
                        <th className="text-left font-medium px-3 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((i) => {
                        const attCount = Array.isArray(i.attachments) ? i.attachments.length : 0;
                        const proj = projects?.[i.project_id];
                        return (
                          <tr
                            key={i.id}
                            onClick={() => navigate(`/hms/incidents/${i.id}`)}
                            className={cn(
                              "border-t border-border/60 hover:bg-muted/30 cursor-pointer",
                              i.id === highlightId && "bg-primary/5",
                            )}
                          >
                            <td className="px-4 py-2.5">
                              <div className="font-medium">{i.title}</div>
                              {i.location && <div className="text-[11px] text-muted-foreground">{i.location}</div>}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">{TYPE_LABEL[i.incident_type] ?? i.incident_type}</td>
                            <td className="px-3 py-2.5">
                              <Badge variant="outline" className={cn("text-[10px]", SEV_TONE[i.severity])}>
                                {(i.severity === "critical" || i.severity === "high") && <AlertTriangle className="h-3 w-3 mr-0.5" />}
                                {SEV_LABEL[i.severity] ?? i.severity}
                              </Badge>
                            </td>
                            <td className="px-3 py-2.5">
                              <Badge variant="outline" className={cn("text-[10px]", STATUS_TONE[i.status])}>
                                {STATUS_LABEL[i.status] ?? i.status}
                              </Badge>
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">{names?.[i.reported_by] ?? "—"}</td>
                            <td className="px-3 py-2.5 text-muted-foreground">
                              {i.assigned_to ? names?.[i.assigned_to] ?? "—" : <span className="text-amber-600">Ikke satt</span>}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">
                              {proj ? (proj.number || proj.title || "—") : <span className="text-muted-foreground/50">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">
                              {i.due_date ? format(new Date(i.due_date), "d. MMM", { locale: nb }) : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                              {formatDistanceToNow(new Date(i.occurred_at || i.created_at), { addSuffix: true, locale: nb })}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">
                              {attCount > 0 && (
                                <span className="inline-flex items-center gap-1 text-xs">
                                  <Paperclip className="h-3 w-3" /> {attCount}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PersonalIncidentCard({ i, projects, highlight }: { i: any; projects?: Record<string, any>; highlight?: boolean }) {
  const project = projects?.[i.project_id];
  const context = [project?.number || project?.title, i.location].filter(Boolean).join(" · ");
  const importantSeverity = i.severity === "high" || i.severity === "critical";
  return (
    <Link to={`/hms/incidents/${i.id}`} className={cn("block rounded-lg border border-border bg-card p-4 space-y-3 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", highlight && "ring-2 ring-primary")}>
      <h3 className="break-words text-base font-medium text-card-foreground">{i.title}</h3>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary" className="text-xs">{STATUS_LABEL[i.status] ?? i.status}</Badge>
        <span className="text-muted-foreground">{format(new Date(i.occurred_at || i.created_at), "d. MMM yyyy", { locale: nb })}</span>
        {importantSeverity && <span className="inline-flex items-center gap-1 text-destructive"><AlertTriangle className="h-4 w-4" />{SEV_LABEL[i.severity]}</span>}
      </div>
      {context && <p className="truncate text-sm text-muted-foreground">{context}</p>}
    </Link>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number; tone: "ok" | "warn" | "alert" | "neutral" }) {
  const cls =
    tone === "alert" ? "text-rose-700 border-rose-200 bg-rose-50/40"
    : tone === "warn" ? "text-amber-800 border-amber-200 bg-amber-50/40"
    : tone === "ok" ? "text-emerald-700 border-emerald-200 bg-emerald-50/40"
    : "text-foreground border-border bg-card";
  return (
    <div className={cn("rounded-lg border px-4 py-3", cls)}>
      <div className="text-[11px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs w-auto min-w-[140px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function IncidentCard({ i, names, projects, highlight }: { i: any; names?: Record<string, string>; projects?: Record<string, any>; highlight?: boolean }) {
  const proj = projects?.[i.project_id];
  return (
    <Link to={`/hms/incidents/${i.id}`} className="block">
      <Card className={cn("transition active:scale-[0.99]", highlight && "ring-2 ring-primary border-primary/40")}>
        <CardContent className="p-3 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{i.title}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {TYPE_LABEL[i.incident_type] ?? i.incident_type}
                {i.location ? ` · ${i.location}` : ""}
                {" · "}
                {formatDistanceToNow(new Date(i.occurred_at || i.created_at), { addSuffix: true, locale: nb })}
              </div>
            </div>
            <Badge variant="outline" className={cn("text-[10px]", SEV_TONE[i.severity])}>
              {(i.severity === "critical" || i.severity === "high") && <AlertTriangle className="h-3 w-3 mr-0.5" />}
              {SEV_LABEL[i.severity] ?? i.severity}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-2 pt-0.5 flex-wrap text-[11px] text-muted-foreground">
            <Badge variant="outline" className={cn("text-[10px]", STATUS_TONE[i.status])}>{STATUS_LABEL[i.status] ?? i.status}</Badge>
            {names?.[i.reported_by] && <span className="inline-flex items-center gap-1"><UserIcon className="h-3 w-3" /> {names[i.reported_by]}</span>}
            {proj && <span>{proj.number || proj.title}</span>}
            {i.due_date && <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {format(new Date(i.due_date), "d. MMM", { locale: nb })}</span>}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
