/**
 * Internkontroll / internrevisjon – systemstøttet gjennomgang.
 *
 * Revisjonsopplysninger (AI kan forhåndsutfylle) + systemfakta fra MCS +
 * manuelle kontrollpunkter + eksplisitt fullføring med automatisk referat.
 * Ingen modaler.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ComplianceStatusBadge } from "@/components/compliance/ComplianceStatusBadge";
import { AuditSystemReview } from "@/components/compliance/AuditSystemReview";
import { AuditCheckpoints } from "@/components/compliance/AuditCheckpoints";
import { AuditCompletion } from "@/components/compliance/AuditCompletion";
import { CheckCircle2, FileText, ListChecks, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import {
  useComplianceAudits, useAuditMutations, useAuditActions, useComplianceEmployees,
  type ComplianceAudit,
} from "@/hooks/useCompliance";
import { useAuditSystemReview, useCompleteAudit } from "@/hooks/useAuditReview";
import { AUDIT_STATUSES, formatDate } from "@/lib/compliance";
import { clearInternalControlDraft, loadInternalControlDraft } from "@/lib/finding-workflow";
import {
  auditPreflight, checkpointAnswerMeta, parseCheckpoints, suggestCheckpoints,
  type AuditCheckpoint,
} from "@/lib/internal-control";
import { toast } from "sonner";

const EMPTY: Partial<ComplianceAudit> = {
  title: "", audit_type: "internal_control", planned_date: null, performed_at: null,
  responsible_person_id: null, participants: [], areas: [],
  findings: "", deviations: "", improvements: "", conclusion: "", status: "planned",
};

export default function ComplianceInternalControlPage() {
  const audits = useComplianceAudits();
  const employees = useComplianceEmployees();
  const actions = useAuditActions();
  const { save, remove, createAction } = useAuditMutations();
  const complete = useCompleteAudit();

  const [editing, setEditing] = useState<Partial<ComplianceAudit> | null>(null);
  const [checkpoints, setCheckpoints] = useState<AuditCheckpoint[]>([]);
  /** Satt når skjemaet er forhåndsutfylt av AI fra et tilsynsfunn */
  const [aiPrefilled, setAiPrefilled] = useState(false);
  const [actionFor, setActionFor] = useState<string | null>(null);
  const [actionForm, setActionForm] = useState({ title: "", description: "", due_date: "" });

  const { facts, loading: factsLoading } = useAuditSystemReview(editing?.id ?? null);

  /* Utkast forberedt fra et tilsynsfunn – aldri gjennomført uten brukerhandling */
  useEffect(() => {
    const d = loadInternalControlDraft();
    if (!d) return;
    clearInternalControlDraft();
    setEditing({
      ...EMPTY,
      title: d.title,
      areas: d.areas,
      findings: d.findings,
      deviations: d.deviations,
      improvements: d.improvements,
      status: "planned",
      performed_at: null,
      source_finding_id: d.source.findingId,
      source_inspection_id: d.source.inspectionId,
    });
    setCheckpoints([]);
    setAiPrefilled(true);
  }, []);

  const nameOf = (id: string | null | undefined) =>
    (employees.data ?? []).find((p) => p.person_id === id)?.full_name ?? "–";

  const { last, next } = useMemo(() => {
    const list = audits.data ?? [];
    const performed = list.filter((a) => a.performed_at).sort((a, b) => (a.performed_at! < b.performed_at! ? 1 : -1));
    const planned = list.filter((a) => !a.performed_at && a.planned_date).sort((a, b) => (a.planned_date! > b.planned_date! ? 1 : -1));
    return { last: performed[0] ?? null, next: planned[0] ?? null };
  }, [audits.data]);

  const set = (patch: Partial<ComplianceAudit>) => setEditing((e) => ({ ...(e ?? {}), ...patch }));
  const closeEditor = () => { setEditing(null); setCheckpoints([]); setAiPrefilled(false); };
  const openEditor = (a: ComplianceAudit | null) => {
    setEditing(a ?? { ...EMPTY });
    setCheckpoints(parseCheckpoints(a?.checkpoints));
    setAiPrefilled(false);
  };

  const ownActions = (auditId: string | null | undefined) =>
    (actions.data ?? []).filter((x) => x.compliance_audit_id === auditId);

  const preflight = useMemo(
    () =>
      auditPreflight(
        {
          performed_at: editing?.performed_at ?? null,
          responsible_person_id: editing?.responsible_person_id ?? null,
          participants: editing?.participants ?? [],
          areas: editing?.areas ?? [],
          findings: editing?.findings ?? null,
          deviations: editing?.deviations ?? null,
          improvements: editing?.improvements ?? null,
          conclusion: editing?.conclusion ?? null,
        },
        checkpoints,
        ownActions(editing?.id),
        facts,
      ),
    [editing, checkpoints, actions.data, facts],
  );

  /** Lagrer opplysninger + kontrollpunkter og returnerer revisjonens id */
  const persist = async (extra: Partial<ComplianceAudit> = {}) => {
    if (!editing) return null;
    const row = await save.mutateAsync({ ...editing, checkpoints, ...extra } as any);
    if (row?.id && !editing.id) setEditing((e) => ({ ...(e ?? {}), id: row.id }));
    return row?.id ?? editing.id ?? null;
  };

  const onComplete = async () => {
    const id = await persist();
    if (!id || !editing) return;
    await complete.mutateAsync({
      auditId: id,
      checkpoints,
      facts,
      report: {
        title: editing.title ?? "Internrevisjon",
        performed_at: editing.performed_at ?? new Date().toISOString().slice(0, 10),
        planned_date: editing.planned_date ?? null,
        responsibleName: editing.responsible_person_id ? nameOf(editing.responsible_person_id) : null,
        participants: editing.participants ?? [],
        areas: editing.areas ?? [],
        findings: editing.findings ?? null,
        deviations: editing.deviations ?? null,
        improvements: editing.improvements ?? null,
        conclusion: editing.conclusion ?? null,
        facts,
        checkpoints,
        actions: ownActions(id).map((a) => ({ title: a.title, status: a.status, due_date: a.due_date })),
        sourceLabel: editing.source_finding_id ? "Startet fra tilsynsfunn" : null,
      },
    });
    closeEditor();
  };

  const openReport = (documentId: string | null | undefined, markdown?: string | null) => {
    if (markdown) {
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(`<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap;padding:24px">${markdown.replace(/</g, "&lt;")}</pre>`);
        w.document.close();
        return;
      }
    }
    if (!documentId) toast.error("Referatet er ikke tilgjengelig");
  };

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Internkontroll</h1>
          <p className="text-sm text-muted-foreground">Systemstøttet, dokumentert gjennomgang av internkontrollsystemet</p>
        </div>
        <Button size="sm" onClick={() => openEditor(null)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Ny internrevisjon
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Siste internrevisjon</p>
            <p className="text-lg font-semibold">{last ? formatDate(last.performed_at) : "Ikke registrert"}</p>
            <p className="text-xs text-muted-foreground">{last?.title ?? "Ingen gjennomført revisjon"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Neste planlagte</p>
            <p className="text-lg font-semibold">{next ? formatDate(next.planned_date) : "Ikke planlagt"}</p>
            <p className="text-xs text-muted-foreground">{next?.title ?? "Legg inn en planlagt revisjon"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Inline arbeidsflate – ingen modal */}
      {editing && (
        <Card className={aiPrefilled ? "border-primary/40" : undefined}>
          <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
            <div className="space-y-1">
              <CardTitle className="text-base">{editing.id ? "Internrevisjon" : "Ny internrevisjon"}</CardTitle>
              {aiPrefilled && (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-primary/40 text-[10px] text-primary">
                    <Sparkles className="mr-1 h-3 w-3" /> AI-forhåndsutfylt utkast
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Kontroller innholdet. Revisjonen er ikke gjennomført før du selv fullfører den.
                  </span>
                </div>
              )}
              {editing.source_finding_id && (
                <p className="text-xs text-muted-foreground">Koblet til tilsynsfunn – koblingen beholdes etter fullføring.</p>
              )}
            </div>
            <Button size="sm" variant="ghost" onClick={closeEditor}><X className="h-3.5 w-3.5" /></Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Tittel</Label>
                <Input value={editing.title ?? ""} onChange={(e) => set({ title: e.target.value })} placeholder="Årlig gjennomgang av internkontroll" />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Planlagt</Label>
                  <Input type="date" value={editing.planned_date ?? ""} onChange={(e) => set({ planned_date: e.target.value || null })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Gjennomført</Label>
                  <Input type="date" value={editing.performed_at ?? ""} onChange={(e) => set({ performed_at: e.target.value || null })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={editing.status ?? "planned"} onValueChange={(v) => set({ status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{AUDIT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Ansvarlig</Label>
                  <Select value={editing.responsible_person_id ?? "none"} onValueChange={(v) => set({ responsible_person_id: v === "none" ? null : v })}>
                    <SelectTrigger><SelectValue placeholder="Velg" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Ikke satt</SelectItem>
                      {(employees.data ?? []).map((p) => <SelectItem key={p.person_id} value={p.person_id}>{p.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Deltakere (kommaseparert)</Label>
                  <Input
                    value={(editing.participants ?? []).join(", ")}
                    onChange={(e) => set({ participants: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Områder gjennomgått (kommaseparert)</Label>
                <Input
                  value={(editing.areas ?? []).join(", ")}
                  onChange={(e) => set({ areas: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  placeholder="Kompetanse, FSE, dokumentasjon, avvikshåndtering"
                />
              </div>
              {(["findings", "deviations", "improvements", "conclusion"] as const).map((k) => (
                <div key={k} className="space-y-1.5">
                  <Label>
                    {k === "findings" ? "Bakgrunn og omfang" : k === "deviations" ? "Avvik" : k === "improvements" ? "Forbedringspunkter" : "Konklusjon"}
                  </Label>
                  <Textarea rows={k === "findings" ? 4 : 2} value={(editing[k] as string) ?? ""} onChange={(e) => set({ [k]: e.target.value } as any)} />
                </div>
              ))}
            </div>

            {/* Systemfakta fra MCS */}
            <AuditSystemReview facts={facts} loading={factsLoading} />

            {/* Manuelle kontrollpunkter */}
            <AuditCheckpoints
              checkpoints={checkpoints}
              onChange={setCheckpoints}
              canCreateAction={!!editing.id}
              onSuggest={() => {
                const suggested = suggestCheckpoints({
                  background: editing.findings ?? "",
                  areas: editing.areas ?? [],
                  facts,
                  existing: checkpoints,
                });
                if (!suggested.length) { toast.info("Ingen nye kontrollpunkter å foreslå"); return; }
                setCheckpoints([...checkpoints, ...suggested]);
                toast.success(`${suggested.length} kontrollpunkter foreslått – merket som AI-forslag`);
              }}
              onCreateAction={async (cp) => {
                if (!editing.id) return null;
                const id = await createAction.mutateAsync({
                  audit_id: editing.id,
                  title: cp.question.slice(0, 160),
                  description: [cp.area ? `Område: ${cp.area}` : null, cp.comment].filter(Boolean).join("\n") || undefined,
                  due_date: null,
                  priority: cp.answer === "not_fulfilled" ? "high" : "medium",
                });
                return (id as string) ?? null;
              }}
            />

            {/* Fullføring */}
            <AuditCompletion
              preflight={preflight}
              completed={!!editing.completed_at}
              completedAt={editing.completed_at ?? null}
              reportDocumentId={editing.report_document_id ?? null}
              pending={complete.isPending || save.isPending}
              onComplete={onComplete}
              onOpenReport={() => openReport(editing.report_document_id, editing.report_markdown)}
            />

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={!editing.title || save.isPending} onClick={() => persist()}>
                {save.isPending ? "Lagrer…" : "Lagre gjennomgang"}
              </Button>
              <Button variant="ghost" onClick={closeEditor}>Lukk</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {audits.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (audits.data ?? []).length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Ingen internrevisjoner registrert.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {(audits.data ?? []).map((a) => {
            const statusMeta = AUDIT_STATUSES.find((s) => s.value === a.status);
            const own = ownActions(a.id);
            const cps = parseCheckpoints(a.checkpoints);
            const openCps = cps.filter((c) => !c.answer).length;
            return (
              <Card key={a.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{a.title}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {a.performed_at ? `Gjennomført ${formatDate(a.performed_at)}` : `Planlagt ${formatDate(a.planned_date)}`}
                      {" · Ansvarlig: "}{nameOf(a.responsible_person_id)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.completed_at && (
                      <Badge variant="outline" className="border-emerald-500/40 text-[10px] text-emerald-600">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Fullført
                      </Badge>
                    )}
                    {statusMeta && <ComplianceStatusBadge label={statusMeta.label} tone={statusMeta.tone} />}
                    <Button size="sm" variant="outline" className="h-8" onClick={() => openEditor(a)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => remove.mutate(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {a.areas?.length > 0 && <p><span className="text-muted-foreground">Områder:</span> {a.areas.join(", ")}</p>}
                  {a.participants?.length > 0 && <p><span className="text-muted-foreground">Deltakere:</span> {a.participants.join(", ")}</p>}
                  {a.deviations && <p><span className="text-muted-foreground">Avvik:</span> {a.deviations}</p>}
                  {a.improvements && <p><span className="text-muted-foreground">Forbedringspunkter:</span> {a.improvements}</p>}
                  {a.conclusion && <p><span className="text-muted-foreground">Konklusjon:</span> {a.conclusion}</p>}

                  {cps.length > 0 && (
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <ListChecks className="h-3.5 w-3.5" /> {cps.length} kontrollpunkter
                      {openCps ? ` · ${openCps} ubesvart` : " · alle behandlet"}
                      {cps.filter((c) => c.answer === "not_fulfilled").length
                        ? ` · ${cps.filter((c) => c.answer === "not_fulfilled").length} ikke oppfylt`
                        : ""}
                    </p>
                  )}

                  {a.report_markdown && (
                    <Button size="sm" variant="outline" className="h-8"
                      onClick={() => openReport(a.report_document_id, a.report_markdown)}>
                      <FileText className="mr-1.5 h-3.5 w-3.5" /> Revisjonsreferat
                    </Button>
                  )}

                  <div className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <ListChecks className="h-3.5 w-3.5" /> Tiltak ({own.length})
                      </p>
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => { setActionFor(a.id); setActionForm({ title: "", description: "", due_date: "" }); }}>
                        <Plus className="mr-1 h-3 w-3" /> Nytt tiltak
                      </Button>
                    </div>
                    {own.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {own.map((x) => (
                          <li key={x.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate">{x.title}</span>
                            <span className="shrink-0 text-muted-foreground">
                              {x.due_date ? formatDate(x.due_date) : "uten frist"} · {x.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {actionFor === a.id && (
                      <div className="mt-3 space-y-2 rounded-md border p-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Tittel</Label>
                          <Input value={actionForm.title} onChange={(e) => setActionForm({ ...actionForm, title: e.target.value })} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Beskrivelse</Label>
                          <Textarea rows={2} value={actionForm.description} onChange={(e) => setActionForm({ ...actionForm, description: e.target.value })} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Frist</Label>
                          <Input type="date" value={actionForm.due_date} onChange={(e) => setActionForm({ ...actionForm, due_date: e.target.value })} />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" disabled={!actionForm.title || createAction.isPending}
                            onClick={async () => {
                              await createAction.mutateAsync({
                                audit_id: a.id,
                                title: actionForm.title,
                                description: actionForm.description || undefined,
                                due_date: actionForm.due_date || null,
                              });
                              setActionFor(null);
                            }}>Opprett tiltak</Button>
                          <Button size="sm" variant="ghost" onClick={() => setActionFor(null)}>Avbryt</Button>
                        </div>
                      </div>
                    )}
                    <p className="mt-2 text-[11px] text-muted-foreground">Tiltak gjenbruker HMS-tiltakssystemet og følges opp der.</p>
                  </div>

                  {cps.some((c) => c.answer) && (
                    <div className="rounded-lg border p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Vurderinger</p>
                      <ul className="mt-2 space-y-1 text-xs">
                        {cps.filter((c) => c.answer).slice(0, 6).map((c) => (
                          <li key={c.id} className="flex items-start justify-between gap-2">
                            <span className="flex-1">{c.question}</span>
                            <span className="shrink-0 text-muted-foreground">{checkpointAnswerMeta(c.answer).label}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
