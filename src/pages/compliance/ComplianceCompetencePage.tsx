import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ComplianceStatusBadge } from "@/components/compliance/ComplianceStatusBadge";
import { Search, ChevronRight } from "lucide-react";
import {
  useComplianceEmployees, useCompetences, useCompetenceTypes,
} from "@/hooks/useCompliance";
import {
  COMPETENCE_STATUS_META, competenceStatus, formatDate, TONE_DOT, worstStatus,
  type ComplianceStatus,
} from "@/lib/compliance";
import { cn } from "@/lib/utils";

export default function ComplianceCompetencePage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const employees = useComplianceEmployees();
  const types = useCompetenceTypes();
  const competences = useCompetences();

  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("all");
  const [typeFilter, setTypeFilter] = useState(params.get("type") ?? "all");
  const [statusFilter, setStatusFilter] = useState(params.get("status") ?? "all");


  const typeList = types.data ?? [];
  const enriched = useMemo(() => {
    const typeById = new Map(typeList.map((t) => [t.id, t]));
    return (competences.data ?? []).map((c) => {
      const t = c.competence_type_id ? typeById.get(c.competence_type_id) : undefined;
      return {
        ...c,
        typeKey: t?.key ?? null,
        typeName: t?.name ?? c.type_label ?? "Annet",
        status: competenceStatus({
          expires_at: c.expires_at,
          has_document: !!c.document_id,
          requires_document: t?.requires_document ?? true,
        }) as ComplianceStatus,
      };
    });
  }, [competences.data, typeList]);

  

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
        const own = enriched.filter((c) => c.person_id === p.person_id);
        const cells = filteredTypes.map((t) => {
          const items = own.filter((c) => c.competence_type_id === t.id);
          const status = worstStatus(items.map((i) => i.status));
          return { type: t, items, status };
        });
        const rowStatus = worstStatus(cells.flatMap((c) => c.items.map((i) => i.status)));
        const missingRequired = filteredTypes.some(
          (t) => t.required_for_all && !own.some((c) => c.competence_type_id === t.id),
        );
        return { person: p, own, cells, rowStatus, missingRequired };
      })
      .filter((r) => {
        if (statusFilter === "all") return true;
        if (statusFilter === "missing") return r.missingRequired;
        return r.own.some((c) => c.status === statusFilter);
      });
  }, [employees.data, enriched, filteredTypes, dept, search, statusFilter]);


  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value === "all") next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const loading = employees.isLoading || types.isLoading || competences.isLoading;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Kompetanse</h1>
        <p className="text-sm text-muted-foreground">
          Kontrollvisning med automatisk beregnet status. Registrering og dokumentasjon vedlikeholdes på ansattkortet under HMS → Ansatte.
        </p>
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
          <SelectTrigger className="w-[190px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statuser</SelectItem>
            <SelectItem value="valid">Gyldig</SelectItem>
            <SelectItem value="expiring_soon">Utløper snart</SelectItem>
            <SelectItem value="expired">Utløpt</SelectItem>
            <SelectItem value="missing_document">Mangler dokumentasjon</SelectItem>
            <SelectItem value="missing">Mangler kompetansepost</SelectItem>
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
                  <th className="sticky right-0 z-10 bg-muted/40 px-3 py-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(({ person: p, cells, rowStatus, missingRequired }) => (
                  <tr
                    key={p.person_id}
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() => navigate(`/hms/people/${p.person_id}?tab=competence`)}
                    title="Åpne ansattkortet (HMS → Ansatte)"
                  >

                    <td className="sticky left-0 z-10 bg-background px-4 py-2.5">
                      <p className="font-medium">{p.full_name}</p>
                      <p className="text-xs text-muted-foreground">{p.department_name ?? "Uten avdeling"}</p>
                    </td>
                    {cells.map((c) => (
                      <td key={c.type.id} className="px-3 py-2.5 whitespace-nowrap">
                        {c.status ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className={cn("h-2 w-2 rounded-full", TONE_DOT[COMPETENCE_STATUS_META[c.status].tone])} />
                            <span className="text-xs text-muted-foreground">
                              {c.items[0]?.expires_at ? formatDate(c.items[0].expires_at) : "Uten utløp"}
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/60">{c.type.required_for_all ? "Mangler" : "–"}</span>
                        )}
                      </td>
                    ))}
                    <td className="sticky right-0 z-10 bg-background px-3 py-2.5 text-right">
                      {missingRequired ? (
                        <ComplianceStatusBadge label="Mangler krav" tone="alert" />
                      ) : rowStatus ? (
                        <ComplianceStatusBadge label={COMPETENCE_STATUS_META[rowStatus].label} tone={COMPETENCE_STATUS_META[rowStatus].tone} />
                      ) : (
                        <ComplianceStatusBadge label="Ingen registrert" tone="neutral" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!openPerson} onOpenChange={(v) => !v && setOpenPerson(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{person?.full_name ?? "Ansatt"}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <Button size="sm" onClick={() => setDialog({ personId: openPerson!, competence: null })}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Ny kompetanse
            </Button>

            {personItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ingen kompetanseposter registrert.</p>
            ) : (
              personItems.map((c) => {
                const meta = COMPETENCE_STATUS_META[c.status];
                const doc = docs.data?.[c.id];
                return (
                  <Card key={c.id}>
                    <CardContent className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">{c.typeName}</p>
                          {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                        </div>
                        <ComplianceStatusBadge label={meta.label} tone={meta.tone} />
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                        <span>Utstedt: {formatDate(c.issued_at)}</span>
                        <span>Utløper: {c.expires_at ? formatDate(c.expires_at) : "Ingen utløp"}</span>
                        <span>Utsteder: {c.issuer || "–"}</span>
                        <span>Verifisert: {c.verified_at ? formatDate(c.verified_at) : "Nei"}</span>
                      </div>
                      {c.comment && <p className="text-xs">{c.comment}</p>}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {doc?.public_url && (
                          <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                            <a href={doc.public_url} target="_blank" rel="noreferrer"><Paperclip className="mr-1 h-3 w-3" />{doc.file_name}</a>
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDialog({ personId: c.person_id, competence: c })}>
                          <Pencil className="mr-1 h-3 w-3" /> Endre
                        </Button>
                        {!c.verified_at && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => verify.mutate(c.id)}>
                            <BadgeCheck className="mr-1 h-3 w-3" /> Verifiser
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => remove.mutate(c.id)}>
                          <Trash2 className="mr-1 h-3 w-3" /> Fjern
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>

      {dialog && (
        <CompetenceDialog
          open
          onOpenChange={(v) => !v && setDialog(null)}
          personId={dialog.personId}
          personName={(employees.data ?? []).find((p) => p.person_id === dialog.personId)?.full_name}
          types={typeList}
          competence={dialog.competence}
          defaultTypeId={dialog.typeId ?? null}
        />
      )}
    </div>
  );
}
