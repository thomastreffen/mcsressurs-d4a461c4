import { useMemo, useState } from "react";
import { LocalExportMenu } from '@/components/LocalExportMenu';
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ComplianceStatusBadge } from "@/components/compliance/ComplianceStatusBadge";
import { Plus, Search, ChevronRight, AlertTriangle, ListChecks, FileCheck2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { useInspections, useInspectionSummaries } from "@/hooks/useInspections";
import { useComplianceEmployees } from "@/hooks/useCompliance";
import { daysUntil, formatDate } from "@/lib/compliance";
import {
  INSPECTION_TYPES,
  deadlineLabel, deadlineTone,
  inspectionStatusMeta, inspectionTypeLabel,
} from "@/lib/inspections";

export default function InspectionsPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const { isSuperAdmin, isAdmin } = useAuth();
  const canManage = isSuperAdmin || isAdmin || hasPermission("hms.manage");

  const inspections = useInspections();
  const summaries = useInspectionSummaries();
  const employees = useComplianceEmployees();

  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [view, setView] = useState<"active" | "history" | "all">("active");

  const nameOf = (id: string | null) =>
    (employees.data ?? []).find((p) => p.person_id === id)?.full_name ?? "Ikke satt";

  const rows = useMemo(() => {
    const list = inspections.data ?? [];
    const needle = q.trim().toLowerCase();
    return list.filter((i) => {
      const active = summaries.data?.[i.id]?.active ?? true;
      if (view === "active" && !active) return false;
      if (view === "history" && active) return false;
      if (typeFilter !== "all" && i.inspection_type !== typeFilter) return false;
      if (!needle) return true;
      return [i.title, i.authority_name, i.case_number, i.contact_name]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [inspections.data, summaries.data, q, typeFilter, view]);

  const kpi = useMemo(() => {
    const list = inspections.data ?? [];
    const sum = summaries.data ?? {};
    const active = list.filter((i) => sum[i.id]?.active);
    let openActions = 0;
    let overdue = 0;
    for (const i of active) {
      openActions += sum[i.id]?.openActions ?? 0;
      const d = daysUntil(i.response_deadline);
      if (sum[i.id]?.deadlineRelevant && d !== null && d < 0) overdue += 1;
    }
    return { active: active.length, openActions, overdue };
  }, [inspections.data, summaries.data]);

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Tilsyn &amp; revisjoner</h1>
          <p className="text-sm text-muted-foreground">
            Operativ arbeidsflate for eksterne tilsyn og interne revisjoner – bygget på eksisterende kompetanse, regelverk og tiltak.
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => navigate("/compliance/tilsyn/ny")}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Nytt tilsyn
          </Button>
        )}
        <LocalExportMenu title="Tilsyn og revisjoner" module="hms" disabled={inspections.isLoading || summaries.isLoading || summaries.isError} filters={{Søk:q||'Alle',Type:inspectionTypeLabel(typeFilter),Visning:view}} rows={rows.map(i=>({'Tittel':i.title,'Type':inspectionTypeLabel(i.inspection_type),'Status':summaries.data?.[i.id]?.label ?? '', 'Myndighet':i.authority_name,'Kontakt':i.contact_name,'Saksnummer':i.case_number,'Dato':i.inspection_date?new Date(i.inspection_date):null,'Ansvarlig':nameOf(i.responsible_person_id),'Svarfrist':i.response_deadline?new Date(i.response_deadline):null,'Funn':summaries.data?.[i.id]?.findings??0,'Åpne':summaries.data?.[i.id]?.counts.open??0,'Under arbeid':summaries.data?.[i.id]?.counts.in_progress??0,'Klar for oversendelse':summaries.data?.[i.id]?.counts.ready??0,'Oversendt':summaries.data?.[i.id]?.counts.submitted??0,'Lukket':summaries.data?.[i.id]?.counts.closed??0,'Åpne tiltak':summaries.data?.[i.id]?.openActions??0,'Dokumentasjon':summaries.data?.[i.id]?.documentationLabel??''}))}/>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="flex items-center gap-3 p-4">
          <FileCheck2 className="h-5 w-5 text-muted-foreground" />
          <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Aktive saker</p>
            <p className="text-xl font-semibold">{summaries.isLoading || summaries.isError ? "–" : kpi.active}</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <ListChecks className="h-5 w-5 text-muted-foreground" />
          <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Åpne tiltak</p>
            <p className="text-xl font-semibold">{summaries.isLoading || summaries.isError ? "–" : kpi.openActions}</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <AlertTriangle className={kpi.overdue ? "h-5 w-5 text-destructive" : "h-5 w-5 text-muted-foreground"} />
          <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Over frist</p>
            <p className="text-xl font-semibold">{summaries.isLoading || summaries.isError ? "–" : kpi.overdue}</p></div>
        </CardContent></Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Søk tittel, myndighet, saksnummer…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle typer</SelectItem>
            {INSPECTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex rounded-md border p-0.5">
          {([["active", "Aktive"], ["history", "Historikk"], ["all", "Alle"]] as const).map(([v, label]) => (
            <Button key={v} size="sm" variant={view === v ? "secondary" : "ghost"} className="h-8" onClick={() => setView(v)}>
              {label}
            </Button>
          ))}
        </div>
      </div>

      {summaries.isError ? (
        <div className="flex items-center gap-3 text-sm text-destructive">Kunne ikke hente saksoversikten.<Button variant="outline" size="sm" onClick={() => summaries.refetch()}>Prøv igjen</Button></div>
      ) : inspections.isLoading || summaries.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Ingen tilsynssaker her ennå. {canManage && "Opprett en sak når du mottar varsel om tilsyn."}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {rows.map((i) => {
            const s = summaries.data?.[i.id];
            const statusMeta = s ?? inspectionStatusMeta(i.status);
            const days = daysUntil(i.response_deadline);
            return (
              <Button
                key={i.id}
                type="button"
                variant="ghost"
                onClick={() => navigate(`/compliance/tilsyn/${i.id}`)}
                className="flex h-auto w-full items-center gap-3 whitespace-normal rounded-lg border bg-card px-4 py-3 text-left font-normal transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold">{i.title}</span>
                    <ComplianceStatusBadge label={inspectionTypeLabel(i.inspection_type)} tone="neutral" />
                    <ComplianceStatusBadge label={statusMeta.label} tone={statusMeta.tone} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{i.authority_name ?? "Myndighet ikke satt"}</span>
                    {i.contact_name && <span>Kontakt: {i.contact_name}</span>}
                    <span>Saksnr: {i.case_number ?? "–"}</span>
                    <span>Dato: {formatDate(i.inspection_date)}</span>
                    <span>Ansvarlig: {nameOf(i.responsible_person_id)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {s?.deadlineRelevant && <ComplianceStatusBadge label={deadlineLabel(days)} tone={deadlineTone(days)} />}
                    <span className="text-muted-foreground">{s?.findings ?? 0} funn</span>
                    <span className="text-muted-foreground">{s?.openActions ?? 0} åpne tiltak</span>
                    {!!s?.counts.ready && <span>{s.counts.ready} klar for oversendelse</span>}
                    {!!s?.counts.in_progress && <span>{s.counts.in_progress} under arbeid</span>}
                    {!!s?.counts.open && <span>{s.counts.open} åpne</span>}
                    {!!s?.counts.submitted && <span>{s.counts.submitted} oversendt</span>}
                    {!!s?.counts.closed && <span>{s.counts.closed} lukket</span>}
                    <span className="text-muted-foreground">{s?.documentationLabel}</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
