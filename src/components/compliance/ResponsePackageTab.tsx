import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ComplianceStatusBadge } from "@/components/compliance/ComplianceStatusBadge";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Eye, FileText, Paperclip, Send, UserCog } from "lucide-react";
import { TONE_DOT, formatDate } from "@/lib/compliance";
import { FINDING_TYPES } from "@/lib/inspections";
import type { Finding, FindingEvidence, Inspection, InspectionAction } from "@/hooks/useInspections";
import { useFindingMutations } from "@/hooks/useInspections";
import { useAttachmentCandidates, useCompetenceCoverageDetails, useResponsePackages, buildPreflight } from "@/hooks/useResponsePackages";
import { buildExportNames, defaultClosing, defaultIntro, defaultSubject, loadResponseDraft, saveResponseDraft } from "@/lib/response-package";

const OVERALL_META: Record<string, { label: string; tone: "ok" | "warn" | "alert" }> = {
  ready: { label: "Klar", tone: "ok" },
  review: { label: "Krever vurdering", tone: "warn" },
  missing: { label: "Mangler", tone: "alert" },
};

interface Props {
  inspection: Inspection;
  findings: Finding[];
  evidence: FindingEvidence[];
  actions: InspectionAction[];
  companyName: string | null;
  canEdit: boolean;
}

