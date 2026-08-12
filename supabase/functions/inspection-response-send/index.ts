// Sender svarpakke for en tilsynssak via Microsoft Graph.
// Vedleggene hentes fra storage med service role og legges på e-posten med de
// ryddige eksportnavnene som er lagret på pakken. Ingenting kopieres i storage.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAILBOX = "postkontoret@mcsservice.no";
/** Graph sendMail tåler ca 4 MB base64 per melding – vi holder oss godt under */
const MAX_TOTAL_ATTACHMENTS = 12 * 1024 * 1024;

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
    const { data: claims, error: claimsErr } = await authClient.auth.getClaims(token);
    const userId = claims?.claims?.sub;
    if (claimsErr || !userId) return json({ ok: false, message: "Ugyldig token" }, 401);

    const body = await req.json().catch(() => ({}));
    const packageId: string | undefined = body.package_id;
    const generated: { export_name: string; content: string }[] = Array.isArray(body.generated) ? body.generated : [];
    if (!packageId) return json({ ok: false, message: "Mangler svarpakke" }, 400);

    const admin = createClient(url, service);

    const { data: pkg, error: pkgErr } = await admin
      .from("compliance_response_packages")
      .select("*")
      .eq("id", packageId)
      .maybeSingle();
    if (pkgErr || !pkg) return json({ ok: false, message: "Fant ikke svarpakken" }, 404);
    if (!pkg.recipient_email) return json({ ok: false, message: "Mottaker mangler e-postadresse" }, 400);

    // Autoritativ tilgangssjekk: brukeren må ha HMS-tilgang i selskapet pakken hører til
    const { data: allowed } = await admin.rpc("has_hms_manage", { _auth_user_id: userId, _company_id: pkg.company_id });
    if (!allowed) return json({ ok: false, message: "Du har ikke tilgang til å sende svar på tilsyn" }, 403);

    const html: string = body.html ?? pkg.email_body_snapshot ?? "";
    const subject: string = body.subject ?? pkg.subject ?? "Tilbakemelding på tilsyn";

    const { data: attachments } = await admin
      .from("compliance_response_package_attachments")
      .select("*")
      .eq("package_id", packageId)
      .order("sort_order");

    const graphAttachments: any[] = [];
    let total = 0;
    const skipped: string[] = [];

    for (const a of attachments ?? []) {
      if (!a.file_path || !a.storage_bucket) continue;
      const { data: file, error } = await admin.storage.from(a.storage_bucket).download(a.file_path);
      if (error || !file) {
        skipped.push(a.export_name);
        continue;
      }
      const buf = await file.arrayBuffer();
      if (total + buf.byteLength > MAX_TOTAL_ATTACHMENTS) {
        skipped.push(a.export_name);
        continue;
      }
      total += buf.byteLength;
      graphAttachments.push({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: a.export_name,
        contentType: a.mime_type ?? "application/octet-stream",
        contentBytes: encodeBase64(buf),
      });
    }

    // Systemgenererte oversikter (kompetanseoversikt, dokumentmanifest) kommer som tekst fra klienten
    for (const g of generated) {
      const bytes = new TextEncoder().encode(g.content);
      if (total + bytes.byteLength > MAX_TOTAL_ATTACHMENTS) {
        skipped.push(g.export_name);
        continue;
      }
      total += bytes.byteLength;
      graphAttachments.push({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: g.export_name,
        contentType: g.export_name.endsWith(".csv") ? "text/csv" : "text/plain",
        contentBytes: encodeBase64(bytes),
      });
    }

    const tokenResult = await getGraphToken();
    if (tokenResult.error) {
      await admin.from("compliance_response_packages").update({ status: "draft", send_error: tokenResult.error, sent_at: null }).eq("id", packageId);
      return json({ ok: false, message: tokenResult.error }, 502);
    }

    const message: any = {
      subject,
      body: { contentType: "HTML", content: html },
      toRecipients: [{ emailAddress: { address: pkg.recipient_email } }],
      attachments: graphAttachments,
    };
    if (Array.isArray(pkg.cc_emails) && pkg.cc_emails.length) {
      message.ccRecipients = pkg.cc_emails.map((e: string) => ({ emailAddress: { address: e } }));
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
      await admin.from("compliance_response_packages").update({ status: "draft", send_error: msg, sent_at: null }).eq("id", packageId);
      return json({ ok: false, message: `Microsoft avviste utsendelsen: ${msg}` }, 502);
    }

    await admin
      .from("compliance_response_packages")
      .update({ status: "sent", sent_at: new Date().toISOString(), sent_by: userId, send_error: null })
      .eq("id", packageId);

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
