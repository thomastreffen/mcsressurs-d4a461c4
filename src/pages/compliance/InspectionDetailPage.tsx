import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ComplianceStatusBadge } from "@/components/compliance/ComplianceStatusBadge";
import { FindingCard } from "@/components/compliance/FindingCard";
import { FindingEvidencePanel } from "@/components/compliance/FindingEvidencePanel";
import { ArrowLeft, Pencil, Plus, ListChecks, Mail, History, AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { useComplianceEmployees } from "@/hooks/useCompliance";
import { useAssignableUsers } from "@/hooks/useCompanyUsers";
import { useEvidenceCoverage, deriveDocumentationStatus } from "@/hooks/useEvidenceCoverage";
import {
  useCorrespondence, useCorrespondenceMutations, useFindingEvidence, useFindingMutations, useFindingRegulations,
  useFindings, useInspection, useInspectionActionMutations, useInspectionActions, useInspectionEvents,
  useInspectionMutations,
} from "@/hooks/useInspections";
import { daysUntil, formatDate } from "@/lib/compliance";
import {
  CORRESPONDENCE_DIRECTIONS, DOCUMENTATION_STATUSES, FINDING_TYPES, INSPECTION_STATUSES,
  aggregateDocumentationStatus, correspondenceLabel, deadlineLabel, deadlineTone,
  inspectionStatusMeta, inspectionTypeLabel,
} from "@/lib/inspections";

export default function InspectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "overview";
  const setTab = (v: string) => setParams((p) => { const n = new URLSearchParams(p); n.set("tab", v); return n; }, { replace: true });

  const { hasPermission } = usePermissions();
  const { isSuperAdmin, isAdmin } = useAuth();
  const canEdit = isSuperAdmin || isAdmin || hasPermission("hms.manage");

  const inspection = useInspection(id);
  const findings = useFindings(id);
  const evidence = useFindingEvidence(id);
  const regulationLinks = useFindingRegulations(id);
  const actions = useInspectionActions(id);
  const events = useInspectionEvents(id);
  const correspondence = useCorrespondence(id);
  const employees = useComplianceEmployees();
  const users = useAssignableUsers();
  const { coverageFor } = useEvidenceCoverage();

  const { setStatus } = useInspectionMutations();
  const findingMut = useFindingMutations(id);
  const actionMut = useInspectionActionMutations();
  const corrMut = useCorrespondenceMutations();

  const [newFinding, setNewFinding] = useState<{ open: boolean; title: string; type: string; original: string }>({
    open: false, title: "", type: "deviation", original: "",
  });
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [corrForm, setCorrForm] = useState({ open: false, direction: "in", contact_name: "", subject: "", notes: "", occurred_at: "" });

  const docStatusByFinding = useMemo(() => {
    const map: Record<string, ReturnType<typeof deriveDocumentationStatus>> = {};
    for (const f of findings.data ?? []) {
      map[f.id] = deriveDocumentationStatus((evidence.data ?? []).filter((e) => e.finding_id === f.id), coverageFor);
    }
    return map;
  }, [findings.data, evidence.data, coverageFor]);

  if (inspection.isLoading) return <div className="space-y-3 p-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-40" /></div>;
  if (!inspection.data) {
    return (
      <div className="p-6">
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Tilsynssaken finnes ikke lenger.</CardContent></Card>
      </div>
    );
  }

  const i = inspection.data;
  const statusMeta = inspectionStatusMeta(i.status);
  const days = daysUntil(i.response_deadline);
  const docStatus = aggregateDocumentationStatus(Object.values(docStatusByFinding));
  const docMeta = DOCUMENTATION_STATUSES[docStatus];
  const openActions = (actions.data ?? []).filter((a) => ["open", "in_progress"].includes(a.status));
  const nameOf = (pid: string | null) => (employees.data ?? []).find((p) => p.person_id === pid)?.full_name ?? "Ikke satt";

  const selectedFindings = (findings.data ?? []).filter((f) => selected[f.id]);
  const packageIssues = selectedFindings.flatMap((f) => {
    const issues: string[] = [];
    if (!f.response_text?.trim()) issues.push(`Funn ${f.finding_number}: mangler svartekst`);
    const ds = docStatusByFinding[f.id];
    if (ds === "none") issues.push(`Funn ${f.finding_number}: ingen dokumentasjon koblet`);
    if (ds === "gaps") issues.push(`Funn ${f.finding_number}: dokumentasjonen har mangler`);
    const fOpen = (actions.data ?? []).filter((a) => a.compliance_finding_id === f.id && ["open", "in_progress"].includes(a.status));
    if (fOpen.length) issues.push(`Funn ${f.finding_number}: ${fOpen.length} åpne tiltak`);
    return issues;
  });

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={() => navigate("/compliance/tilsyn")}>
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Alle tilsyn
        </Button>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Select value={i.status} onValueChange={(v) => setStatus.mutate({ id: i.id, status: v as any })}>
              <SelectTrigger className="h-9 w-[210px]"><SelectValue /></SelectTrigger>
              <SelectContent>{INSPECTION_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => navigate(`/compliance/tilsyn/${i.id}/rediger`)}>
              <Pencil className="mr-1 h-3.5 w-3.5" /> Rediger sak
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{i.title}</h1>
          <ComplianceStatusBadge label={inspectionTypeLabel(i.inspection_type)} tone="neutral" />
          <ComplianceStatusBadge label={statusMeta.label} tone={statusMeta.tone} />
          <ComplianceStatusBadge label={deadlineLabel(days)} tone={deadlineTone(days)} />
          <ComplianceStatusBadge label={docMeta.label} tone={docMeta.tone} />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span>{i.authority_name ?? "Myndighet ikke satt"}</span>
          <span>Saksnr: {i.case_number ?? "–"}</span>
          <span>Tilsynsdato: {formatDate(i.inspection_date)}</span>
          <span>Svarfrist: {formatDate(i.response_deadline)}</span>
          <span>Ansvarlig: {nameOf(i.responsible_person_id)}</span>
          <span>{(findings.data ?? []).length} funn · {openActions.length} åpne tiltak</span>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Oversikt</TabsTrigger>
          <TabsTrigger value="findings">Funn &amp; avvik</TabsTrigger>
          <TabsTrigger value="actions">Tiltak</TabsTrigger>
          <TabsTrigger value="documentation">Dokumentasjon</TabsTrigger>
          <TabsTrigger value="response">Svarpakke</TabsTrigger>
          <TabsTrigger value="correspondence">Korrespondanse</TabsTrigger>
          <TabsTrigger value="history">Historikk</TabsTrigger>
        </TabsList>

        {/* Oversikt */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Funn totalt", value: (findings.data ?? []).length },
              { label: "Avvik", value: (findings.data ?? []).filter((f) => f.finding_type === "deviation").length },
              { label: "Åpne tiltak", value: openActions.length },
              { label: "Funn uten svartekst", value: (findings.data ?? []).filter((f) => !f.response_text?.trim()).length },
            ].map((k) => (
              <Card key={k.label}><CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</p>
                <p className="text-xl font-semibold">{k.value}</p>
              </CardContent></Card>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Omfang og beskrivelse</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">
                {i.description?.trim() || "Ingen beskrivelse registrert."}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Kontaktperson</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>{i.contact_name ?? "Ikke registrert"}</p>
                {i.contact_email && <p className="text-muted-foreground">{i.contact_email}</p>}
                {i.contact_phone && <p className="text-muted-foreground">{i.contact_phone}</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Funn */}
        <TabsContent value="findings" className="mt-4 space-y-3">
          {canEdit && (
            newFinding.open ? (
              <Card><CardContent className="space-y-3 p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Tittel på funnet *</Label>
                    <Input value={newFinding.title} onChange={(e) => setNewFinding((s) => ({ ...s, title: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Type</Label>
                    <Select value={newFinding.type} onValueChange={(v) => setNewFinding((s) => ({ ...s, type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{FINDING_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Originaltekst fra tilsynsrapporten</Label>
                  <Textarea rows={4} value={newFinding.original}
                    onChange={(e) => setNewFinding((s) => ({ ...s, original: e.target.value }))}
                    placeholder="Lim inn teksten slik den står i rapporten" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setNewFinding({ open: false, title: "", type: "deviation", original: "" })}>Avbryt</Button>
                  <Button size="sm" disabled={!newFinding.title.trim() || findingMut.save.isPending}
                    onClick={() => findingMut.save.mutate(
                      { inspection_id: i.id, title: newFinding.title.trim(), finding_type: newFinding.type as any, original_text: newFinding.original || null, status: "new" } as any,
                      { onSuccess: () => setNewFinding({ open: false, title: "", type: "deviation", original: "" }) },
                    )}>Registrer funn</Button>
                </div>
              </CardContent></Card>
            ) : (
              <Button size="sm" onClick={() => setNewFinding((s) => ({ ...s, open: true }))}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Registrer funn fra rapport
              </Button>
            )
          )}
          {(findings.data ?? []).length === 0 ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">Ingen funn registrert på saken.</CardContent></Card>
          ) : (
            (findings.data ?? []).map((f) => (
              <FindingCard
                key={f.id}
                finding={f}
                inspectionId={i.id}
                evidence={(evidence.data ?? []).filter((e) => e.finding_id === f.id)}
                regulationLinks={(regulationLinks.data ?? []).filter((r) => r.finding_id === f.id)}
                actions={(actions.data ?? []).filter((a) => a.compliance_finding_id === f.id)}
                derivedDocStatus={docStatusByFinding[f.id] ?? "none"}
                canEdit={canEdit}
              />
            ))
          )}
        </TabsContent>

        {/* Tiltak */}
        <TabsContent value="actions" className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Tiltak lagres i det eksisterende tiltakssystemet (HMS) og vises både her og i HMS-oversiktene.
          </p>
          {(actions.data ?? []).length === 0 ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">Ingen tiltak opprettet. Opprett tiltak fra det aktuelle funnet.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {(actions.data ?? []).map((a) => {
                const f = (findings.data ?? []).find((x) => x.id === a.compliance_finding_id);
                const d = daysUntil(a.due_date);
                return (
                  <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm">
                    <ListChecks className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-[200px] flex-1">
                      <p className="font-medium">{a.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {f ? `Funn ${f.finding_number} · ${f.title}` : "Knyttet til saken"}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">{users.data?.find((u) => u.id === a.assignee_user_id)?.name ?? "Uten ansvarlig"}</span>
                    <ComplianceStatusBadge label={deadlineLabel(d)} tone={a.status === "completed" ? "ok" : deadlineTone(d)} />
                    <Select value={a.status} disabled={!canEdit}
                      onValueChange={(v) => actionMut.update.mutate({ id: a.id, inspection_id: i.id, status: v })}>
                      <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Åpent</SelectItem>
                        <SelectItem value="in_progress">Pågår</SelectItem>
                        <SelectItem value="completed">Gjennomført</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Dokumentasjon */}
        <TabsContent value="documentation" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Dokumentasjon på saksnivå</CardTitle></CardHeader>
            <CardContent>
              <p className="mb-3 text-xs text-muted-foreground">
                Referanser til eksisterende dokumentasjon i systemet. Ingenting kopieres – alt peker på originalen.
              </p>
              <FindingEvidencePanel
                inspectionId={i.id}
                findingId={""}
                evidence={(evidence.data ?? []).filter((e) => !e.finding_id)}
                canEdit={canEdit}
              />
            </CardContent>
          </Card>
          <div className="space-y-2">
            {(findings.data ?? []).map((f) => {
              const meta = DOCUMENTATION_STATUSES[docStatusByFinding[f.id] ?? "none"];
              return (
                <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm">
                  <span className="min-w-[200px] flex-1">Funn {f.finding_number} · {f.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {(evidence.data ?? []).filter((e) => e.finding_id === f.id).length} referanser
                  </span>
                  <ComplianceStatusBadge label={meta.label} tone={meta.tone} />
                  <Button size="sm" variant="ghost" onClick={() => setTab("findings")}>Åpne funn</Button>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* Svarpakke */}
        <TabsContent value="response" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Velg funn som skal inngå i svaret</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(findings.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Ingen funn å svare på.</p>}
              {(findings.data ?? []).map((f) => (
                <label key={f.id} className="flex items-start gap-3 rounded-md border px-3 py-2 text-sm">
                  <Checkbox className="mt-0.5" checked={!!selected[f.id]}
                    onCheckedChange={(v) => setSelected((s) => ({ ...s, [f.id]: !!v }))} />
                  <span className="flex-1">
                    <span className="font-medium">Funn {f.finding_number} · {f.title}</span>
                    <span className="mt-1 flex flex-wrap gap-2 text-xs">
                      <ComplianceStatusBadge label={DOCUMENTATION_STATUSES[docStatusByFinding[f.id] ?? "none"].label} tone={DOCUMENTATION_STATUSES[docStatusByFinding[f.id] ?? "none"].tone} />
                      {f.response_text?.trim()
                        ? <span className="text-muted-foreground">Svartekst klar</span>
                        : <span className="text-destructive">Mangler svartekst</span>}
                    </span>
                  </span>
                </label>
              ))}
            </CardContent>
          </Card>

          {selectedFindings.length > 0 && (
            <>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Kontroll før oversending</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {packageIssues.length === 0 ? (
                    <p className="flex items-center gap-2 text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Alt er på plass for de valgte funnene.</p>
                  ) : (
                    packageIssues.map((msg) => (
                      <p key={msg} className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-4 w-4" /> {msg}</p>
                    ))
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Svarpakke – utkast</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {selectedFindings.map((f) => (
                    <div key={f.id} className="space-y-2 border-b pb-4 last:border-0 last:pb-0">
                      <p className="text-sm font-semibold">Funn {f.finding_number} · {f.title}</p>
                      {f.original_text && (
                        <p className="rounded-md bg-muted/30 p-2 text-xs text-muted-foreground whitespace-pre-wrap">{f.original_text}</p>
                      )}
                      <p className="text-sm whitespace-pre-wrap">{f.response_text?.trim() || "— mangler svartekst —"}</p>
                      <p className="text-xs text-muted-foreground">
                        Tiltak: {(actions.data ?? []).filter((a) => a.compliance_finding_id === f.id).map((a) => `${a.title} (${a.status})`).join("; ") || "ingen"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Dokumentasjon: {(evidence.data ?? []).filter((e) => e.finding_id === f.id).map((e) => e.label ?? e.source_kind).join("; ") || "ingen"}
                      </p>
                    </div>
                  ))}
                  {canEdit && (
                    <div className="flex justify-end">
                      <Button size="sm" disabled={packageIssues.length > 0}
                        onClick={() => setStatus.mutate({ id: i.id, status: "submitted" })}>
                        <Mail className="mr-1.5 h-3.5 w-3.5" /> Marker som oversendt
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Korrespondanse */}
        <TabsContent value="correspondence" className="mt-4 space-y-3">
          {canEdit && (
            corrForm.open ? (
              <Card><CardContent className="space-y-3 p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label className="text-xs">Retning</Label>
                    <Select value={corrForm.direction} onValueChange={(v) => setCorrForm((s) => ({ ...s, direction: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CORRESPONDENCE_DIRECTIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Dato</Label>
                    <Input type="date" value={corrForm.occurred_at} onChange={(e) => setCorrForm((s) => ({ ...s, occurred_at: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Kontaktperson</Label>
                    <Input value={corrForm.contact_name} onChange={(e) => setCorrForm((s) => ({ ...s, contact_name: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Emne</Label>
                  <Input value={corrForm.subject} onChange={(e) => setCorrForm((s) => ({ ...s, subject: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Notat</Label>
                  <Textarea rows={3} value={corrForm.notes} onChange={(e) => setCorrForm((s) => ({ ...s, notes: e.target.value }))} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setCorrForm({ open: false, direction: "in", contact_name: "", subject: "", notes: "", occurred_at: "" })}>Avbryt</Button>
                  <Button size="sm" onClick={() => corrMut.save.mutate(
                    {
                      inspection_id: i.id, direction: corrForm.direction, contact_name: corrForm.contact_name || null,
                      subject: corrForm.subject || null, notes: corrForm.notes || null,
                      occurred_at: corrForm.occurred_at ? new Date(corrForm.occurred_at).toISOString() : new Date().toISOString(),
                    },
                    { onSuccess: () => setCorrForm({ open: false, direction: "in", contact_name: "", subject: "", notes: "", occurred_at: "" }) },
                  )}>Lagre</Button>
                </div>
              </CardContent></Card>
            ) : (
              <Button size="sm" onClick={() => setCorrForm((s) => ({ ...s, open: true }))}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Ny oppføring
              </Button>
            )
          )}
          {(correspondence.data ?? []).length === 0 ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">Ingen korrespondanse loggført.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {(correspondence.data ?? []).map((c) => (
                <div key={c.id} className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3 text-sm">
                  <Mail className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{c.subject ?? correspondenceLabel(c.direction)}</p>
                    <p className="text-xs text-muted-foreground">
                      {correspondenceLabel(c.direction)} · {formatDate(c.occurred_at)}{c.contact_name ? ` · ${c.contact_name}` : ""}
                    </p>
                    {c.notes && <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">{c.notes}</p>}
                  </div>
                  {canEdit && (
                    <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-destructive"
                      onClick={() => corrMut.remove.mutate(c.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Historikk */}
        <TabsContent value="history" className="mt-4">
          {(events.data ?? []).length === 0 ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">Ingen hendelser loggført ennå.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {(events.data ?? []).map((e) => (
                <div key={e.id} className="flex items-start gap-3 rounded-lg border bg-card px-4 py-2.5 text-sm">
                  <History className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p>{e.summary ?? e.event_type}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleString("nb-NO")}
                      {e.actor_user_id ? ` · ${users.data?.find((u) => u.id === e.actor_user_id)?.name ?? "Ukjent bruker"}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
