import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ComplianceStatusBadge } from "@/components/compliance/ComplianceStatusBadge";
import { Plus, X, Paperclip, ShieldCheck } from "lucide-react";
import { EVIDENCE_SOURCE_KINDS, evidenceKindLabel, type EvidenceSourceKind } from "@/lib/inspections";
import { useCompetenceTypes, useRegulations, useOrgRoles, useComplianceAudits, useComplianceEmployees, useCompetences } from "@/hooks/useCompliance";
import { useEvidenceMutations, useInspectionActions, type FindingEvidence } from "@/hooks/useInspections";
import { useEvidenceCoverage } from "@/hooks/useEvidenceCoverage";

const sb = supabase as any;

function useHmsIncidentOptions() {
  const { activeCompanyId } = useCompanyContext();
  return useQuery<{ id: string; label: string }[]>({
    queryKey: ["evidence-incidents", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("hms_incidents")
        .select("id, title, occurred_at")
        .eq("company_id", activeCompanyId)
        .is("deleted_at", null)
        .order("occurred_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ id: r.id, label: r.title ?? "Avvik" }));
    },
  });
}

function useDocumentOptions(search: string) {
  const { activeCompanyId } = useCompanyContext();
  return useQuery<{ id: string; label: string }[]>({
    queryKey: ["evidence-documents", activeCompanyId, search],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      let q = sb
        .from("documents")
        .select("id, file_name, category")
        .eq("company_id", activeCompanyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (search.trim()) q = q.ilike("file_name", `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ id: r.id, label: r.file_name }));
    },
  });
}

/** Viser hva kravmotoren finner for en kompetansetype */
function CoverageLine({ competenceTypeId }: { competenceTypeId: string | null }) {
  const { coverageFor } = useEvidenceCoverage();
  const c = coverageFor(competenceTypeId);
  if (!c) return null;
  if (c.total === 0)
    return <p className="text-xs text-amber-600">Ingen ansatte har dette som krav – kontroller kompetansekravene.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <ComplianceStatusBadge label={`${c.ok} av ${c.total} ansatte komplett`} tone={c.ok === c.total ? "ok" : "warn"} />
      {c.warn > 0 && <ComplianceStatusBadge label={`${c.warn} utløper snart`} tone="warn" />}
      {c.gaps > 0 && <ComplianceStatusBadge label={`${c.gaps} mangler gyldig bevis`} tone="alert" />}
      {c.gaps > 0 && <span className="text-muted-foreground">{c.gapNames.join(", ")}</span>}
    </div>
  );
}

function PersonCompetencePicker({ onPick }: { onPick: (v: { ref_id: string; label: string }) => void }) {
  const employees = useComplianceEmployees();
  const [personId, setPersonId] = useState<string>("");
  const competences = useCompetences(personId || undefined);
  const types = useCompetenceTypes();
  const typeName = (id: string | null) => types.data?.find((t) => t.id === id)?.name ?? "Kompetanse";
  const personName = employees.data?.find((e) => e.person_id === personId)?.full_name ?? "";

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Select value={personId} onValueChange={setPersonId}>
        <SelectTrigger><SelectValue placeholder="Velg ansatt" /></SelectTrigger>
        <SelectContent>
          {(employees.data ?? []).map((e) => (
            <SelectItem key={e.person_id} value={e.person_id}>{e.full_name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value=""
        onValueChange={(v) => {
          const c = competences.data?.find((x) => x.id === v);
          onPick({ ref_id: v, label: `${personName} – ${typeName(c?.competence_type_id ?? null)}` });
        }}
        disabled={!personId}
      >
        <SelectTrigger><SelectValue placeholder="Velg bevis" /></SelectTrigger>
        <SelectContent>
          {(competences.data ?? []).map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {typeName(c.competence_type_id)}{c.expires_at ? ` · utløper ${c.expires_at}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function FindingEvidencePanel({
  inspectionId,
  findingId,
  evidence,
  canEdit,
}: {
  inspectionId: string;
  findingId: string;
  evidence: FindingEvidence[];
  canEdit: boolean;
}) {
  const { add, remove } = useEvidenceMutations();
  const types = useCompetenceTypes();
  const regulations = useRegulations();
  const orgRoles = useOrgRoles();
  const audits = useComplianceAudits();
  const incidents = useHmsIncidentOptions();
  const actions = useInspectionActions(inspectionId);
  const [docSearch, setDocSearch] = useState("");
  const documents = useDocumentOptions(docSearch);

  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<EvidenceSourceKind>("competence_requirement");
  const [refId, setRefId] = useState<string>("");
  const [competenceTypeId, setCompetenceTypeId] = useState<string>("");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");

  const reset = () => {
    setAdding(false); setRefId(""); setCompetenceTypeId(""); setLabel(""); setNote("");
    setKind("competence_requirement");
  };

  const submit = () => {
    const payload: any = {
      inspection_id: inspectionId,
      finding_id: findingId,
      source_kind: kind,
      note: note || null,
      label: label || null,
    };
    if (kind === "competence_requirement") {
      if (!competenceTypeId) return;
      payload.competence_type_id = competenceTypeId;
      payload.label = types.data?.find((t) => t.id === competenceTypeId)?.name ?? "Kompetanse";
    } else if (kind === "document") {
      if (!refId) return;
      payload.document_id = refId;
      payload.label = label || (documents.data?.find((d) => d.id === refId)?.label ?? "Dokument");
    } else if (kind !== "other") {
      if (!refId) return;
      payload.ref_id = refId;
    } else if (!label) return;
    add.mutate(payload, { onSuccess: reset });
  };

  const refOptions: { id: string; label: string }[] =
    kind === "regulation" ? (regulations.data ?? []).map((r) => ({ id: r.id, label: r.short_name ? `${r.short_name} – ${r.name}` : r.name }))
    : kind === "org_role" ? (orgRoles.data ?? []).map((r) => ({ id: r.id, label: r.title }))
    : kind === "internal_audit" ? (audits.data ?? []).map((a) => ({ id: a.id, label: a.title }))
    : kind === "hms_incident" ? (incidents.data ?? [])
    : kind === "action_item" ? (actions.data ?? []).map((a) => ({ id: a.id, label: a.title }))
    : kind === "document" ? (documents.data ?? [])
    : [];

  return (
    <div className="space-y-2">
      {evidence.length === 0 && <p className="text-xs text-muted-foreground">Ingen dokumentasjon koblet til dette funnet.</p>}
      {evidence.map((e) => (
        <div key={e.id} className="rounded-md border bg-muted/20 px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm">
                {e.source_kind === "competence_requirement" ? <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" /> : <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className="font-medium truncate">{e.label ?? evidenceKindLabel(e.source_kind)}</span>
                <span className="text-xs text-muted-foreground">{evidenceKindLabel(e.source_kind)}</span>
              </div>
              {e.note && <p className="mt-0.5 text-xs text-muted-foreground">{e.note}</p>}
              {e.source_kind === "competence_requirement" && <div className="mt-1"><CoverageLine competenceTypeId={e.competence_type_id} /></div>}
            </div>
            {canEdit && (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove.mutate(e.id)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      ))}

      {canEdit && !adding && (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Legg til dokumentasjon
        </Button>
      )}

      {canEdit && adding && (
        <div className="space-y-2 rounded-md border p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={kind} onValueChange={(v) => { setKind(v as EvidenceSourceKind); setRefId(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVIDENCE_SOURCE_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {kind === "competence_requirement" && (
              <Select value={competenceTypeId} onValueChange={setCompetenceTypeId}>
                <SelectTrigger><SelectValue placeholder="Velg kompetanse" /></SelectTrigger>
                <SelectContent>
                  {(types.data ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {refOptions.length >= 0 && kind !== "competence_requirement" && kind !== "competence" && kind !== "other" && (
              <Select value={refId} onValueChange={setRefId}>
                <SelectTrigger><SelectValue placeholder="Velg referanse" /></SelectTrigger>
                <SelectContent>
                  {refOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {kind === "other" && <Input placeholder="Beskriv bevis" value={label} onChange={(e) => setLabel(e.target.value)} />}
          </div>

          {kind === "document" && (
            <Input placeholder="Søk i dokumenter..." value={docSearch} onChange={(e) => setDocSearch(e.target.value)} />
          )}
          {kind === "competence" && (
            <PersonCompetencePicker onPick={({ ref_id, label: l }) => { setRefId(ref_id); setLabel(l); }} />
          )}
          {kind === "competence" && refId && <p className="text-xs text-muted-foreground">Valgt: {label}</p>}
          {kind === "competence_requirement" && competenceTypeId && <CoverageLine competenceTypeId={competenceTypeId} />}

          <Input placeholder="Merknad (valgfritt)" value={note} onChange={(e) => setNote(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            {EVIDENCE_SOURCE_KINDS.find((k) => k.value === kind)?.hint}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={submit} disabled={add.isPending}>Koble dokumentasjon</Button>
            <Button size="sm" variant="ghost" onClick={reset}>Avbryt</Button>
          </div>
        </div>
      )}
    </div>
  );
}
