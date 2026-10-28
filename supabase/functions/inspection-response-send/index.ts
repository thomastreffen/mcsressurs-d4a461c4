// Sender svarpakke for en tilsynssak via Microsoft Graph.
// Vedleggene hentes fra storage med service role og legges på e-posten med de
// ryddige eksportnavnene som er lagret på pakken. Ingenting kopieres i storage.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { explicitPackageSend, responseFindingReady, resolveTestRecipient, buildTestMessage } from '../_shared/inspection-send-policy.ts';
import { isMarkdownFile, markdownSections, renderDocumentPdf } from '../_shared/external-document.ts';
import { jsPDF } from 'npm:jspdf@4.2.1';

const MAILBOX = "postkontoret@mcsservice.no";
/** Graph sendMail tåler ca 4 MB base64 per melding – vi holder oss godt under */
const MAX_TOTAL_ATTACHMENTS = 3 * 1024 * 1024;
const LINK_SECONDS = 7 * 24 * 60 * 60;

async function deliveryFile(file: Blob, source: { file_name?: string; mime_type?: string; file_path?: string }, exportName: string, company: string): Promise<Blob> {
  if (!isMarkdownFile(source.file_name ?? source.file_path, source.mime_type) && !isMarkdownFile(source.file_path, file.type)) return file;
  const markdown = await file.text();
  if (!markdown.trim()) throw new Error("Markdown-dokumentet er tomt. Klargjør ny forhåndsvisning.");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  renderDocumentPdf(pdf, company, new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" }), [{ title: (source.file_name ?? exportName).replace(/\.(md|markdown)$/i, ""), sections: markdownSections(markdown) }]);
  return new Blob([pdf.output("arraybuffer")], { type: "application/pdf" });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function getGraphToken(): Promise<{ token?: string; error?: string }> {
  const tenant = Deno.env.get("AZURE_TENANT_ID");
  const clientId = Deno.env.get("AZURE_CLIENT_ID");
  const secret = Deno.env.get("AZURE_CLIENT_SECRET");
  if (!tenant || !clientId || !secret) return { error: "Microsoft-integrasjonen er ikke konfigurert" };

  const resp = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const data = await resp.json();
  if (!data.access_token) return { error: `Autentisering mot Microsoft feilet: ${data.error_description ?? data.error ?? resp.status}` };
  return { token: data.access_token };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!token) return json({ ok: false, message: "Mangler autentisering" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(url, anon);
    const { data: identity, error: claimsErr } = await authClient.auth.getUser(token);
    const userId = identity?.user?.id;
    if (claimsErr || !userId) return json({ ok: false, message: "Ugyldig token" }, 401);

    const parsed = z.object({ mode: z.enum(["final", "test", "test_recipient"]).optional(), inspection_id: z.string().uuid().optional(), attachments: z.array(z.object({ document_id: z.string().uuid().nullable().optional(), storage_bucket: z.string().max(100).nullable().optional(), file_path: z.string().max(1000).nullable().optional(), export_name: z.string().min(1).max(255), mime_type: z.string().max(100).nullable().optional() })).max(100).optional(), export_id: z.string().uuid().optional(), package_id: z.string().uuid().optional(), confirm_send: z.boolean().optional(), html: z.string().max(500000).optional(), subject: z.string().max(255).optional(), generated: z.array(z.object({ export_name: z.string().min(1).max(255), content: z.string().max(5000000).optional(), content_base64: z.string().max(5000000).optional(), mime_type: z.string().max(100).optional() })).max(100).optional() }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ ok: false, message: "Ugyldig svarpakke eller filinnhold" }, 400);
    const body = parsed.data;

    // ---- Test til meg selv: aldri pakke-/funn-/sakstatus, aldri DLE-mottaker eller kopi ----
    if (body.mode === "test" || body.mode === "test_recipient") {
      if (!body.inspection_id) return json({ ok: false, message: "Mangler tilsynssak" }, 400);
      const admin = createClient(url, service);
      const { data: insp } = await admin.from("compliance_inspections").select("id,company_id,case_number").eq("id", body.inspection_id).is("deleted_at", null).maybeSingle();
      if (!insp) return json({ ok: false, message: "Fant ikke tilsynssaken" }, 404);
      const { data: allowed } = await admin.rpc("has_company_access", { _uid: userId, _company: insp.company_id, _module: "hms", _level: "edit" });
      if (!allowed) return json({ ok: false, message: "Du har ikke tilgang til svarpakken" }, 403);
      const { data: account } = await admin.from("user_accounts").select("person_id").eq("auth_user_id", userId).eq("is_active", true).maybeSingle();
      const { data: person } = account?.person_id ? await admin.from("people").select("email").eq("id", account.person_id).maybeSingle() : { data: null };
      const testTo = resolveTestRecipient(person?.email, identity?.user?.email);
      if (!testTo) return json({ ok: false, message: "Du har ingen registrert jobb-e-post" }, 400);
      if (body.mode === "test_recipient") return json({ ok: true, recipient: testTo });
      if (!body.html || !body.subject) return json({ ok: false, message: "Mangler forhåndsvisning" }, 400);
      if ([...(body.attachments ?? []), ...(body.generated ?? [])].some(a => isMarkdownFile(a.export_name, a.mime_type))) return json({ ok: false, message: "Rå Markdown kan ikke sendes. Klargjør ny PDF-forhåndsvisning." }, 409);
      const { data: company } = await admin.from("companies").select("name").eq("id", insp.company_id).maybeSingle();

      const caller = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
      const files: any[] = [];
      let size = 0;
      const missing: string[] = [];
      for (const a of body.attachments ?? []) {
        if (!a.file_path || !a.storage_bucket) continue;
        const { data: doc } = a.document_id ? await caller.from("documents").select("file_path,storage_bucket,file_name,mime_type").eq("id", a.document_id).maybeSingle() : { data: null };
        if (!doc || doc.file_path !== a.file_path || doc.storage_bucket !== a.storage_bucket) return json({ ok: false, message: "Ingen tilgang til vedlegget" }, 403);
        const { data: file } = await admin.storage.from(a.storage_bucket).download(a.file_path);
        if (!file) { missing.push(a.export_name); continue; }
        const delivered = await deliveryFile(file, doc, a.export_name, company?.name ?? "Firma");
        const buf = new Uint8Array(await delivered.arrayBuffer());
        size += buf.byteLength;
        files.push({ "@odata.type": "#microsoft.graph.fileAttachment", name: a.export_name, contentType: delivered.type || a.mime_type || "application/octet-stream", contentBytes: encodeBase64(buf) });
      }
      for (const g of body.generated ?? []) {
        if (!(body.attachments ?? []).some((a) => a.export_name === g.export_name && !a.file_path)) return json({ ok: false, message: "Generert fil finnes ikke i dokumentmanifestet" }, 400);
        const bytes = g.content_base64 ? Uint8Array.from(atob(g.content_base64), (c) => c.charCodeAt(0)) : new TextEncoder().encode(g.content ?? "");
        size += bytes.byteLength;
        files.push({ "@odata.type": "#microsoft.graph.fileAttachment", name: g.export_name, contentType: g.mime_type ?? "text/csv", contentBytes: encodeBase64(bytes) });
      }
      if (missing.length) return json({ ok: false, message: `Ingen test sendt. Vedlegg kunne ikke hentes: ${missing.join(", ")}` }, 400);
      if (size >= MAX_TOTAL_ATTACHMENTS) return json({ ok: false, message: "Vedleggene er for store for en test-e-post" }, 400);
      const graph = await getGraphToken();
      if (graph.error) return json({ ok: false, message: graph.error }, 502);
      const testMessage = buildTestMessage({ subject: body.subject, html: body.html, caseNumber: insp.case_number, to: testTo, attachments: files });
      const sent = await fetch(`https://graph.microsoft.com/v1.0/users/${MAILBOX}/sendMail`, { method: "POST", headers: { Authorization: `Bearer ${graph.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ message: testMessage, saveToSentItems: false }) });
      if (!sent.ok && sent.status !== 202) return json({ ok: false, message: `Microsoft avviste testen: ${await sent.text()}` }, 502);
      await admin.from("compliance_inspection_events").insert({ company_id: insp.company_id, inspection_id: insp.id, actor_user_id: userId, event_type: "response_test_sent", summary: `Intern test av svarpakke sendt til ${testTo}`, payload: { test: true, to: testTo, attachments: files.map((f) => f.name) } });
      return json({ ok: true, test: true, recipient: testTo, attachments: files.length });
    }

    const standalone = !!body.export_id;
    const packageId = body.export_id ?? body.package_id;
    const packageTable = standalone ? "hms_document_exports" : "compliance_response_packages";
    const generated: { export_name: string; content?: string; content_base64?: string; mime_type?: string }[] = !standalone && Array.isArray(body.generated) ? body.generated : [];
    if (!packageId) return json({ ok: false, message: "Mangler svarpakke" }, 400);

    const admin = createClient(url, service);

    const { data: pkg, error: pkgErr } = await admin
      .from(packageTable)
      .select("*")
      .eq("id", packageId)
      .maybeSingle();
    if (pkgErr || !pkg) return json({ ok: false, message: "Fant ikke svarpakken" }, 404);
    if (!pkg.recipient_email) return json({ ok: false, message: "Mottaker mangler e-postadresse" }, 400);

    // Autoritativ tilgangssjekk: brukeren må ha HMS-tilgang i selskapet pakken hører til
    const { data: allowed } = await admin.rpc("has_company_access", { _uid: userId, _company: pkg.company_id, _module: standalone ? pkg.source_module ?? "hms" : "hms", _level: standalone ? pkg.access_level ?? "edit" : "edit" });
    if (!allowed) return json({ ok: false, message: "Du har ikke tilgang til å sende svar på tilsyn" }, 403);

    if (standalone && !["prepared", "downloaded", "failed"].includes(pkg.status)) return json({ ok: false, message: "Eksporten er allerede sendt eller under sending" }, 409);
    if (!standalone && !explicitPackageSend(body.confirm_send, pkg.status)) return json({ ok: false, message: "Forhåndsvis og bekreft pakken før eksplisitt sending. Pakken kan allerede være sendt eller under sending." }, 409);
    const html: string = pkg.email_body_snapshot ?? "";
    const subject: string = pkg.subject ?? "Dokumentasjon";
    const findingSnapshots = standalone ? { data: [], error: null } : await admin.from("compliance_response_package_findings").select("finding_id,response_text_snapshot").eq("package_id", packageId);
    if (findingSnapshots.error) return json({ ok: false, message: "Kunne ikke kontrollere valgte funn" }, 500);
    const findingIds = (findingSnapshots.data ?? []).map((f: any) => f.finding_id);
    if (findingIds.length) {
      const { data: liveFindings, error: findingError } = await admin.from("compliance_findings").select("*").in("id", findingIds).eq("company_id", pkg.company_id).eq("inspection_id", pkg.inspection_id).is("deleted_at", null);
      const { data: openActions, error: actionError } = await admin.from("hms_action_items").select("id").in("compliance_finding_id", findingIds).is("deleted_at", null).in("status", ["open", "in_progress"]);
      const { data: proof, error: proofError } = await admin.from("compliance_finding_evidence").select("finding_id").in("finding_id", findingIds).eq("company_id", pkg.company_id);
      if (findingError || actionError || proofError) return json({ ok: false, message: "Kunne ikke kontrollere funn, tiltak og bevis" }, 500);
      if (liveFindings?.length !== findingIds.length || openActions?.length || liveFindings.some((f: any) => !responseFindingReady(f) || !proof?.some((e: any) => e.finding_id === f.id) || !findingSnapshots.data?.some((s: any) => s.finding_id === f.id && s.response_text_snapshot === f.response_text))) {
        return json({ ok: false, message: "Funn er endret eller ikke ferdig behandlet. Kontroller ny forhåndsvisning før sending." }, 409);
      }
    }

    const attachmentResult = standalone ? { data: pkg.files, error: null } : await admin.from("compliance_response_package_attachments").select("*").eq("package_id", packageId).order("sort_order");
    const attachments = attachmentResult.data;
    const attachmentError = attachmentResult.error;
    if (standalone && (pkg.created_by !== userId || !Array.isArray(attachments) || attachments.length > 100)) return json({ ok: false, message: "Ugyldig eksport" }, 403);
    if (standalone && attachments.some((a: any) => a.storage_bucket !== "dle-exports" || !a.file_path || !a.file_path.startsWith(`${pkg.id}/`))) return json({ ok: false, message: "Ugyldig eksportfil" }, 403);
    async function logEvent(event_type: string, summary: string, payload: unknown) {
      if (!standalone) return admin.from("compliance_inspection_events").insert({ company_id: pkg.company_id, inspection_id: pkg.inspection_id, actor_user_id: userId, event_type, summary, payload });
      pkg.events = [...(pkg.events ?? []), { event_type, summary, payload, actor_user_id: userId, created_at: new Date().toISOString() }];
      return admin.from(packageTable).update({ events: pkg.events }).eq("id", packageId);
    }

    if (attachmentError) return json({ ok: false, message: "Kunne ikke lese dokumentmanifest" }, 500);
    if ([...(attachments ?? []), ...generated].some(a => isMarkdownFile(a.export_name, a.mime_type))) return json({ ok: false, message: "Rå Markdown kan ikke sendes. Klargjør ny PDF-forhåndsvisning." }, 409);
    const { data: company } = await admin.from("companies").select("name").eq("id", pkg.company_id).maybeSingle();
    const recipients = (value: string) => [...new Set(value.split(/[;,\s]+/).filter(Boolean))];
    const to = recipients(pkg.recipient_email), cc = Array.isArray(pkg.cc_emails) ? pkg.cc_emails.flatMap(recipients) : [];
    if (!to.length || to.length + cc.length > 40 || [...to, ...cc].some((a) => !z.string().email().safeParse(a).success)) return json({ ok: false, message: "Ugyldige mottakere" }, 400);
    const graphAttachments: any[] = [];
    const links: { name: string; url: string; expires_at: string }[] = [];
    const escape = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));
    let total = 0;
    const skipped: string[] = [];

    for (const a of attachments ?? []) {
      if (!a.file_path || !a.storage_bucket) continue;
      let source = { file_name: a.file_name, mime_type: a.mime_type, file_path: a.file_path };
      if (a.storage_bucket === "dle-exports" && !a.file_path.startsWith(`${pkg.id}/`)) return json({ ok: false, message: "Filen tilhører ikke pakken" }, 403);
      // Verify legacy document paths through the caller's RLS, never service-role alone.
      if (a.storage_bucket !== "dle-exports") {
        const caller = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
        const { data: doc } = await caller.from("documents").select("id,file_path,storage_bucket,file_name,mime_type").eq("id", a.document_id).maybeSingle();
        if (!doc || doc.file_path !== a.file_path || doc.storage_bucket !== a.storage_bucket) return json({ ok: false, message: "Ingen tilgang til vedlegget" }, 403);
        source = doc;
      }
      const { data: file, error } = await admin.storage.from(a.storage_bucket).download(a.file_path);
      if (error || !file) {
        skipped.push(a.export_name);
        continue;
      }
      const delivered = await deliveryFile(file, source, a.export_name, company?.name ?? "Firma");
      const buf = await delivered.arrayBuffer();
      if (total + buf.byteLength >= MAX_TOTAL_ATTACHMENTS) {
        // Never link the original Markdown when the delivery representation is PDF.
        if (delivered !== file) return json({ ok: false, message: "PDF-vedleggene er for store. Last ned PDF-pakken eller velg færre vedlegg før sending." }, 400);
        const { data: signed, error: signedError } = await admin.storage.from(a.storage_bucket).createSignedUrl(a.file_path, LINK_SECONDS, { download: a.export_name });
        if (signedError || !signed) { skipped.push(a.export_name); continue; }
        links.push({ name: a.export_name, url: signed.signedUrl, expires_at: new Date(Date.now() + LINK_SECONDS * 1000).toISOString() });
        continue;
      }
      total += buf.byteLength;
      graphAttachments.push({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: a.export_name,
        contentType: delivered.type || a.mime_type || "application/octet-stream",
        contentBytes: encodeBase64(buf),
      });
    }

    // Systemgenererte oversikter (kompetanseoversikt, dokumentmanifest) kommer som tekst fra klienten
    for (const g of generated) {
      // A generated file must be present in the stored, company-scoped manifest.
      if (!(attachments ?? []).some((a) => a.export_name === g.export_name && !a.file_path)) {
        return json({ ok: false, message: "Generert fil finnes ikke i valgt dokumentmanifest" }, 400);
      }
      let bytes: Uint8Array;
      try {
        bytes = g.content_base64
          ? Uint8Array.from(atob(g.content_base64), (c) => c.charCodeAt(0))
          : new TextEncoder().encode(g.content ?? "");
      } catch {
        return json({ ok: false, message: "Ugyldig filinnhold" }, 400);
      }
      if (total + bytes.byteLength >= MAX_TOTAL_ATTACHMENTS) {
        skipped.push(g.export_name);
        continue;
      }
      total += bytes.byteLength;
      graphAttachments.push({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: g.export_name,
        contentType: g.mime_type ?? (g.export_name.endsWith(".csv") ? "text/csv" : "text/plain"),
        contentBytes: encodeBase64(bytes),
      });
    }

    for (const a of attachments ?? []) {
      if (!a.file_path && !generated.some((g) => g.export_name === a.export_name)) skipped.push(a.export_name);
    }
    if (skipped.length) return json({ ok: false, message: `Ingen e-post sendt. Følgende vedlegg kunne ikke legges ved: ${skipped.join(", ")}` }, 400);

    const tokenResult = await getGraphToken();
    if (tokenResult.error) {
      await admin.from(packageTable).update({ status: standalone ? "failed" : "draft", send_error: tokenResult.error, sent_at: null }).eq("id", packageId);
      return json({ ok: false, message: tokenResult.error }, 502);
    }

    const message: any = {
      subject,
      body: { contentType: "HTML", content: html + (links.length ? `<h3>Sikker nedlasting</h3>${links.map(l => `<p><a href="${escape(l.url)}">${escape(l.name)}</a> – gyldig til ${escape(l.expires_at)}</p>`).join("")}` : "") },
      toRecipients: to.map(address => ({ emailAddress: { address } })),
      attachments: graphAttachments,
    };
    if (Array.isArray(pkg.cc_emails) && pkg.cc_emails.length) {
      message.ccRecipients = cc.map((e: string) => ({ emailAddress: { address: e } }));
    }

    {
      const { data: claimed, error: claimError } = await admin.from(packageTable).update({ status: "sending" }).eq("id", packageId).in("status", standalone ? ["prepared", "downloaded", "failed"] : ["draft", "exported"]).select("id").maybeSingle();
      if (claimError || !claimed) return json({ ok: false, message: "Eksporten er allerede sendt eller under sending" }, 409);
    }
    const { error: attemptError } = await logEvent("dle_send_attempted", `E-postforsøk til ${to.join(", ")}`, { ...pkg.delivery_metadata, package_id: pkg.id, to, cc, links: links.map(({ url: _url, ...rest }) => rest) });
    if (attemptError) {
      await admin.from(packageTable).update({ status: standalone ? "failed" : "draft", send_error: "Kunne ikke registrere sendeforsøket" }).eq("id", packageId);
      return json({ ok: false, message: "Kunne ikke registrere sendeforsøket" }, 500);
    }
    const resp = await fetch(`https://graph.microsoft.com/v1.0/users/${MAILBOX}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenResult.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message, saveToSentItems: true }),
    });

    if (!resp.ok && resp.status !== 202) {
      const errText = await resp.text();
      let msg = errText;
      try {
        msg = JSON.parse(errText)?.error?.message ?? errText;
      } catch { /* rå tekst */ }
      console.error("SVARPAKKE SEND FEILET", { packageId, status: resp.status, msg });
      await admin.from(packageTable).update({ status: standalone ? "failed" : "draft", send_error: msg, sent_at: null }).eq("id", packageId);
      await logEvent("dle_send_failed", "Microsoft avviste sendingen", { package_id: pkg.id, to, cc, error: msg });
      return json({ ok: false, message: `Microsoft avviste utsendelsen: ${msg}` }, 502);
    }

    await admin
      .from(packageTable)
      .update({ status: "sent", sent_at: new Date().toISOString(), sent_by: userId, send_error: null })
      .eq("id", packageId);

    // Only a confirmed Graph acceptance can advance findings; never preparation/preflight.
    if (!standalone && findingIds.length) {
      await admin.from("compliance_findings").update({ status: "submitted" }).in("id", findingIds).eq("company_id", pkg.company_id).neq("status", "approved");
      await admin.from("compliance_inspections").update({ status: "submitted", submitted_at: new Date().toISOString() }).eq("id", pkg.inspection_id).eq("company_id", pkg.company_id);
      await admin.from("compliance_correspondence").insert({ company_id: pkg.company_id, inspection_id: pkg.inspection_id, direction: "out", occurred_at: new Date().toISOString(), contact_name: pkg.recipient_name || pkg.recipient_email, subject, notes: `Svarpakke ${pkg.package_number} akseptert av Microsoft til ${to.join(", ")}`, created_by: userId });
      await logEvent("response_sent", `Svarpakke ${pkg.package_number} akseptert av Microsoft`, { package_id: pkg.id, finding_ids: findingIds, to, cc });
    }

    await logEvent("dle_sent", `Microsoft aksepterte sending til ${to.join(", ")}${cc.length ? ` · Kopi: ${cc.join(", ")}` : ""}: ${(attachments ?? []).map(a => a.export_name).join(", ")}`, { ...pkg.delivery_metadata, to, cc, package_id: pkg.id, delivery: links.length ? "email_link" : "email", exports: (attachments ?? []).map(a => a.export_name), links: links.map(({ url: _url, ...rest }) => rest) });
    console.log("SVARPAKKE SENDT", {
      packageId,
      recipient: pkg.recipient_email,
      attachments: graphAttachments.length,
      skipped: skipped.length,
    });

    return json({ ok: true, attachments: graphAttachments.length, skipped, mailbox: MAILBOX });
  } catch (e) {
    console.error("SVARPAKKE UVENTET FEIL", e);
    return json({ ok: false, message: e instanceof Error ? e.message : "Ukjent feil" }, 500);
  }
});
