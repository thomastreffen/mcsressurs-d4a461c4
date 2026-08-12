import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ComplianceStatusBadge } from "@/components/compliance/ComplianceStatusBadge";
import { FindingEvidencePanel } from "@/components/compliance/FindingEvidencePanel";
import { ChevronDown, ChevronRight, Plus, Trash2, BookOpen, X, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { daysUntil, formatDate } from "@/lib/compliance";
import {
  DOCUMENTATION_STATUSES, FINDING_STATUSES, FINDING_TYPES, deadlineLabel, deadlineTone,
  findingStatusMeta, findingTypeMeta,
} from "@/lib/inspections";
import type { Finding, FindingEvidence, FindingRegulationLink, InspectionAction } from "@/hooks/useInspections";
import { useFindingMutations, useFindingRegulationMutations, useInspectionActionMutations } from "@/hooks/useInspections";
import { useRegulations, useComplianceEmployees } from "@/hooks/useCompliance";
import { useAssignableUsers } from "@/hooks/useCompanyUsers";
import type { DocumentationStatus } from "@/lib/inspections";

export function FindingCard({
  finding, inspectionId, evidence, regulationLinks, actions, derivedDocStatus, canEdit, defaultOpen = false,
}: {
  finding: Finding;
  inspectionId: string;
  evidence: FindingEvidence[];
  regulationLinks: FindingRegulationLink[];
  actions: InspectionAction[];
  derivedDocStatus: DocumentationStatus;
  canEdit: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { save, remove } = useFindingMutations(inspectionId);
  const regMut = useFindingRegulationMutations();
  const actionMut = useInspectionActionMutations();
  const regulations = useRegulations();
  const employees = useComplianceEmployees();
  const users = useAssignableUsers();

  const [draft, setDraft] = useState<Partial<Finding>>({});
  const val = <K extends keyof Finding>(k: K): any => (draft[k] !== undefined ? draft[k] : finding[k]);
  const setVal = (k: keyof Finding, v: any) => setDraft((d) => ({ ...d, [k]: v }));
  const commit = (k: keyof Finding) => {
    if (draft[k] === undefined || draft[k] === finding[k]) return;
    save.mutate({ id: finding.id, inspection_id: inspectionId, [k]: draft[k] } as any);
  };

  const [addReg, setAddReg] = useState(false);
  const [regId, setRegId] = useState("");
  const [clause, setClause] = useState("");

  const [addAction, setAddAction] = useState(false);
  const [aTitle, setATitle] = useState("");
  const [aAssignee, setAAssignee] = useState("");
  const [aDue, setADue] = useState("");

  const typeMeta = findingTypeMeta(finding.finding_type);
  const statusMeta = findingStatusMeta(finding.status);
  const docMeta = DOCUMENTATION_STATUSES[derivedDocStatus];
  const days = daysUntil(finding.deadline);
  const openActions = actions.filter((a) => ["open", "in_progress"].includes(a.status)).length;
  const personName = (id: string | null) => employees.data?.find((e) => e.person_id === id)?.full_name ?? "Ikke satt";

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/40"
      >
        {open ? <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">#{finding.finding_number}</span>
            <ComplianceStatusBadge label={typeMeta.label} tone={typeMeta.tone} />
            <span className="truncate text-sm font-medium">{finding.title}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <ComplianceStatusBadge label={statusMeta.label} tone={statusMeta.tone} />
            <ComplianceStatusBadge label={docMeta.label} tone={docMeta.tone} />
            {finding.deadline && <ComplianceStatusBadge label={deadlineLabel(days)} tone={deadlineTone(days)} />}
            <span>Ansvarlig: {personName(finding.responsible_person_id)}</span>
            {openActions > 0 && <span>{openActions} åpne tiltak</span>}
          </div>
        </div>
      </button>

      {open && (
        <div className="space-y-5 border-t px-4 py-4">
          {/* Nøkkelfelter */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={val("finding_type")} onValueChange={(v) => save.mutate({ id: finding.id, inspection_id: inspectionId, finding_type: v as any })} disabled={!canEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FINDING_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={val("status")} onValueChange={(v) => save.mutate({ id: finding.id, inspection_id: inspectionId, status: v as any })} disabled={!canEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FINDING_STATUSES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Frist</Label>
              <Input type="date" value={val("deadline") ?? ""} disabled={!canEdit}
                onChange={(e) => setVal("deadline", e.target.value || null)} onBlur={() => commit("deadline")} />
            </div>
            <div>
              <Label className="text-xs">Intern ansvarlig</Label>
              <Select value={val("responsible_person_id") ?? "none"} disabled={!canEdit}
                onValueChange={(v) => save.mutate({ id: finding.id, inspection_id: inspectionId, responsible_person_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ikke satt</SelectItem>
                  {(employees.data ?? []).map((e) => <SelectItem key={e.person_id} value={e.person_id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Originaltekst fra myndigheten – holdes atskilt fra MCS sine tekster */}
            <div className="space-y-3 rounded-md border border-dashed bg-muted/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fra tilsynsmyndigheten</p>
              <div>
                <Label className="text-xs">Tittel i rapporten</Label>
                <Input value={val("title") ?? ""} disabled={!canEdit} onChange={(e) => setVal("title", e.target.value)} onBlur={() => commit("title")} />
              </div>
              <div>
                <Label className="text-xs">Originaltekst</Label>
                <Textarea rows={4} value={val("original_text") ?? ""} disabled={!canEdit}
                  onChange={(e) => setVal("original_text", e.target.value)} onBlur={() => commit("original_text")} />
              </div>
              <div>
                <Label className="text-xs">Krav / hjemmel (fritekst)</Label>
                <Input value={val("legal_basis_text") ?? ""} disabled={!canEdit} placeholder="f.eks. FSE § 7"
                  onChange={(e) => setVal("legal_basis_text", e.target.value)} onBlur={() => commit("legal_basis_text")} />
              </div>
              <div>
                <Label className="text-xs">Kommentar fra tilsynsmyndigheten</Label>
                <Textarea rows={2} value={val("authority_comment") ?? ""} disabled={!canEdit}
                  onChange={(e) => setVal("authority_comment", e.target.value)} onBlur={() => commit("authority_comment")} />
              </div>
            </div>

            {/* MCS sine tekster */}
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">MCS sin behandling</p>
              <div>
                <Label className="text-xs">Intern vurdering</Label>
                <Textarea rows={3} value={val("internal_assessment") ?? ""} disabled={!canEdit}
                  onChange={(e) => setVal("internal_assessment", e.target.value)} onBlur={() => commit("internal_assessment")} />
              </div>
              <div>
                <Label className="text-xs">Svar til tilsynsmyndigheten</Label>
                <Textarea rows={4} value={val("response_text") ?? ""} disabled={!canEdit}
                  placeholder="Teksten som skal brukes i svarpakken"
                  onChange={(e) => setVal("response_text", e.target.value)} onBlur={() => commit("response_text")} />
              </div>
              <div>
                <Label className="text-xs">Interne notater</Label>
                <Textarea rows={2} value={val("internal_notes") ?? ""} disabled={!canEdit}
                  onChange={(e) => setVal("internal_notes", e.target.value)} onBlur={() => commit("internal_notes")} />
              </div>
            </div>
          </div>

          {/* Regelverk */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Regelverk</p>
            {regulationLinks.length === 0 && <p className="text-xs text-muted-foreground">Ingen regelverksreferanse.</p>}
            <div className="flex flex-wrap gap-2">
              {regulationLinks.map((l) => {
                const reg = regulations.data?.find((r) => r.id === l.regulation_id);
                return (
                  <span key={l.id} className="inline-flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1 text-xs">
                    <BookOpen className="h-3 w-3 text-muted-foreground" />
                    {reg ? reg.short_name ?? reg.name : "Regelverk"}{l.clause ? ` ${l.clause}` : ""}
                    {canEdit && (
                      <button type="button" onClick={() => regMut.remove.mutate(l.id)} className="text-muted-foreground hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
            {canEdit && !addReg && (
              <Button size="sm" variant="outline" onClick={() => setAddReg(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Koble regelverk
              </Button>
            )}
            {canEdit && addReg && (
              <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
                <div className="min-w-[220px] flex-1">
                  <Label className="text-xs">Regelverkspost</Label>
                  <Select value={regId} onValueChange={setRegId}>
                    <SelectTrigger><SelectValue placeholder="Velg fra regelverksregisteret" /></SelectTrigger>
                    <SelectContent>
                      {(regulations.data ?? []).map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.short_name ? `${r.short_name} – ${r.name}` : r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-40">
                  <Label className="text-xs">Paragraf (valgfritt)</Label>
                  <Input value={clause} onChange={(e) => setClause(e.target.value)} placeholder="§ 7" />
                </div>
                <Button size="sm" disabled={!regId}
                  onClick={() => regMut.add.mutate({ finding_id: finding.id, regulation_id: regId, clause: clause || null }, {
                    onSuccess: () => { setAddReg(false); setRegId(""); setClause(""); },
                  })}>Legg til</Button>
                <Button size="sm" variant="ghost" onClick={() => setAddReg(false)}>Avbryt</Button>
              </div>
            )}
          </div>

          {/* Tiltak */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tiltak</p>
            {actions.length === 0 && <p className="text-xs text-muted-foreground">Ingen tiltak knyttet til funnet.</p>}
            {actions.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="flex-1 min-w-[160px] font-medium">{a.title}</span>
                <span className="text-xs text-muted-foreground">{users.data?.find((u) => u.id === a.assignee_user_id)?.name ?? "Uten ansvarlig"}</span>
                <span className={cn("text-xs", a.due_date && (daysUntil(a.due_date) ?? 0) < 0 && a.status !== "completed" ? "text-destructive" : "text-muted-foreground")}>
                  {a.due_date ? formatDate(a.due_date) : "Ingen frist"}
                </span>
                {a.completed_at && <span className="text-xs text-emerald-600">Gjennomført {formatDate(a.completed_at)}</span>}
                <Select value={a.status} disabled={!canEdit}
                  onValueChange={(v) => actionMut.update.mutate({ id: a.id, inspection_id: inspectionId, status: v })}>
                  <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Åpent</SelectItem>
                    <SelectItem value="in_progress">Pågår</SelectItem>
                    <SelectItem value="completed">Gjennomført</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
            {canEdit && !addAction && (
              <Button size="sm" variant="outline" onClick={() => setAddAction(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Nytt tiltak
              </Button>
            )}
            {canEdit && addAction && (
              <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
                <div className="min-w-[220px] flex-1">
                  <Label className="text-xs">Hva skal gjøres?</Label>
                  <Input value={aTitle} onChange={(e) => setATitle(e.target.value)} />
                </div>
                <div className="w-48">
                  <Label className="text-xs">Ansvarlig</Label>
                  <Select value={aAssignee} onValueChange={setAAssignee}>
                    <SelectTrigger><SelectValue placeholder="Velg" /></SelectTrigger>
                    <SelectContent>{(users.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="w-40">
                  <Label className="text-xs">Frist</Label>
                  <Input type="date" value={aDue} onChange={(e) => setADue(e.target.value)} />
                </div>
                <Button size="sm" disabled={!aTitle.trim()}
                  onClick={() => actionMut.create.mutate(
                    { inspection_id: inspectionId, finding_id: finding.id, title: aTitle.trim(), assignee_user_id: aAssignee || null, due_date: aDue || null },
                    { onSuccess: () => { setAddAction(false); setATitle(""); setAAssignee(""); setADue(""); } },
                  )}>Opprett</Button>
                <Button size="sm" variant="ghost" onClick={() => setAddAction(false)}>Avbryt</Button>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">Tiltak lagres i det eksisterende tiltakssystemet og vises også i HMS-oversiktene.</p>
          </div>

          {/* Dokumentasjon */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dokumentasjon og bevis</p>
              <ComplianceStatusBadge label={docMeta.label} tone={docMeta.tone} />
            </div>
            <FindingEvidencePanel inspectionId={inspectionId} findingId={finding.id} evidence={evidence} canEdit={canEdit} />
            {derivedDocStatus === "gaps" && (
              <p className="text-xs text-destructive">Kravmotoren finner mangler – dokumentasjonen kan ikke markeres komplett.</p>
            )}
          </div>

          {canEdit && (
            <div className="flex justify-end border-t pt-3">
              <Button size="sm" variant="ghost" className="text-destructive"
                onClick={() => remove.mutate(finding.id)}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Fjern funn
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FindingSelectRow({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} />
      {label}
    </label>
  );
}
