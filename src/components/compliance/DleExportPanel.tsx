import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useCompanyModuleAccess } from "@/hooks/useCompanyModuleAccess";
import { useResponsePackageMutations } from "@/hooks/useResponsePackages";
import { slugForFile, escapeHtml, type AttachmentCandidate } from "@/lib/response-package";
import { DLE_CATEGORIES, buildDleFiles, deliverDleBlob, type DleCategory, type DleFile, type DleRecord } from "@/lib/dle/export";
import { parseDleRecipients } from "@/lib/dle/delivery";
import { loadDleRecords, prepareDleFile } from "@/lib/dle/sources";
import { previewAllowsSend } from "../../../supabase/functions/_shared/inspection-send-policy";
import { invokeWithSession } from "@/lib/invoke-session";
import { isMarkdownFile } from "@/lib/external-document";

export function DleExportPanel({ inspectionId, attachments, initialEmail }: { inspectionId: string; attachments: AttachmentCandidate[]; initialEmail: string }) {
  const { activeCompanyId, activeCompany } = useCompanyContext();
  const { user } = useAuth();
  const access = useCompanyModuleAccess();
  const qc = useQueryClient();
  const { finalize, markSendFailed } = useResponsePackageMutations();
  const scope = `${user?.id}:${activeCompanyId}:${inspectionId}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  useEffect(() => () => { currentScope.current = "unmounted"; }, []);
  const [records, setRecords] = useState<Partial<Record<DleCategory, DleRecord[]>>>({});
  const [enabled, setEnabled] = useState<Set<DleCategory>>(new Set());
  const [separate, setSeparate] = useState<Partial<Record<DleCategory, boolean>>>({});
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [blobs, setBlobs] = useState<Record<string, Blob>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<Partial<Record<DleCategory, string>>>({});
  const [email, setEmail] = useState(initialEmail);
  const [cc, setCc] = useState("");
  const [emailFormat, setEmailFormat] = useState("files");
  const [reviewed, setReviewed] = useState<string | null>(null);
  const [zipReady, setZipReady] = useState<{ blob: Blob; files: DleFile[] } | null>(null);
  const company = activeCompany?.name ?? "Firma";
  const date = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
  useEffect(() => {
    setRecords({}); setEnabled(new Set()); setExcluded(new Set()); setBlobs({}); setZipReady(null); setError({}); setBusy(""); setEmail(initialEmail); setCc("");
  }, [scope, initialEmail]);
  const files = useMemo(() => DLE_CATEGORIES.flatMap((c) => enabled.has(c.key) ? buildDleFiles(c.key, records[c.key] ?? [], separate[c.key] ?? false, company, date) : []), [enabled, records, separate, company, date]);
  const selected = files.filter((f) => !excluded.has(f.key));
  const sendSnapshot = JSON.stringify({ scope, email, cc, emailFormat, selected });
  const sendReady = selected.length > 0 && selected.every(f => Boolean(blobs[f.key])) && Boolean(email.trim());
  const canSend = previewAllowsSend({ current: sendSnapshot, confirmed: reviewed, ready: sendReady, busy: Boolean(busy) });
  const canExport = access.can("hms", "edit");
  const allowedCategory = (category: DleCategory) => access.can(category === "chart" || category === "matrix" || category === "roles" ? "organisation" : category === "competence" ? "employees" : "hms");

  async function toggleCategory(category: DleCategory, checked: boolean) {
    if (!canExport || !activeCompanyId || !allowedCategory(category)) return;
    setZipReady(null);
    if (!checked) { setEnabled((old) => { const next = new Set(old); next.delete(category); return next; }); return; }
    setEnabled((old) => new Set(old).add(category));
    if (records[category]) return;
    const origin = scope;
    setBusy(category);
    try {
      const result = await loadDleRecords(category, activeCompanyId, attachments);
      if (currentScope.current !== origin) return;
      setRecords((old) => ({ ...old, [category]: result }));
      setError((old) => ({ ...old, [category]: undefined }));
    } catch (e) {
      if (currentScope.current === origin) {
        setEnabled((old) => { const next = new Set(old); next.delete(category); return next; });
        setError((old) => ({ ...old, [category]: e instanceof Error ? e.message : "Kunne ikke hente dokumentasjon" }));
      }
    } finally { if (currentScope.current === origin) setBusy(""); }
  }

  async function audit(event: "dle_generated" | "dle_exported", list: DleFile[], delivery: string) {
    const { error: logError } = await (supabase as any).from("compliance_inspection_events").insert({
      company_id: activeCompanyId, inspection_id: inspectionId, actor_user_id: user?.id,
      event_type: event, summary: `${event === "dle_generated" ? "Generert" : "Eksportert"} for DLE-tilsyn: ${list.map((f) => f.name).join(", ")}`,
      payload: { purpose: "DLE-tilsyn", delivery, actor_name: user?.name ?? user?.email, company_name: company, files: list.map((f) => ({ name: f.name, category: f.category, source_ids: f.records.map((r) => r.id), versions: f.records.map((r) => ({ title: r.title, version: r.version ?? "Snapshot " + date })) })) },
    });
    if (logError) throw new Error("Kunne ikke lagre revisjonssporet. Prøv igjen.");
    qc.invalidateQueries({ queryKey: ["inspection-events", activeCompanyId, inspectionId] });
  }

  async function prepare(file: DleFile) {
    const origin = scope;
    setBusy(file.key);
    try {
      const blob = await prepareDleFile(file, company, date);
      if (currentScope.current !== origin) return;
      await audit("dle_generated", [file], "single");
      setBlobs((old) => ({ ...old, [file.key]: blob }));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Kunne ikke generere filen"); }
    finally { if (currentScope.current === origin) setBusy(""); }
  }
  async function download(file: DleFile) {
    const blob = blobs[file.key]; if (!blob) return;
    // Trigger delivery synchronously from the user's click; audit does not delay it.
    void deliverDleBlob(blob, file.name);
    try { await audit("dle_exported", [file], "single"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Revisjonssporet feilet"); }
  }
  async function prepareZip() {
    const origin = scope; setBusy("zip");
    try {
      const zip = new JSZip();
      for (const file of selected) {
        const blob = blobs[file.key] ?? await prepareDleFile(file, company, date);
        zip.file(file.path, blob);
      }
      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
      if (currentScope.current !== origin) return;
      await audit("dle_generated", selected, "zip");
      setZipReady({ blob, files: selected });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Kunne ikke generere ZIP"); }
    finally { if (currentScope.current === origin) setBusy(""); }
  }
  async function sendFiles() {
    if (!canExport || !activeCompanyId || !canSend) return;
    setReviewed(null);
    const origin = scope; setBusy("send"); let packageId: string | null = null;
    try {
      const to = parseDleRecipients(email), copies = parseDleRecipients(cc);
      if (!to.length) throw new Error("Mottaker mangler");
      let outputs: { name: string; blob: Blob; source: DleFile }[] = [];
      for (const file of selected) outputs.push({ name: file.name, blob: blobs[file.key] ?? await prepareDleFile(file, company, date), source: file });
      if (emailFormat === "zip") {
        const zip = new JSZip(); outputs.forEach((o) => zip.file(o.source.path, o.blob));
        outputs = [{ name: `${slugForFile(company)}_DLE_${date}.zip`, blob: await zip.generateAsync({ type: "blob", compression: "STORE" }), source: selected[0] }];
      }
      if (currentScope.current !== origin) return;
      const candidates = outputs.map((o, i) => ({ key: `delivery-${i}`, finding_id: null, kind: "generated" as const, evidence_id: null, document_id: null, file_name: o.name, mime_type: o.blob.type, file_size: o.blob.size, storage_bucket: "dle-exports", file_path: null, source_kind: o.source.category, source_label: "DLE-tilsyn", date, status_label: "Klargjort", status_tone: "ok" as const, title: o.name, export_name: o.name }));
      const manifest = candidates.map((c) => ({ export_name: c.export_name, mime_type: c.mime_type, title: c.title, source_label: c.source_label, reference_only: false }));
      const text = `Dokumentasjon for DLE-tilsyn – ${company}\n\n${outputs.map((o) => o.name).join("\n")}`;
      const html = `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`;
      const pkg = await finalize.mutateAsync({ inspection_id: inspectionId, mode: "export", subject: `DLE-tilsyn – ${company}`, recipient_name: "", recipient_email: to.join(";"), cc: copies, intro: text, closing: "", findings: [], attachments: candidates, manifest, email_text: text, email_html: html });
      packageId = pkg.id;
      for (let i = 0; i < outputs.length; i++) {
        if (currentScope.current !== origin) throw new Error("Selskap endret. Sending avbrutt.");
        const output = outputs[i];
        const path = `${pkg.id}/${crypto.randomUUID()}/${output.name}`;
        const { error: uploadError } = await supabase.storage.from("dle-exports").upload(path, output.blob, { contentType: output.blob.type });
        if (uploadError) throw uploadError;
        const { error: updateError } = await (supabase as any).from("compliance_response_package_attachments").update({ file_path: path }).eq("package_id", pkg.id).eq("export_name", output.name);
        if (updateError) throw updateError;
      }
      const metadata = { to, cc: copies, format: emailFormat, purpose: "DLE-tilsyn", company_name: company, actor_name: user?.name ?? user?.email, files: selected.map((f) => ({ name: f.name, versions: f.records.map((r) => ({ id: r.id, title: r.title, version: r.version ?? "Snapshot " + date })) })) };
      const { error: metadataError } = await (supabase as any).from("compliance_response_packages").update({ delivery_metadata: metadata }).eq("id", pkg.id);
      if (metadataError) throw metadataError;
      const { data, error: sendError } = await invokeWithSession("inspection-response-send", { body: { package_id: pkg.id, confirm_send: true } });
      if (sendError || !data?.ok) throw new Error(data?.message ?? sendError?.message ?? "Utsendelsen feilet");
      qc.invalidateQueries({ queryKey: ["inspection-events", activeCompanyId, inspectionId] });
      toast.success(`Microsoft har akseptert sending til ${to.join(", ")}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Kunne ikke sende filene";
      if (packageId) await markSendFailed.mutateAsync({ id: packageId, error: message });
      toast.error(message);
    } finally { if (currentScope.current === origin) setBusy(""); }
  }

  return <section className="space-y-4 border-y py-5">
    <h2 className="text-lg font-semibold">DLE / ekstern opplasting</h2>
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {DLE_CATEGORIES.map((c) => <div key={c.key} className="space-y-1">
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={enabled.has(c.key)} disabled={!canExport || !allowedCategory(c.key) || !!busy} onCheckedChange={(value) => void toggleCategory(c.key, value === true)} />{c.label}{busy === c.key && <Loader2 className="h-4 w-4 animate-spin" />}</label>
        {error[c.key] && <p className="text-xs text-destructive">{error[c.key]}</p>}
        {!allowedCategory(c.key) && <p className="text-xs text-muted-foreground">Ingen tilgang til denne kategorien</p>}
        {enabled.has(c.key) && records[c.key]?.length === 0 && <p className="text-xs text-muted-foreground">Ingen dokumentasjon registrert</p>}
        {enabled.has(c.key) && (records[c.key]?.length ?? 0) > 1 && c.key !== "sds" && c.key !== "attachments" && <Select value={separate[c.key] ? "separate" : "combined"} onValueChange={(v) => { setSeparate((old) => ({ ...old, [c.key]: v === "separate" })); setZipReady(null); }}><SelectTrigger className="h-8" aria-label={`${c.label}: PDF-format`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="combined">Én samlet PDF</SelectItem><SelectItem value="separate">Separate PDF-er per post</SelectItem></SelectContent></Select>}
      </div>)}
    </div>
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Dette blir eksportert ({selected.length})</h3>
      {files.map((file) => <div key={file.key} className="flex flex-wrap items-center gap-3 border-b py-2">
        <Checkbox aria-label={`Velg ${file.name}`} checked={!excluded.has(file.key)} disabled={!!busy} onCheckedChange={(checked) => { setExcluded((old) => { const next = new Set(old); checked ? next.delete(file.key) : next.add(file.key); return next; }); setZipReady(null); }} />
        <div className="min-w-0 flex-1"><p className="break-all text-sm">{file.name}</p><p className="text-xs text-muted-foreground">{file.path.split("/")[0]} · {file.records.length} {file.records.length === 1 ? "post" : "poster"}{isMarkdownFile(file.records[0]?.original?.filename, file.records[0]?.original?.mime) ? " · PDF fra intern kilde · application/pdf" : file.records[0]?.original ? " · Originalfil" : ""}</p></div>
        {blobs[file.key] ? <Button size="sm" variant="outline" disabled={!canExport || !!busy || excluded.has(file.key)} onClick={() => void download(file)}><Download className="mr-1.5 h-4 w-4" />Last ned</Button> : <Button size="sm" variant="outline" disabled={!canExport || !!busy || excluded.has(file.key)} onClick={() => void prepare(file)}>{busy === file.key && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{isMarkdownFile(file.records[0]?.original?.filename, file.records[0]?.original?.mime) ? "Generer PDF" : file.records[0]?.original ? "Klargjør originalfil" : "Generer fil"}</Button>}
        {blobs[file.key] && <Button size="sm" variant="outline" onClick={() => { const url = URL.createObjectURL(blobs[file.key]); window.open(url, "_blank", "noopener,noreferrer"); window.setTimeout(() => URL.revokeObjectURL(url), 60000); }}>Forhåndsvis fil</Button>}
      </div>)}
    </div>
    <div className="flex flex-wrap items-end gap-3">
      {zipReady ? <Button variant="outline" disabled={!!busy || !canExport} onClick={() => { void deliverDleBlob(zipReady.blob, `${slugForFile(company)}_DLE_${date}.zip`); void audit("dle_exported", zipReady.files, "zip").catch((e) => toast.error(e.message)); }}><Download className="mr-2 h-4 w-4" />Last ned alle som ZIP</Button> : <Button variant="outline" disabled={!selected.length || !!busy || !canExport} onClick={() => void prepareZip()}>{busy === "zip" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Generer ZIP</Button>}
      <div className="min-w-0 flex-1 space-y-1"><Label htmlFor="dle-email">Til</Label><Input id="dle-email" type="text" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="min-w-0 flex-1 space-y-1"><Label htmlFor="dle-cc">Kopi</Label><Input id="dle-cc" value={cc} onChange={(e) => setCc(e.target.value)} /></div>
      <Select value={emailFormat} onValueChange={setEmailFormat}><SelectTrigger className="w-40" aria-label="E-postformat"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="files">Enkeltfiler</SelectItem><SelectItem value="zip">Samlet ZIP</SelectItem></SelectContent></Select>
      <Button disabled={!canSend || !canExport} onClick={() => void sendFiles()}>{busy === "send" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Send valgte filer ({selected.length})</Button>
    </div>
    <div className="space-y-2 border-t pt-3 text-sm">
      <p className="font-medium">Forhåndsvis utsending: DLE-tilsyn – {company}</p>
      <p className="whitespace-pre-wrap">Dokumentasjon for DLE-tilsyn – {company}{"\n\n"}{selected.map(f => f.name).join("\n")}</p>
      <label className="flex items-center gap-2"><Checkbox checked={reviewed === sendSnapshot} disabled={!sendReady || !!busy} onCheckedChange={value => setReviewed(value === true ? sendSnapshot : null)} />Jeg har forhåndsvist de klargjorte filene og kontrollert mottakere og format.</label>
    </div>
  </section>;
}
