import { useMemo, useState } from "react";
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
  DOCUMENTATION_STATUSES, INSPECTION_TYPES,
  aggregateDocumentationStatus, deadlineLabel, deadlineTone,
  inspectionStatusMeta, inspectionTypeLabel,
} from "@/lib/inspections";

const ACTIVE_STATUSES = ["planned", "ongoing", "awaiting_report", "actions_in_progress", "ready_for_response"];

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
      if (view === "active" && !ACTIVE_STATUSES.includes(i.status)) return false;
      if (view === "history" && ACTIVE_STATUSES.includes(i.status)) return false;
      if (typeFilter !== "all" && i.inspection_type !== typeFilter) return false;
      if (!needle) return true;
      return [i.title, i.authority_name, i.case_number, i.contact_name]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [inspections.data, q, typeFilter, view]);

  const kpi = useMemo(() => {
    const list = inspections.data ?? [];
    const sum = summaries.data ?? {};
    const active = list.filter((i) => ACTIVE_STATUSES.includes(i.status));
    let openActions = 0;
    let overdue = 0;
    for (const i of active) {
      openActions += sum[i.id]?.openActions ?? 0;
      const d = daysUntil(i.response_deadline);
      if (d !== null && d < 0) overdue += 1;
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
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="flex items-center gap-3 p-4">
          <FileCheck2 className="h-5 w-5 text-muted-foreground" />
          <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Aktive saker</p>
            <p className="text-xl font-semibold">{kpi.active}</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <ListChecks className="h-5 w-5 text-muted-foreground" />
          <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Åpne tiltak</p>
            <p className="text-xl font-semibold">{kpi.openActions}</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <AlertTriangle className={kpi.overdue ? "h-5 w-5 text-destructive" : "h-5 w-5 text-muted-foreground"} />
          <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Over frist</p>
            <p className="text-xl font-semibold">{kpi.overdue}</p></div>
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

      {inspections.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Ingen tilsynssaker her ennå. {canManage && "Opprett en sak når du mottar varsel om tilsyn."}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {rows.map((i) => {
            const s = summaries.data?.[i.id];
            const statusMeta = inspectionStatusMeta(i.status);
            const docStatus = aggregateDocumentationStatus(s?.docStatuses ?? []);
            const docMeta = DOCUMENTATION_STATUSES[docStatus];
            const days = daysUntil(i.response_deadline);
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => navigate(`/compliance/tilsyn/${i.id}`)}
                className="flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40"
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
                    <ComplianceStatusBadge label={deadlineLabel(days)} tone={deadlineTone(days)} />
                    <span className="text-muted-foreground">{s?.findings ?? 0} funn</span>
                    <span className="text-muted-foreground">{s?.openActions ?? 0} åpne tiltak</span>
                    <ComplianceStatusBadge label={docMeta.label} tone={docMeta.tone} />
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
