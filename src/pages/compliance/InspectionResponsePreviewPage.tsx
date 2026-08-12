import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ComplianceStatusBadge } from "@/components/compliance/ComplianceStatusBadge";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useFindingEvidence, useFindings, useInspection, useInspectionActions } from "@/hooks/useInspections";
import { buildPreflight, useAttachmentCandidates, useCompetenceCoverageDetails, useResponsePackageMutations } from "@/hooks/useResponsePackages";
import {
  buildEmailHtml, buildEmailText, buildExportNames, buildManifest, clearResponseDraft, defaultClosing, defaultIntro,
  defaultSubject, loadResponseDraft, manifestAsText, saveResponseDraft, slugForFile,
  type AttachmentCandidate, type PackageFindingDraft,
} from "@/lib/response-package";
import { TONE_DOT, formatDate } from "@/lib/compliance";

function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
}

export default function InspectionResponsePreviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const { isSuperAdmin, isAdmin } = useAuth();
  const { activeCompany } = useCompanyContext();
  const canEdit = isSuperAdmin || isAdmin || hasPermission("hms.manage");

  const inspection = useInspection(id);
  const findings = useFindings(id);
  const evidence = useFindingEvidence(id);
  const actions = useInspectionActions(id);
  const { candidates, loading } = useAttachmentCandidates(findings.data ?? [], evidence.data ?? [], actions.data ?? []);
  const { detailFor } = useCompetenceCoverageDetails();
  const { finalize, markSendFailed } = useResponsePackageMutations();

  const companyName = activeCompany?.name ?? null;
  const [form, setForm] = useState({ recipient_name: "", recipient_email: "", cc: "", subject: "", intro: "", closing: "" });
  const [selection, setSelection] = useState<{ findings: Set<string>; attachments: Set<string> }>({ findings: new Set(), attachments: new Set() });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<"" | "export" | "send">("");
  const [confirmSend, setConfirmSend] = useState(false);

  useEffect(() => {
    if (ready || !id || !inspection.data) return;
    const d = loadResponseDraft(id);
    setSelection({ findings: new Set(d?.finding_ids ?? []), attachments: new Set(d?.attachment_keys ?? []) });
    setForm({
      recipient_name: d?.recipient_name ?? inspection.data.contact_name ?? "",
      recipient_email: d?.recipient_email ?? inspection.data.contact_email ?? "",
      cc: d?.cc ?? "",
      subject: d?.subject || defaultSubject({ authority: inspection.data.authority_name, companyName, caseNumber: inspection.data.case_number }),
      intro: d?.intro || defaultIntro({ contactName: inspection.data.contact_name, inspectionDate: inspection.data.inspection_date, authority: inspection.data.authority_name }),
      closing: d?.closing || defaultClosing(companyName),
    });
    setReady(true);
  }, [ready, id, inspection.data, companyName]);

  // Utkastet holdes i synk slik at bruker kan gå tilbake uten å miste arbeid
  useEffect(() => {
    if (!ready || !id) return;
    saveResponseDraft({
      inspection_id: id,
      finding_ids: [...selection.findings],
      attachment_keys: [...selection.attachments],
      ...form,
    });
  }, [ready, id, form, selection]);

  const chosenFindings = (findings.data ?? []).filter((f) => selection.findings.has(f.id));
  const chosenAttachments = useMemo(
    () => candidates.filter((c) => selection.attachments.has(c.key) && selection.findings.has(c.finding_id ?? "")),
    [candidates, selection],
  );
  const exportNames = useMemo(() => buildExportNames(chosenAttachments), [chosenAttachments]);
  const manifest = useMemo(() => buildManifest(chosenAttachments, exportNames), [chosenAttachments, exportNames]);

  const preflight = useMemo(
    () => buildPreflight({
      findings: chosenFindings, evidence: evidence.data ?? [], actions: actions.data ?? [],
      candidates, selectedAttachmentKeys: selection.attachments, detailFor,
    }),
    [chosenFindings, evidence.data, actions.data, candidates, selection.attachments, detailFor],
  );
  const blocking = preflight.filter((p) => p.overall === "missing");

  const packageFindings: PackageFindingDraft[] = chosenFindings.map((f) => ({
    finding_id: f.id,
    finding_number: f.finding_number,
    finding_type: f.finding_type,
    title: f.title,
    original_text: f.original_text,
    response_text: f.response_text ?? "",
    actions: (actions.data ?? []).filter((a) => a.compliance_finding_id === f.id).map((a) => ({ title: a.title, status: a.status })),
    attachment_names: chosenAttachments.filter((c) => c.finding_id === f.id).map((c) => exportNames[c.key] ?? c.title),
  }));

  const emailText = buildEmailText({ intro: form.intro, findings: packageFindings, manifest, closing: form.closing });
  const emailHtml = buildEmailHtml({ intro: form.intro, findings: packageFindings, manifest, closing: form.closing });

  const generatedFiles = chosenAttachments
    .filter((c) => c.kind === "generated" && c.generated)
    .map((c) => ({ export_name: exportNames[c.key] ?? `${slugForFile(c.title)}.csv`, content: toCsv(c.generated!.rows) }));

  const ccList = form.cc.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);

  const finalizeInput = (mode: "export" | "send") => ({
    inspection_id: id!,
    mode,
    subject: form.subject,
    recipient_name: form.recipient_name,
    recipient_email: form.recipient_email,
    cc: ccList,
    intro: form.intro,
    closing: form.closing,
    findings: packageFindings,
    attachments: chosenAttachments.map((c: AttachmentCandidate) => ({ ...c, export_name: exportNames[c.key] ?? null })),
    manifest,
    email_text: emailText,
    email_html: emailHtml,
  });

  async function fileUrlFor(c: AttachmentCandidate): Promise<string | null> {
    if (!c.storage_bucket || !c.file_path) return null;
    const { data } = await supabase.storage.from(c.storage_bucket).createSignedUrl(c.file_path, 600);
    if (data?.signedUrl) return data.signedUrl;
    return supabase.storage.from(c.storage_bucket).getPublicUrl(c.file_path).data.publicUrl ?? null;
  }

  const handleExport = async () => {
    setBusy("export");
    try {
      const zip = new JSZip();
      const missing: string[] = [];
      for (const c of chosenAttachments) {
        const name = exportNames[c.key];
        if (!name) continue;
        if (c.kind === "generated" && c.generated) {
          zip.file(name, toCsv(c.generated.rows));
          continue;
        }
        const url = await fileUrlFor(c);
        if (!url) { missing.push(c.title); continue; }
        const resp = await fetch(url);
        if (!resp.ok) { missing.push(c.title); continue; }
        zip.file(name, await resp.blob());
      }
      zip.file("00_Dokumentmanifest.txt", `${form.subject}\n\n${manifestAsText(manifest)}\n`);
      zip.file("01_Svarbrev.txt", emailText);

      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Svarpakke_${slugForFile(inspection.data?.case_number || inspection.data?.title || "tilsyn")}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);

      await finalize.mutateAsync(finalizeInput("export"));
      if (missing.length) toast.warning(`${missing.length} vedlegg kunne ikke hentes: ${missing.join(", ")}`);
      else toast.success("Svarpakken er eksportert og lagret i historikken");
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke eksportere pakken");
    } finally {
      setBusy("");
    }
  };

  const handleSend = async () => {
    if (!form.recipient_email.trim()) { toast.error("Mottakerens e-postadresse mangler"); return; }
    setBusy("send");
    let pkgId: string | null = null;
    try {
      const pkg = await finalize.mutateAsync(finalizeInput("send"));
      pkgId = pkg.id;
      const { data, error } = await supabase.functions.invoke("inspection-response-send", {
        body: { package_id: pkg.id, subject: form.subject, html: emailHtml, generated: generatedFiles },
      });
      if (error || !(data as any)?.ok) {
        const msg = (data as any)?.message ?? error?.message ?? "Utsendelsen feilet";
        if (pkgId) await markSendFailed.mutateAsync({ id: pkgId, error: msg });
        toast.error(msg);
        return;
      }
      const skipped = (data as any).skipped as string[] | undefined;
      if (skipped?.length) toast.warning(`Sendt, men ${skipped.length} vedlegg kunne ikke legges ved: ${skipped.join(", ")}`);
      else toast.success("Svarpakken er sendt");
      clearResponseDraft(id!);
      navigate(`/compliance/tilsyn/${id}?tab=response`);
    } catch (e: any) {
      if (pkgId) await markSendFailed.mutateAsync({ id: pkgId, error: e?.message ?? "Ukjent feil" });
      toast.error(e?.message ?? "Kunne ikke sende svarpakken");
    } finally {
      setBusy("");
    }
  };

  if (inspection.isLoading || loading || !ready) {
    return <div className="space-y-3 p-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-64" /></div>;
  }
  if (!inspection.data) {
    return <div className="p-6"><Card><CardContent className="p-6 text-sm text-muted-foreground">Tilsynssaken finnes ikke.</CardContent></Card></div>;
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={() => navigate(`/compliance/tilsyn/${id}?tab=response`)}>
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Tilbake til svarpakke
        </Button>
      </div>

      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Forhåndsvis svar</h1>
        <p className="text-sm text-muted-foreground">
          {inspection.data.title} · {chosenFindings.length} avvik · {chosenAttachments.filter((c) => c.kind !== "reference").length} vedlegg
        </p>
      </div>

      {chosenFindings.length === 0 && (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Ingen avvik er valgt. Gå tilbake og velg hvilke avvik som skal besvares.
        </CardContent></Card>
      )}

      {/* Kontroll */}
      {chosenFindings.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Kontroll</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {blocking.length === 0 ? (
              <p className="flex items-center gap-2 text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Alt er kontrollert og klart for utsendelse.</p>
            ) : (
              blocking.map((p) => (
                <div key={p.finding_id} className="space-y-0.5">
                  <p className="font-medium">Avvik {p.finding_number} · {p.title}</p>
                  {p.checks.filter((c) => c.tone !== "ok").map((c, idx) => (
                    <p key={idx} className="flex items-center gap-2 text-xs">
                      <span className={`h-2 w-2 rounded-full ${TONE_DOT[c.tone]}`} />
                      <span className={c.tone === "alert" ? "text-destructive" : "text-amber-600"}>{c.label}</span>
                    </p>
                  ))}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* E-postutkast */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">E-postutkast</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs">Mottaker</Label>
              <Input value={form.recipient_name} onChange={(e) => setForm((s) => ({ ...s, recipient_name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">E-postadresse *</Label>
              <Input type="email" value={form.recipient_email} onChange={(e) => setForm((s) => ({ ...s, recipient_email: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Kopi til</Label>
              <Input value={form.cc} onChange={(e) => setForm((s) => ({ ...s, cc: e.target.value }))} placeholder="Skill flere med komma" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Emne</Label>
            <Input value={form.subject} onChange={(e) => setForm((s) => ({ ...s, subject: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Innledning</Label>
            <Textarea rows={5} value={form.intro} onChange={(e) => setForm((s) => ({ ...s, intro: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Avslutning</Label>
            <Textarea rows={3} value={form.closing} onChange={(e) => setForm((s) => ({ ...s, closing: e.target.value }))} />
          </div>
        </CardContent>
      </Card>

      {/* Slik ser svaret ut */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Slik ser svaret ut</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-background p-4" dangerouslySetInnerHTML={{ __html: emailHtml }} />
        </CardContent>
      </Card>

      {/* Vedlegg og manifest */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Vedlegg og dokumentmanifest</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {manifest.length === 0 && <p className="text-sm text-muted-foreground">Ingen vedlegg valgt.</p>}
          {chosenAttachments.map((c) => (
            <div key={c.key} className="flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-2 text-sm">
              <span className="min-w-[90px] font-mono text-[11px] text-muted-foreground">{exportNames[c.key] ?? "referanse"}</span>
              <span className="min-w-[160px] flex-1">
                {c.title}
                <span className="ml-2 text-xs text-muted-foreground">{c.source_label}{c.date ? ` · ${formatDate(c.date)}` : ""}</span>
              </span>
              <ComplianceStatusBadge label={c.status_label} tone={c.status_tone} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Handlinger */}
      {canEdit && (
        <Card>
          <CardContent className="space-y-3 p-4">
            {blocking.length > 0 && !confirmSend && (
              <label className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Kontrollen viser mangler. Du kan likevel sende hvis dette er avtalt med tilsynsmyndigheten – bekreft under.
                  <Button size="sm" variant="outline" className="ml-2 h-7" onClick={() => setConfirmSend(true)}>Bekreft og send likevel</Button>
                </span>
              </label>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="outline" disabled={chosenFindings.length === 0 || busy !== ""} onClick={handleExport}>
                {busy === "export" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
                Eksporter pakke (ZIP)
              </Button>
              <Button
                size="sm"
                disabled={chosenFindings.length === 0 || busy !== "" || (blocking.length > 0 && !confirmSend)}
                onClick={handleSend}
              >
                {busy === "send" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                Send svar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
