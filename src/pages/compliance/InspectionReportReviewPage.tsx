/**
 * Kontrollside etter AI-analyse av en mottatt tilsynsrapport.
 *
 * Dette er en KONTROLLFLATE for importen – ikke en saksbehandlingsflate.
 * Verdier vises kompakt og lesbart; redigering skjer inline bak
 * «Rediger opplysninger» per funn. Rapportens ordlyd vises tydelig atskilt
 * fra AI sin interne vurdering, og manglende data vises som
 * «Ikke funnet i rapport». Ingen modaler, ingen prosentvis sikkerhet.
 * Ingenting lagres før «Godkjenn og opprett tilsyn».
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, ExternalLink, FileText, Info, Pencil, Plus, RotateCcw, Sparkles, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useComplianceEmployees } from "@/hooks/useCompliance";
import { useFindingMutations, useInspectionMutations, useLogInspectionEvent } from "@/hooks/useInspections";
import { FINDING_TYPES, INSPECTION_TYPES, inspectionTypeLabel } from "@/lib/inspections";
import { formatDate } from "@/lib/compliance";
import {
  NOT_FOUND_LABEL, clearReportDraft, loadReportDraft,
  type AnalyzedFinding, type ReportAnalysis,
} from "@/lib/inspection-report";
import { validateAnalysis } from "@/lib/inspection-report-validation";

interface DraftFinding extends AnalyzedFinding {
  key: string;
  included: boolean;
  manual: boolean;
}

function MissingHint({ value }: { value: string | null }) {
  if (value) return null;
  return <span className="text-[11px] text-muted-foreground">{NOT_FOUND_LABEL}</span>;
}

/** Kompakt lesevisning av en verdi fra rapporten */
function ReadValue({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      {value ? (
        <p className={`text-sm ${mono ? "font-medium" : ""}`}>{value}</p>
      ) : (
        <p className="text-sm italic text-muted-foreground">{NOT_FOUND_LABEL}</p>
      )}
    </div>
  );
}

