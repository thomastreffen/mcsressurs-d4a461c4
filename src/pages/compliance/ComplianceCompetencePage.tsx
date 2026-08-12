import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ComplianceStatusBadge } from "@/components/compliance/ComplianceStatusBadge";
import { Search, ChevronRight, SlidersHorizontal } from "lucide-react";
import { useComplianceEmployees, useCompetenceTypes } from "@/hooks/useCompliance";
import { useRequirementStatus } from "@/hooks/useComplianceRequirements";
import {
  REQUIREMENT_STATUS_META, formatDate, requirementOverallTone, TONE_DOT,
  type RequirementStatus,
} from "@/lib/compliance";
import { cn } from "@/lib/utils";

/**
 * Elsikkerhet → Kompetanse: ren kontrollvisning basert på kravmotoren.
 * Registrering skjer på ansattkortet (HMS → Ansatte).
 */
export default function ComplianceCompetencePage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const employees = useComplianceEmployees();
  const types = useCompetenceTypes();
  const statuses = useRequirementStatus();

  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("all");
  const [typeFilter, setTypeFilter] = useState(params.get("type") ?? "all");
  const [statusFilter, setStatusFilter] = useState(params.get("status") ?? "all");

  const typeList = types.data ?? [];

  const byPerson = useMemo(() => {
    const map = new Map<string, Map<string, (typeof statuses.data)[number]>>();
    for (const r of statuses.data ?? []) {
      const inner = map.get(r.person_id) ?? new Map();
      inner.set(r.competence_type_id, r);
      map.set(r.person_id, inner);
    }
    return map;
  }, [statuses.data]);

  const departments = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of employees.data ?? []) if (e.department_id && e.department_name) map.set(e.department_id, e.department_name);
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [employees.data]);

  const filteredTypes = typeFilter === "all" ? typeList : typeList.filter((t) => t.key === typeFilter);

  const rows = useMemo(() => {
    return (employees.data ?? [])
      .filter((p) => (dept === "all" ? true : p.department_id === dept))
      .filter((p) => (search ? p.full_name.toLowerCase().includes(search.toLowerCase()) : true))
      .map((p) => {
        const own = byPerson.get(p.person_id);
        const cells = filteredTypes.map((t) => ({ type: t, req: own?.get(t.id) ?? null }));
        const all = Array.from(own?.values() ?? []).map((r) => r.status as RequirementStatus);
        return { person: p, cells, tone: requirementOverallTone(all), all };
      })
      .filter((r) => (statusFilter === "all" ? true : r.all.includes(statusFilter as RequirementStatus)));
  }, [employees.data, byPerson, filteredTypes, dept, search, statusFilter]);

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value === "all") next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const loading = employees.isLoading || types.isLoading || statuses.isLoading;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Kompetanse</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Statusen beregnes automatisk ut fra gjeldende kompetansekrav, registrert kompetanse, dokumentasjon og
            gyldighetsdato. Registrering skjer på ansattkortet under HMS → Ansatte.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate("/compliance/kompetansekrav")}>
          <SlidersHorizontal className="mr-1 h-3.5 w-3.5" /> Kompetansekrav
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Søk ansatt…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="Avdeling" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle avdelinger</SelectItem>
            {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); updateFilter("type", v); }}>
          <SelectTrigger className="w-[190px]"><SelectValue placeholder="Kompetansetype" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle kompetansetyper</SelectItem>
            {typeList.map((t) => <SelectItem key={t.id} value={t.key}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); updateFilter("status", v); }}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statuser</SelectItem>
            <SelectItem value="missing">Mangler kompetanse</SelectItem>
            <SelectItem value="missing_document">Mangler dokumentasjon</SelectItem>
            <SelectItem value="expired">Utløpt</SelectItem>
            <SelectItem value="expiring_soon">Utløper snart</SelectItem>
            <SelectItem value="fulfilled">Oppfylt</SelectItem>
            <SelectItem value="not_required">Ikke påkrevd</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Ingen ansatte matcher filteret.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="sticky left-0 z-10 bg-muted/40 px-4 py-2 text-left font-medium">Ansatt</th>
                  {filteredTypes.map((t) => (
                    <th key={t.id} className="max-w-[150px] truncate px-3 py-2 text-left font-medium whitespace-nowrap">{t.name}</th>
                  ))}
                  <th className="sticky right-0 z-10 bg-muted/40 px-3 py-2 text-right font-medium">Samlet</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(({ person: p, cells, tone }) => (
                  <tr
                    key={p.person_id}
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() => navigate(`/hms/people/${p.person_id}?tab=competence`)}
                    title="Åpne ansattkortet (HMS → Ansatte)"
                  >
                    <td className="sticky left-0 z-10 bg-background px-4 py-2.5">
                      <p className="flex items-center gap-1 font-medium">
                        {p.full_name}
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </p>
                      <p className="text-xs text-muted-foreground">{p.department_name ?? "Uten avdeling"}</p>
                    </td>

                    {cells.map(({ type, req }) => {
                      if (!req) {
                        return (
                          <td key={type.id} className="px-3 py-2.5 whitespace-nowrap">
                            <span className="text-xs text-muted-foreground/60">Ingen krav</span>
                          </td>
                        );
                      }
                      const meta = REQUIREMENT_STATUS_META[req.status];
                      return (
                        <td key={type.id} className="px-3 py-2.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <span className={cn("h-2 w-2 rounded-full", TONE_DOT[meta.tone])} />
                            <span className="text-xs">{meta.short}</span>
                          </span>
                          {(req.status === "fulfilled" || req.status === "expiring_soon" || req.status === "expired") && (
                            <p className="text-[11px] text-muted-foreground">
                              {req.expires_at ? formatDate(req.expires_at) : "Uten utløp"}
                            </p>
                          )}
                        </td>
                      );
                    })}

                    <td className="sticky right-0 z-10 bg-background px-3 py-2.5 text-right">
                      <ComplianceStatusBadge
                        label={tone === "alert" ? "Mangler" : tone === "warn" ? "Følg opp" : tone === "ok" ? "Oppfylt" : "Ingen krav"}
                        tone={tone}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