export function ResponsePackageTab({ inspection, findings, evidence, actions, companyName, canEdit }: Props) {
  const navigate = useNavigate();
  const findingMut = useFindingMutations(inspection.id);
  const { candidates, loading } = useAttachmentCandidates(findings, evidence, actions);
  const { detailFor } = useCompetenceCoverageDetails();
  const packages = useResponsePackages(inspection.id);

  const [selectedFindings, setSelectedFindings] = useState<Set<string>>(new Set());
  const [selectedAttachments, setSelectedAttachments] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>({});
  const [initialised, setInitialised] = useState(false);

  // Åpner vi fanen på nytt tar vi opp der brukeren slapp
  useEffect(() => {
    if (initialised || loading) return;
    const saved = loadResponseDraft(inspection.id);
    if (saved) {
      setSelectedFindings(new Set(saved.finding_ids));
      setSelectedAttachments(new Set(saved.attachment_keys));
    } else {
      const open = findings.filter((f) => f.status !== "closed").map((f) => f.id);
      setSelectedFindings(new Set(open));
      setSelectedAttachments(new Set(candidates.filter((c) => open.includes(c.finding_id ?? "")).map((c) => c.key)));
    }
    setInitialised(true);
  }, [initialised, loading, findings, candidates, inspection.id]);

  const preflight = useMemo(
    () => buildPreflight({ findings, evidence, actions, candidates, selectedAttachmentKeys: selectedAttachments, detailFor }),
    [findings, evidence, actions, candidates, selectedAttachments, detailFor],
  );

  const chosenFindings = findings.filter((f) => selectedFindings.has(f.id));
  const chosenAttachments = candidates.filter((c) => selectedAttachments.has(c.key) && selectedFindings.has(c.finding_id ?? ""));
  const exportNames = useMemo(() => buildExportNames(chosenAttachments), [chosenAttachments]);
  const blocking = preflight.filter((p) => selectedFindings.has(p.finding_id) && p.overall === "missing");

  const toggleFinding = (id: string) => {
    setSelectedFindings((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAttachment = (key: string) => {
    setSelectedAttachments((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const goToPreview = () => {
    const existing = loadResponseDraft(inspection.id);
    saveResponseDraft({
      inspection_id: inspection.id,
      finding_ids: [...selectedFindings],
      attachment_keys: [...selectedAttachments],
      recipient_name: existing?.recipient_name ?? inspection.contact_name ?? "",
      recipient_email: existing?.recipient_email ?? inspection.contact_email ?? "",
      cc: existing?.cc ?? "",
      subject: existing?.subject ?? defaultSubject({ authority: inspection.authority_name, companyName, caseNumber: inspection.case_number }),
      intro: existing?.intro ?? defaultIntro({ contactName: inspection.contact_name, inspectionDate: inspection.inspection_date, authority: inspection.authority_name }),
      closing: existing?.closing ?? defaultClosing(companyName),
    });
    navigate(`/compliance/tilsyn/${inspection.id}/svarpakke`);
  };

  return (
    <div className="space-y-4">
      {/* Steg 1: velg funn */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">1. Velg avvik som skal besvares</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {findings.length === 0 && <p className="text-sm text-muted-foreground">Ingen funn å svare på.</p>}
          {findings.map((f) => {
            const pf = preflight.find((p) => p.finding_id === f.id);
            const meta = OVERALL_META[pf?.overall ?? "missing"];
            const fCandidates = candidates.filter((c) => c.finding_id === f.id);
            const isOpen = expanded.has(f.id);
            const typeLabel = FINDING_TYPES.find((t) => t.value === f.finding_type)?.label ?? f.finding_type;
            return (
              <div key={f.id} className="rounded-lg border bg-card">
                <div className="flex flex-wrap items-start gap-3 px-3 py-3">
                  <Checkbox className="mt-0.5" checked={selectedFindings.has(f.id)} onCheckedChange={() => toggleFinding(f.id)} disabled={!canEdit} />
                  <div className="min-w-[220px] flex-1">
                    <p className="text-sm font-medium">Avvik {f.finding_number} · {f.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {typeLabel}
                      {f.deadline ? ` · frist ${formatDate(f.deadline)}` : ""}
                      {` · ${fCandidates.length} mulige vedlegg`}
                    </p>
                  </div>
                  <ComplianceStatusBadge label={meta.label} tone={meta.tone} />
                  <Button size="sm" variant="ghost" onClick={() => setExpanded((p) => { const n = new Set(p); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n; })}>
                    {isOpen ? <ChevronDown className="mr-1 h-3.5 w-3.5" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
                    Kontroll og svartekst
                  </Button>
                </div>

                {isOpen && (
                  <div className="space-y-4 border-t px-3 py-3">
                    {/* Pre-flight */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kontroll</p>
                      {(pf?.checks ?? []).map((c, idx) => (
                        <div key={`${c.label}-${idx}`} className="flex flex-wrap items-center gap-2 text-sm">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[c.tone]}`} />
                          <span className={c.tone === "alert" ? "text-destructive" : c.tone === "warn" ? "text-amber-600" : ""}>{c.label}</span>
                          {c.people?.slice(0, 6).map((p) => (
                            <Button key={p.person_id} size="sm" variant="outline" className="h-6 px-2 text-xs"
                              onClick={() => navigate(`/hms/ansatte/${p.person_id}?tab=competence`)}>
                              <UserCog className="mr-1 h-3 w-3" /> {p.name}
                            </Button>
                          ))}
                          {c.people && c.people.length > 6 && (
                            <span className="text-xs text-muted-foreground">+{c.people.length - 6} flere</span>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Svartekst */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Svartekst til myndigheten</p>
                      {f.original_text && (
                        <p className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground whitespace-pre-wrap">
                          Fra rapporten: {f.original_text}
                        </p>
                      )}
                      <Textarea
                        rows={4}
                        disabled={!canEdit}
                        value={responseDrafts[f.id] ?? f.response_text ?? ""}
                        onChange={(e) => setResponseDrafts((s) => ({ ...s, [f.id]: e.target.value }))}
                        placeholder="Beskriv hva som er gjort, og hvilken dokumentasjon som følger vedlagt."
                      />
                      {canEdit && (responseDrafts[f.id] ?? f.response_text ?? "") !== (f.response_text ?? "") && (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setResponseDrafts((s) => { const n = { ...s }; delete n[f.id]; return n; })}>Forkast</Button>
                          <Button size="sm" disabled={findingMut.save.isPending}
                            onClick={() => findingMut.save.mutate({ id: f.id, inspection_id: inspection.id, response_text: responseDrafts[f.id] } as any)}>
                            Lagre svartekst
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Vedlegg */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vedlegg fra eksisterende dokumentasjon</p>
                      {fCandidates.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Ingen dokumentasjon er koblet til avviket ennå. Koble dokumentasjon under fanen Dokumentasjon.
                        </p>
                      ) : (
                        fCandidates.map((c) => (
                          <label key={c.key} className="flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-2 text-sm">
                            <Checkbox checked={selectedAttachments.has(c.key)} onCheckedChange={() => toggleAttachment(c.key)} disabled={!canEdit} />
                            {c.kind === "reference" ? <Paperclip className="h-3.5 w-3.5 text-muted-foreground" /> : <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
                            <span className="min-w-[160px] flex-1">
                              <span className="font-medium">{c.title}</span>
                              <span className="ml-2 text-xs text-muted-foreground">{c.source_label}{c.date ? ` · ${formatDate(c.date)}` : ""}</span>
                              {c.reference_note && <span className="block text-xs text-muted-foreground">{c.reference_note}</span>}
                            </span>
                            <ComplianceStatusBadge label={c.status_label} tone={c.status_tone} />
                            {selectedAttachments.has(c.key) && exportNames[c.key] && (
                              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{exportNames[c.key]}</span>
                            )}
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Steg 2: samlet status */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">2. Kontroll før utsendelse</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
            <span>{chosenFindings.length} avvik valgt</span>
            <span>{chosenAttachments.filter((c) => c.kind !== "reference").length} vedlegg</span>
            <span>{chosenAttachments.filter((c) => c.kind === "reference").length} referanser uten fil</span>
          </div>
          {chosenFindings.length === 0 ? (
            <p className="text-muted-foreground">Velg minst ett avvik for å bygge svarpakken.</p>
          ) : blocking.length === 0 ? (
            <p className="flex items-center gap-2 text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Alt er på plass for de valgte avvikene.</p>
          ) : (
            blocking.map((p) => (
              <p key={p.finding_id} className="flex items-start gap-2 text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Avvik {p.finding_number}: {p.checks.filter((c) => c.tone === "alert").map((c) => c.label.toLowerCase()).join(", ")}</span>
              </p>
            ))
          )}
          {canEdit && (
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button size="sm" disabled={chosenFindings.length === 0} onClick={goToPreview}>
                <Eye className="mr-1.5 h-3.5 w-3.5" /> Forhåndsvis svar
              </Button>
            </div>
          )}
          {blocking.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Du kan fortsatt forhåndsvise. Manglene vises også i forhåndsvisningen, og må bekreftes før utsendelse.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Tidligere utsendelser */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Utsendelser på saken</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(packages.data?.packages ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen svarpakker er sendt eller eksportert ennå.</p>
          ) : (
            (packages.data?.packages ?? []).map((p) => {
              const pf = (packages.data?.findings ?? []).filter((x) => x.package_id === p.id);
              const pa = (packages.data?.attachments ?? []).filter((x) => x.package_id === p.id);
              return (
                <div key={p.id} className="rounded-lg border bg-card px-3 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Send className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">Svarpakke {p.package_number}</span>
                    <ComplianceStatusBadge
                      label={p.status === "sent" ? "Sendt" : p.status === "exported" ? "Eksportert" : "Utkast"}
                      tone={p.status === "sent" ? "ok" : p.status === "exported" ? "neutral" : "warn"}
                    />
                    <span className="text-xs text-muted-foreground">
                      {p.sent_at ? `Sendt ${formatDate(p.sent_at)} til ${p.recipient_email}` : `Eksportert ${formatDate(p.exported_at ?? p.created_at)}`}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {pf.map((x) => `Avvik ${x.finding_number}`).join(", ") || "Ingen avvik"} · {pa.length} vedlegg
                  </p>
                  {p.send_error && <p className="mt-1 text-xs text-destructive">Siste feil: {p.send_error}</p>}
                  {pa.length > 0 && (
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">{pa.map((x) => x.export_name).join("  ·  ")}</p>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