export default function InspectionReportReviewPage() {
  const navigate = useNavigate();
  const draft = useMemo(() => loadReportDraft(), []);
  const { user } = useAuth();
  const { activeCompanyId } = useCompanyContext();
  const employees = useComplianceEmployees();
  const { save: saveInspection } = useInspectionMutations();
  const findingMut = useFindingMutations();
  const logEvent = useLogInspectionEvent();

  const [form, setForm] = useState<ReportAnalysis | null>(draft?.analysis ?? null);
  const [responsible, setResponsible] = useState<string>("none");
  const [findings, setFindings] = useState<DraftFinding[]>(
    (draft?.analysis.findings ?? []).map((f, i) => ({ ...f, key: `ai-${i}`, included: true, manual: false })),
  );
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editCase, setEditCase] = useState(false);
  const [creating, setCreating] = useState(false);

  const included = findings.filter((f) => f.included);
  const issues = useMemo(
    () => (form ? validateAnalysis(form, findings) : []),
    [form, findings],
  );
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  if (!draft || !form) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Button size="sm" variant="ghost" onClick={() => navigate("/compliance/tilsyn/ny")}>
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Nytt tilsyn
        </Button>
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Ingen analysert rapport å gå gjennom. Last opp en tilsynsrapport på nytt.
        </CardContent></Card>
      </div>
    );
  }

  const set = (patch: Partial<ReportAnalysis>) => setForm((f) => ({ ...(f as ReportAnalysis), ...patch }));
  const setFinding = (key: string, patch: Partial<DraftFinding>) =>
    setFindings((list) => list.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  const addManual = () => {
    const key = `manual-${crypto.randomUUID().slice(0, 6)}`;
    setFindings((l) => [
      ...l,
      {
        key, included: true, manual: true, reference: null, finding_type: "deviation",
        title: "", original_text: null, legal_basis: null, authority_requirement: null,
        deadline: null, internal_category: null, match_keywords: [],
      },
    ]);
    setOpen((o) => ({ ...o, [key]: true }));
  };

  const create = async () => {
    if (!form.title?.trim()) {
      toast.error("Saken må ha en tittel");
      return;
    }
    setCreating(true);
    try {
      const inspection = await saveInspection.mutateAsync({
        title: form.title.trim(),
        inspection_type: form.inspection_type as any,
        authority_name: form.authority_name,
        case_number: form.case_number,
        inspection_date: form.inspection_date,
        response_deadline: form.response_deadline,
        contact_name: form.contact_name,
        contact_email: form.contact_email,
        contact_phone: form.contact_phone,
        description: form.description,
        responsible_person_id: responsible === "none" ? null : responsible,
        status: "actions_in_progress",
      } as any);

      // Originalrapporten lagres som dokument knyttet til saken
      const { data: doc, error: docErr } = await (supabase as any)
        .from("documents")
        .insert({
          entity_type: "compliance_inspection",
          entity_id: inspection.id,
          company_id: activeCompanyId,
          category: "tilsyn",
          source_type: "upload",
          storage_bucket: draft.file.bucket,
          file_path: draft.file.path,
          file_name: draft.file.name,
          file_size: draft.file.size,
          mime_type: draft.file.mime || "application/octet-stream",
          public_url: draft.file.publicUrl,
          uploaded_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (docErr) throw docErr;

      // Rapporten kobles som bevis på saksnivå slik at den alltid er tilgjengelig
      await (supabase as any).from("compliance_finding_evidence").insert({
        company_id: activeCompanyId,
        inspection_id: inspection.id,
        finding_id: null,
        source_kind: "document",
        document_id: doc.id,
        label: `Originalrapport: ${draft.file.name}`,
        note: "Mottatt tilsynsrapport – grunnlaget for saken",
        created_by: user?.id ?? null,
      });

      let n = 0;
      for (const f of included) {
        n += 1;
        await findingMut.save.mutateAsync({
          inspection_id: inspection.id,
          finding_number: n,
          finding_type: f.finding_type,
          // Kildedata – ordrett fra rapporten
          title: f.title.trim() || `Funn ${n}`,
          report_reference: f.reference,
          original_text: f.original_text,
          legal_basis_text: f.legal_basis,
          authority_requirement: f.authority_requirement,
          authority_comment: f.authority_requirement,
          deadline: f.deadline,
          match_keywords: f.match_keywords ?? [],
          // AI-forslag lagres som forslag – ingen operative felter fylles ut her
          ai_suggestions: {
            internal_category: f.ai_suggestions?.internal_category ?? f.internal_category ?? null,
            priority: f.ai_suggestions?.priority ?? null,
            internal_assessment: f.ai_suggestions?.internal_assessment ?? null,
            proposed_solution: f.ai_suggestions?.proposed_solution ?? null,
            needed_documentation: f.ai_suggestions?.needed_documentation ?? [],
          },
          ai_suggestion_state: {},
          priority: "normal",
          status: "new",
          documentation_status: "none",
        } as any);
      }

      await logEvent({
        inspection_id: inspection.id,
        event_type: "report_imported",
        summary: `Tilsynsrapport «${draft.file.name}» analysert og godkjent – ${n} funn opprettet`,
        payload: { file_name: draft.file.name, findings_created: n, analysis_mode: draft.analysis.analysis_mode },
      });

      clearReportDraft();
      toast.success("Tilsynssaken er opprettet fra rapporten");
      navigate(`/compliance/tilsyn/${inspection.id}?tab=findings`);
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke opprette saken");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={() => navigate("/compliance/tilsyn/ny")}>
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Tilbake
        </Button>
        {draft.file.publicUrl && (
          <Button size="sm" variant="outline" asChild>
            <a href={draft.file.publicUrl} target="_blank" rel="noreferrer">
              <FileText className="mr-1.5 h-3.5 w-3.5" /> Se originalrapporten
              <ExternalLink className="ml-1.5 h-3 w-3" />
            </a>
          </Button>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Kontroller importen</h1>
          <Badge variant="secondary">{included.length} funn tas med</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {[form.authority_name, inspectionTypeLabel(form.inspection_type)].filter(Boolean).join(" / ")}
          {" · "}Saksnummer: {form.case_number ?? NOT_FOUND_LABEL}
          {" · "}Kontrolldato: {form.inspection_date ? formatDate(form.inspection_date) : NOT_FOUND_LABEL}
          {" · "}Svarfrist: {form.response_deadline ? formatDate(form.response_deadline) : NOT_FOUND_LABEL}
        </p>
        <p className="text-xs text-muted-foreground">
          Kontroller at uttrekket stemmer med rapporten. Ingenting er lagret ennå – saken opprettes først når du godkjenner.
        </p>
      </div>

      {/* Kvalitetskontroll av uttrekket */}
      {(errors.length > 0 || warnings.length > 0) ? (
        <Card className={errors.length > 0 ? "border-destructive/50" : "border-amber-500/50"}>
          <CardContent className="space-y-2 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className={`h-4 w-4 ${errors.length > 0 ? "text-destructive" : "text-amber-600"}`} />
              Kontrollpunkter i uttrekket
            </p>
            <ul className="space-y-1 text-sm">
              {[...errors, ...warnings].map((i, n) => (
                <li key={n} className="flex gap-2">
                  <span className={i.severity === "error" ? "text-destructive" : "text-amber-600"}>•</span>
                  <span className={i.severity === "error" ? "" : "text-muted-foreground"}>{i.message}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-muted-foreground">
              Kontrollen sammenligner nummerering, originaltekst, hjemmel, krav og frister i uttrekket. Rett opp der det er nødvendig – du kan opprette saken likevel.
            </p>
          </CardContent>
        </Card>
      ) : (
        <p className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          Uttrekket er konsistent: nummerering henger sammen, og alle funn har originaltekst fra rapporten.
        </p>
      )}

      {/* Saksopplysninger – kompakt lesevisning med inline redigering */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="text-base">Saksopplysninger</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setEditCase((v) => !v)}>
            {editCase ? <><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Ferdig</> : <><Pencil className="mr-1.5 h-3.5 w-3.5" /> Rediger opplysninger</>}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {!editCase ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <ReadValue label="Tittel" value={form.title} mono />
              <ReadValue label="Type tilsyn" value={inspectionTypeLabel(form.inspection_type)} />
              <ReadValue label="Tilsynsmyndighet / revisor" value={form.authority_name} />
              <ReadValue label="Saksnummer" value={form.case_number} />
              <ReadValue label="Kontrolldato" value={form.inspection_date ? formatDate(form.inspection_date) : null} />
              <ReadValue label="Svarfrist" value={form.response_deadline ? formatDate(form.response_deadline) : null} />
              <ReadValue label="Kontaktperson" value={form.contact_name} />
              <ReadValue label="E-post" value={form.contact_email} />
              <ReadValue label="Telefon" value={form.contact_phone} />
              <div className="sm:col-span-2 lg:col-span-3">
                <ReadValue label="Beskrivelse / omfang – rapportens ordlyd" value={form.description} />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label className="text-xs">Tittel *</Label>
                <Input value={form.title ?? ""} onChange={(e) => set({ title: e.target.value })} />
                <MissingHint value={form.title} />
              </div>
              <div>
                <Label className="text-xs">Type tilsyn</Label>
                <Select value={form.inspection_type} onValueChange={(v) => set({ inspection_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{INSPECTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Tilsynsmyndighet / revisor</Label>
                <Input value={form.authority_name ?? ""} onChange={(e) => set({ authority_name: e.target.value || null })} />
                <MissingHint value={form.authority_name} />
              </div>
              <div>
                <Label className="text-xs">Saksnummer</Label>
                <Input value={form.case_number ?? ""} onChange={(e) => set({ case_number: e.target.value || null })} />
                <MissingHint value={form.case_number} />
              </div>
              <div>
                <Label className="text-xs">Kontrolldato</Label>
                <Input type="date" value={form.inspection_date ?? ""} onChange={(e) => set({ inspection_date: e.target.value || null })} />
                <MissingHint value={form.inspection_date} />
              </div>
              <div>
                <Label className="text-xs">Svarfrist</Label>
                <Input type="date" value={form.response_deadline ?? ""} onChange={(e) => set({ response_deadline: e.target.value || null })} />
                <MissingHint value={form.response_deadline} />
              </div>
              <div>
                <Label className="text-xs">Kontaktperson</Label>
                <Input value={form.contact_name ?? ""} onChange={(e) => set({ contact_name: e.target.value || null })} />
                <MissingHint value={form.contact_name} />
              </div>
              <div>
                <Label className="text-xs">E-post</Label>
                <Input value={form.contact_email ?? ""} onChange={(e) => set({ contact_email: e.target.value || null })} />
                <MissingHint value={form.contact_email} />
              </div>
              <div>
                <Label className="text-xs">Telefon</Label>
                <Input value={form.contact_phone ?? ""} onChange={(e) => set({ contact_phone: e.target.value || null })} />
                <MissingHint value={form.contact_phone} />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Beskrivelse / omfang – rapportens ordlyd</Label>
                <Textarea rows={3} value={form.description ?? ""} onChange={(e) => set({ description: e.target.value || null })} />
                <MissingHint value={form.description} />
              </div>
            </div>
          )}

          <div className="max-w-sm">
            <Label className="text-xs">Ansvarlig internt</Label>
            <Select value={responsible} onValueChange={setResponsible}>
              <SelectTrigger><SelectValue placeholder="Velg" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ikke satt</SelectItem>
                {(employees.data ?? []).map((e) => <SelectItem key={e.person_id} value={e.person_id}>{e.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {form.report_summary && (
            <div className="rounded-md border border-dashed bg-muted/40 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <Sparkles className="h-3 w-3" /> AI-sammendrag (intern vurdering, lagres ikke)
              </p>
              <p className="text-sm text-muted-foreground">{form.report_summary}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Funn og avvik ({included.length} av {findings.length} tas med)</h2>
        <Button size="sm" variant="outline" onClick={addManual}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Legg til funn manuelt
        </Button>
      </div>

      <div className="space-y-2">
        {findings.map((f, idx) => {
          const typeLabel = FINDING_TYPES.find((t) => t.value === f.finding_type)?.label;
          const aiCategory = f.ai_suggestions?.internal_category ?? f.internal_category;
          const findingIssues = issues.filter((i) => i.findingKey === f.key);
          return (
            <Card key={f.key} className={f.included ? "" : "opacity-60"}>
              <Collapsible open={!!open[f.key]} onOpenChange={(v) => setOpen((o) => ({ ...o, [f.key]: v }))}>
                <div className="space-y-3 p-3 sm:p-4">
                  {/* Kompakt topplinje: nummer, klassifisering, tittel */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-mono">{f.reference ? `Nr. ${f.reference}` : `Nr. ${idx + 1}`}</Badge>
                    <Badge variant={f.finding_type === "deviation" ? "destructive" : "secondary"}>{typeLabel}</Badge>
                    <span className="min-w-[180px] flex-1 text-sm font-semibold">{f.title || "Uten tittel"}</span>
                    {f.manual && <Badge variant="outline">Lagt til manuelt</Badge>}
                    <Button size="sm" variant={f.included ? "ghost" : "outline"} onClick={() => setFinding(f.key, { included: !f.included })}>
                      {f.included ? <><Trash2 className="mr-1 h-3.5 w-3.5" /> Ta ikke med</> : "Ta med igjen"}
                    </Button>
                  </div>

                  {/* Rapporten sier – original ordlyd, lesevisning */}
                  <div className="rounded-md border-l-4 border-l-primary bg-muted/40 px-3 py-2">
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Rapporten sier – original ordlyd
                    </p>
                    {f.original_text ? (
                      <p className="whitespace-pre-wrap text-sm">{f.original_text}</p>
                    ) : (
                      <p className="text-sm italic text-muted-foreground">{NOT_FOUND_LABEL}</p>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <ReadValue label="Rapportens krav" value={f.authority_requirement} />
                    </div>
                    <ReadValue label="Hjemmel / paragraf" value={f.legal_basis} mono />
                    <ReadValue label="Frist i rapporten" value={f.deadline ? formatDate(f.deadline) : null} />
                  </div>

                  {aiCategory && (
                    <p className="flex flex-wrap items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 text-xs text-muted-foreground">
                      <Sparkles className="h-3 w-3" />
                      <span className="font-medium uppercase tracking-wide">AI-kategorisering (intern vurdering)</span>
                      <span>· {aiCategory}</span>
                      <span className="text-[11px]">– ikke tekst fra tilsynsmyndigheten</span>
                    </p>
                  )}

                  {findingIssues.length > 0 && (
                    <ul className="space-y-1">
                      {findingIssues.map((i, n) => (
                        <li key={n} className={`flex items-start gap-1.5 text-xs ${i.severity === "error" ? "text-destructive" : "text-amber-600"}`}>
                          <Info className="mt-0.5 h-3 w-3 shrink-0" />
                          {i.message}
                        </li>
                      ))}
                    </ul>
                  )}

                  <CollapsibleTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-8 px-2 text-xs">
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      {open[f.key] ? "Skjul redigering" : "Rediger opplysninger"}
                      <ChevronDown className={`ml-1 h-3.5 w-3.5 transition-transform ${open[f.key] ? "rotate-180" : ""}`} />
                    </Button>
                  </CollapsibleTrigger>
                </div>

                <CollapsibleContent>
                  <CardContent className="grid gap-4 border-t pt-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Tittel</Label>
                      <Input value={f.title} onChange={(e) => setFinding(f.key, { title: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Klassifisering</Label>
                      <Select value={f.finding_type} onValueChange={(v) => setFinding(f.key, { finding_type: v as any })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{FINDING_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Nummer/referanse i rapporten</Label>
                      <Input value={f.reference ?? ""} onChange={(e) => setFinding(f.key, { reference: e.target.value || null })} />
                      <MissingHint value={f.reference} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Originaltekst – rapportens ordlyd</Label>
                      <Textarea
                        rows={4}
                        value={f.original_text ?? ""}
                        onChange={(e) => setFinding(f.key, { original_text: e.target.value || null })}
                        placeholder="Lim inn teksten slik den står i rapporten"
                      />
                      <MissingHint value={f.original_text} />
                    </div>
                    <div>
                      <Label className="text-xs">Krav / hjemmel / paragraf</Label>
                      <Input value={f.legal_basis ?? ""} onChange={(e) => setFinding(f.key, { legal_basis: e.target.value || null })} />
                      <MissingHint value={f.legal_basis} />
                    </div>
                    <div>
                      <Label className="text-xs">Frist for dette funnet</Label>
                      <Input type="date" value={f.deadline ?? ""} onChange={(e) => setFinding(f.key, { deadline: e.target.value || null })} />
                      <MissingHint value={f.deadline} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Hva kreves rettet eller dokumentert – rapportens ordlyd</Label>
                      <Textarea rows={2} value={f.authority_requirement ?? ""}
                        onChange={(e) => setFinding(f.key, { authority_requirement: e.target.value || null })} />
                      <MissingHint value={f.authority_requirement} />
                    </div>
                    <div className="sm:col-span-2 rounded-md border border-dashed p-3">
                      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        <Sparkles className="h-3 w-3" /> AI-kategorisering (intern vurdering)
                      </p>
                      <Input
                        value={aiCategory ?? ""}
                        onChange={(e) => setFinding(f.key, {
                          internal_category: e.target.value || null,
                          ai_suggestions: { ...(f.ai_suggestions ?? {}), internal_category: e.target.value || null },
                        })}
                        placeholder="Kort intern kategori"
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Intern vurdering – ikke tekst fra tilsynsmyndigheten.
                      </p>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={() => { clearReportDraft(); navigate("/compliance/tilsyn/ny"); }}>
          Forkast analysen
        </Button>
        <Button disabled={creating || !form.title?.trim()} onClick={create}>
          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
          {creating ? "Oppretter…" : "Godkjenn og opprett tilsyn"}
        </Button>
      </div>
    </div>
  );
}
