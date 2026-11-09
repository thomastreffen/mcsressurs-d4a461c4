import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const LOCK_WINDOW_SECONDS = 30;

// ── Helpers ──

function normalizeText(s: string): string {
  return (s || "").replace(/\s+/g, " ").trim();
}

async function computeSendHash(entityId: string, to: string[], cc: string[], subject: string, bodyHtml: string): Promise<string> {
  const raw = [
    entityId,
    ...(to || []).map(normalizeText).sort(),
    ...(cc || []).map(normalizeText).sort(),
    normalizeText(subject),
    normalizeText(bodyHtml),
  ].join("|");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function buildStructuredError(code: string, message: string, recommendation: string, graphStatus?: number): object {
  return { error_code: code, message, recommendation, ...(graphStatus ? { graph_status: graphStatus } : {}) };
}

function classifyGraphError(status: number, body: string): { code: string; message: string; recommendation: string } {
  if (status === 401) return { code: "invalid_grant", message: "Token er ugyldig eller utløpt.", recommendation: "Logg inn på nytt for å fornye Microsoft-tilkoblingen." };
  if (status === 403) return { code: "insufficient_privileges", message: "Mangler rettigheter (Mail.ReadWrite).", recommendation: "Sjekk at admin har godkjent Graph-tilgangene (admin consent)." };
  if (status === 404) return { code: "item_not_found", message: "Meldingen ble ikke funnet i Outlook.", recommendation: "Utkastet kan ha blitt slettet. Opprett et nytt." };
  if (status === 429) return { code: "throttled", message: "For mange forespørsler til Outlook.", recommendation: "Vent noen sekunder og prøv igjen." };
  try {
    const parsed = JSON.parse(body);
    const msg = parsed?.error?.message || body.substring(0, 200);
    if (msg.includes("InvalidRecipients") || msg.includes("IMCEAEX")) return { code: "invalid_recipients", message: "En eller flere mottakeradresser er ugyldige.", recommendation: "Sjekk e-postadressene og prøv igjen." };
    return { code: "graph_error", message: msg.substring(0, 200), recommendation: "Prøv igjen. Kontakt administrator hvis feilen vedvarer." };
  } catch {
    return { code: "graph_error", message: `Graph API feil (HTTP ${status})`, recommendation: "Prøv igjen." };
  }
}

async function ensureValidMsToken(
  supabaseAdmin: any,
  userId: string,
  log: (msg: string) => void
): Promise<{ token: string | null; errorInfo?: object }> {
  const { data: userData, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !userData?.user) {
    log(`User fetch failed: ${error?.message}`);
    return { token: null, errorInfo: buildStructuredError("missing_token", "Bruker ikke funnet.", "Kontakt administrator.") };
  }

  const meta = userData.user.user_metadata || {};
  const accessToken = meta.ms_access_token;
  const refreshToken = meta.ms_refresh_token;
  const expiresAt = meta.ms_expires_at;

  if (!accessToken) {
    log("No MS access token");
    return { token: null, errorInfo: buildStructuredError("missing_token", "Ingen Microsoft-tilkobling funnet.", "Logg inn med Microsoft via Integrasjoner-siden.") };
  }

  if (expiresAt && new Date(expiresAt).getTime() > Date.now() + 5 * 60 * 1000) {
    return { token: accessToken };
  }

  if (!refreshToken) {
    log("Token expired, no refresh token");
    return { token: null, errorInfo: buildStructuredError("invalid_grant", "Microsoft-token utløpt uten refresh-token.", "Logg inn på nytt for å fornye tilkoblingen.") };
  }

  log("Refreshing token...");
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${Deno.env.get("AZURE_TENANT_ID")}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("AZURE_CLIENT_ID")!,
        client_secret: Deno.env.get("AZURE_CLIENT_SECRET")!,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: "https://graph.microsoft.com/.default offline_access",
      }),
    }
  );

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    log(`Refresh failed: ${tokenRes.status} ${errBody.substring(0, 200)}`);
    return { token: null, errorInfo: buildStructuredError("invalid_grant", "Kunne ikke fornye Microsoft-token.", "Logg inn på nytt via Integrasjoner.") };
  }

  const tokenData = await tokenRes.json();
  const newExpiry = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...meta,
      ms_access_token: tokenData.access_token,
      ms_refresh_token: tokenData.refresh_token || refreshToken,
      ms_expires_at: newExpiry,
    },
  });

  log("Token refreshed");
  return { token: tokenData.access_token };
}

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const respond = (data: any, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return respond({ error: "Unauthorized" }, 401);

    const jwt = authHeader.replace("Bearer ", "");
    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: authUser }, error: userErr } = await supabaseAnon.auth.getUser(jwt);
    if (userErr || !authUser) return respond({ error: "Invalid session" }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json().catch(() => ({}));
    const { action } = body;
    const logs: string[] = [];
    const log = (msg: string) => {
      logs.push(`[${new Date().toISOString().slice(11, 23)}] ${msg}`);
      console.log(`[ms-mail] ${msg}`);
    };

    log(`Action: ${action}, user: ${authUser.id}`);

    const { token: msToken, errorInfo: tokenError } = await ensureValidMsToken(supabaseAdmin, authUser.id, log);
    if (!msToken) {
      return respond({
        error: (tokenError as any)?.message || "Microsoft-tilkobling må fornyes.",
        error_info: tokenError,
        ms_reauth: true,
        logs,
      }, 401);
    }

    // ─── HELPER: Build subject with ref_code (bracket format) ───
    const buildSubjectWithRef = (rawSubject: string, refCode: string | null): string => {
      if (!refCode) return rawSubject;
      // Don't duplicate if ref is already in subject (check both bracket and old format)
      if (rawSubject.includes(refCode)) return rawSubject;
      // Use bracket format: [JOB-000010] Subject
      return `[${refCode}] ${rawSubject}`;
    };

    // ─── HELPER: Append ref footer to body ───
    const appendRefFooter = (htmlBody: string, refCode: string | null): string => {
      if (!refCode) return htmlBody;
      if (htmlBody.includes(refCode)) return htmlBody;
      return htmlBody + `<br/><p style="color:#999;font-size:11px;">Ref: ${refCode}</p>`;
    };

    // ─── HELPER: Resolve ref_code for entity ───
    const resolveRefCode = async (entityType: string, entityId: string): Promise<string | null> => {
      if (entityType === "lead") {
        const { data } = await supabaseAdmin.from("leads").select("lead_ref_code").eq("id", entityId).single();
        return data?.lead_ref_code || null;
      }
      if (entityType === "job") {
        const { data } = await supabaseAdmin.from("events").select("internal_number, project_number").eq("id", entityId).single();
        return data?.internal_number || data?.project_number || null;
      }
      if (entityType === "case") {
        const { data } = await supabaseAdmin.from("cases").select("case_number").eq("id", entityId).single();
        return data?.case_number || null;
      }
      return null;
    };

    // Company default inbox for Reply-To / BCC fail-safe capture
    const COMPANY_INBOX = "postkontoret@mcsservice.no";

    // ─── HELPER: Build Graph message object ───
    const buildGraphMessage = (
      subject: string, bodyHtml: string, to: string[], cc?: string[], bcc?: string[],
      entityType?: string, entityId?: string, refCode?: string | null
    ) => {
      // Merge user BCC with fail-safe company inbox BCC
      const allBcc = [...(bcc || [])];
      if (!allBcc.some(e => e.toLowerCase() === COMPANY_INBOX.toLowerCase())) {
        allBcc.push(COMPANY_INBOX);
      }

      const msg: any = {
        subject,
        body: { contentType: "HTML", content: bodyHtml },
        toRecipients: to.map((e: string) => ({ emailAddress: { address: e } })),
        isDraft: true,
        // Set Reply-To to company inbox so replies always land in Postkontoret
        replyTo: [{ emailAddress: { address: COMPANY_INBOX } }],
        bccRecipients: allBcc.map((e: string) => ({ emailAddress: { address: e } })),
      };
      if (cc?.length) msg.ccRecipients = cc.map((e: string) => ({ emailAddress: { address: e } }));

      // Add custom internet message headers for robust routing
      const customHeaders: { name: string; value: string }[] = [];
      if (entityType) customHeaders.push({ name: "X-MCS-ENTITY", value: entityType.toUpperCase() });
      if (refCode) customHeaders.push({ name: "X-MCS-ID", value: refCode });
      if (entityId) customHeaders.push({ name: "X-MCS-THREAD", value: entityId });
      if (customHeaders.length > 0) {
        msg.internetMessageHeaders = customHeaders;
      }

      return msg;
    };

    // ─── HELPER: Fetch weblink from Graph for sent message ───
    const fetchWebLink = async (messageId: string): Promise<string | null> => {
      try {
        // After sending, the message moves to SentItems. Try to find via internetMessageId.
        const getRes = await fetch(`${GRAPH_BASE}/me/messages/${messageId}?$select=webLink`, {
          headers: { Authorization: `Bearer ${msToken}` },
        });
        if (getRes.ok) {
          const data = await getRes.json();
          return data.webLink || null;
        }
        // Message might have moved; webLink from draft is still valid for Outlook web
        await getRes.text(); // consume body
        return null;
      } catch {
        return null;
      }
    };

    // ─── CREATE DRAFT ───
    if (action === "create_draft") {
      const { entity_type, entity_id, to, cc, bcc, subject: rawSubject, body_html: rawBodyHtml } = body;
      if (!entity_type || !entity_id || !rawSubject) {
        return respond({ error: "Missing required fields", logs }, 400);
      }

      const refCode = await resolveRefCode(entity_type, entity_id);
      const subject = buildSubjectWithRef(rawSubject, refCode);
      const bodyHtml = appendRefFooter(rawBodyHtml || "", refCode);

      log(`Creating draft for ${entity_type}/${entity_id}, ref: ${refCode}`);

      const graphMsg = buildGraphMessage(subject, bodyHtml, to || [], cc, bcc, entity_type, entity_id, refCode);
      const graphRes = await fetch(`${GRAPH_BASE}/me/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${msToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(graphMsg),
      });

      if (!graphRes.ok) {
        const errText = await graphRes.text();
        log(`Draft creation failed: ${graphRes.status}`);
        const errInfo = classifyGraphError(graphRes.status, errText);
        return respond({
          error: errInfo.message,
          error_info: buildStructuredError(errInfo.code, errInfo.message, errInfo.recommendation, graphRes.status),
          ms_reauth: graphRes.status === 401 || graphRes.status === 403,
          logs,
        }, 500);
      }

      const draft = await graphRes.json();
      log(`Draft created: ${draft.id?.slice(0, 30)}`);

      // Add attachments to draft if provided
      const draftAttachments = body.attachments || [];
      if (draftAttachments.length > 0) {
        log(`Adding ${draftAttachments.length} attachment(s) to draft`);
        for (const att of draftAttachments) {
          try {
            const fileRes = await fetch(att.url);
            if (!fileRes.ok) { log(`Failed to download: ${att.name}`); continue; }
            const fileBuffer = await fileRes.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));
            const attRes = await fetch(`${GRAPH_BASE}/me/messages/${draft.id}/attachments`, {
              method: "POST",
              headers: { Authorization: `Bearer ${msToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                "@odata.type": "#microsoft.graph.fileAttachment",
                name: att.name,
                contentType: att.contentType || "application/octet-stream",
                contentBytes: base64,
              }),
            });
            if (attRes.ok) log(`Attachment added: ${att.name}`);
            else log(`Attachment failed: ${att.name} – ${attRes.status}`);
          } catch (e: any) { log(`Attachment error: ${att.name} – ${e.message}`); }
        }
      }

      const logRow = {
        entity_type,
        entity_id,
        direction: "outbound",
        mode: "draft",
        to_recipients: (to || []).map((e: string) => ({ address: e })),
        cc_recipients: (cc || []).map((e: string) => ({ address: e })),
        bcc_recipients: (bcc || []).map((e: string) => ({ address: e })),
        subject,
        body_preview: bodyHtml.replace(/<[^>]*>/g, "").substring(0, 500),
        graph_message_id: draft.id,
        internet_message_id: draft.internetMessageId || null,
        conversation_id: draft.conversationId || null,
        outlook_weblink: draft.webLink || null,
        created_by: authUser.id,
        ref_code: refCode,
      };

      const { error: insertErr } = await supabaseAdmin.from("communication_logs").insert(logRow);
      if (insertErr) log(`DB insert warning: ${insertErr.message}`);

      if (entity_type === "lead") {
        await supabaseAdmin.from("lead_history").insert({
          lead_id: entity_id, action: "email_draft_created",
          description: `E-postutkast opprettet: ${subject}`,
          performed_by: authUser.id, metadata: { message_id: draft.id, ref_code: refCode },
        });
      }
      if (entity_type === "job") {
        await supabaseAdmin.from("event_logs").insert({
          event_id: entity_id, action_type: "email_draft_created",
          performed_by: authUser.id, change_summary: `E-postutkast opprettet: ${subject}`,
        });
      }

      return respond({
        success: true, mode: "draft",
        message_id: draft.id,
        web_link: draft.webLink || `https://outlook.office365.com/mail/drafts`,
        internet_message_id: draft.internetMessageId || null,
        conversation_id: draft.conversationId || null,
        ref_code: refCode,
        logs,
      });
    }

    // ─── SEND MAIL (draft-first, idempotent) ───
    if (action === "send_mail") {
      const { entity_type, entity_id, to, cc, bcc, subject: rawSubject, body_html: rawBodyHtml } = body;
      if (!entity_type || !entity_id || !rawSubject || !to?.length) {
        return respond({ error: "Missing required fields", logs }, 400);
      }

      const operationId = crypto.randomUUID();
      const now = new Date().toISOString();

      const refCode = await resolveRefCode(entity_type, entity_id);
      const subject = buildSubjectWithRef(rawSubject, refCode);
      const bodyHtml = appendRefFooter(rawBodyHtml || "", refCode);

      log(`Send mail for ${entity_type}/${entity_id}, ref: ${refCode}, op: ${operationId.slice(0, 8)}`);

      // ── Idempotency check: same hash within 60 seconds = already_sent ──
      const sendHash = await computeSendHash(entity_id, to, cc || [], subject, bodyHtml);
      log(`Send hash: ${sendHash.slice(0, 12)}`);

      const cutoff = new Date(Date.now() - 60_000).toISOString();
      const { data: existing } = await supabaseAdmin
        .from("communication_logs")
        .select("id, mode, outlook_weblink, created_at")
        .eq("send_hash", sendHash)
        .eq("mode", "sent")
        .gte("created_at", cutoff)
        .limit(1);

      if (existing && existing.length > 0) {
        log("Duplicate detected – already_sent");
        return respond({
          success: true,
          mode: "already_sent",
          message: "Denne e-posten ble allerede sendt.",
          web_link: existing[0].outlook_weblink,
          existing_id: existing[0].id,
          logs,
        });
      }

      // ── Claim operation (simple lock) ──
      // Insert a "sending" row to claim the operation
      const claimRow = {
        entity_type,
        entity_id,
        direction: "outbound",
        mode: "sending",
        to_recipients: to.map((e: string) => ({ address: e })),
        cc_recipients: (cc || []).map((e: string) => ({ address: e })),
        bcc_recipients: (bcc || []).map((e: string) => ({ address: e })),
        subject,
        body_preview: bodyHtml.replace(/<[^>]*>/g, "").substring(0, 500),
        created_by: authUser.id,
        ref_code: refCode,
        send_hash: sendHash,
        last_operation_id: operationId,
        last_operation_at: now,
      };

      const { data: claimData, error: claimErr } = await supabaseAdmin
        .from("communication_logs")
        .insert(claimRow)
        .select("id")
        .single();

      if (claimErr) {
        log(`Claim failed: ${claimErr.message}`);
        return respond({ error: "Kunne ikke starte sending.", logs }, 500);
      }
      const claimId = claimData.id;
      log(`Claimed operation, log_id: ${claimId}`);

      // ── Step 1: Create draft ──
      const graphMsg = buildGraphMessage(subject, bodyHtml, to, cc, bcc, entity_type, entity_id, refCode);
      const draftRes = await fetch(`${GRAPH_BASE}/me/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${msToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(graphMsg),
      });

      if (!draftRes.ok) {
        const errText = await draftRes.text();
        log(`Draft creation failed: ${draftRes.status}`);
        const errInfo = classifyGraphError(draftRes.status, errText);
        // Update claim row to failed
        await supabaseAdmin.from("communication_logs").update({
          mode: "failed",
          last_error: buildStructuredError(errInfo.code, errInfo.message, errInfo.recommendation, draftRes.status),
        }).eq("id", claimId);
        return respond({
          error: errInfo.message,
          error_info: buildStructuredError(errInfo.code, errInfo.message, errInfo.recommendation, draftRes.status),
          ms_reauth: draftRes.status === 401 || draftRes.status === 403,
          logs,
        }, 500);
      }

      const draft = await draftRes.json();
      log(`Draft created: ${draft.id?.slice(0, 30)}`);

      // Update claim with draft info
      await supabaseAdmin.from("communication_logs").update({
        graph_message_id: draft.id,
        internet_message_id: draft.internetMessageId || null,
        conversation_id: draft.conversationId || null,
        outlook_weblink: draft.webLink || null,
      }).eq("id", claimId);

      // ── Step 1b: Add attachments to draft ──
      const attachmentsList = body.attachments || [];
      if (attachmentsList.length > 0) {
        log(`Adding ${attachmentsList.length} attachment(s) to draft`);
        for (const att of attachmentsList) {
          try {
            const fileRes = await fetch(att.url);
            if (!fileRes.ok) {
              log(`Failed to download attachment: ${att.name} (${fileRes.status})`);
              continue;
            }
            const fileBuffer = await fileRes.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));

            const attRes = await fetch(`${GRAPH_BASE}/me/messages/${draft.id}/attachments`, {
              method: "POST",
              headers: { Authorization: `Bearer ${msToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                "@odata.type": "#microsoft.graph.fileAttachment",
                name: att.name,
                contentType: att.contentType || "application/octet-stream",
                contentBytes: base64,
              }),
            });
            if (attRes.ok) {
              log(`Attachment added: ${att.name}`);
            } else {
              const attErr = await attRes.text();
              log(`Attachment failed: ${att.name} – ${attRes.status} ${attErr.substring(0, 100)}`);
            }
          } catch (attErr: any) {
            log(`Attachment error: ${att.name} – ${attErr.message}`);
          }
        }
      }

      // ── Step 2: Send the draft ──
      const sendRes = await fetch(`${GRAPH_BASE}/me/messages/${draft.id}/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${msToken}`, "Content-Length": "0" },
      });

      if (!sendRes.ok) {
        const errText = await sendRes.text();
        log(`Send failed: ${sendRes.status}`);
        const errInfo = classifyGraphError(sendRes.status, errText);
        await supabaseAdmin.from("communication_logs").update({
          mode: "failed",
          last_error: buildStructuredError(errInfo.code, errInfo.message, errInfo.recommendation, sendRes.status),
        }).eq("id", claimId);
        return respond({
          error: errInfo.message,
          error_info: buildStructuredError(errInfo.code, errInfo.message, errInfo.recommendation, sendRes.status),
          draft_id: draft.id,
          web_link: draft.webLink,
          logs,
        }, 500);
      }

      log("Mail sent successfully");

      // ── Step 3: Verify/update weblink after send ──
      let finalWebLink = draft.webLink;
      const fetchedLink = await fetchWebLink(draft.id);
      if (fetchedLink) finalWebLink = fetchedLink;

      // Update claim row to sent
      await supabaseAdmin.from("communication_logs").update({
        mode: "sent",
        outlook_weblink: finalWebLink,
      }).eq("id", claimId);

      // Activity logging
      if (entity_type === "lead") {
        await supabaseAdmin.from("lead_history").insert({
          lead_id: entity_id, action: "email_sent",
          description: `E-post sendt: ${subject}`,
          performed_by: authUser.id, metadata: { message_id: draft.id, to, ref_code: refCode },
        });
      }
      if (entity_type === "job") {
        await supabaseAdmin.from("event_logs").insert({
          event_id: entity_id, action_type: "email_sent",
          performed_by: authUser.id,
          change_summary: `E-post sendt: ${subject} → ${to.join(", ")}`,
        });
      }

      return respond({
        success: true,
        mode: "sent",
        message_id: draft.id,
        internet_message_id: draft.internetMessageId || null,
        conversation_id: draft.conversationId || null,
        web_link: finalWebLink,
        ref_code: refCode,
        logs,
      });
    }

    // ─── FETCH THREAD ───
    if (action === "fetch_thread") {
      const { entity_type, entity_id } = body;
      if (!entity_type || !entity_id) {
        return respond({ error: "Missing entity_type/entity_id", logs }, 400);
      }

      log(`Fetch thread for ${entity_type}/${entity_id}`);

      // ── Throttle: check last fetch time for this entity ──
      const { data: lastFetchLog } = await supabaseAdmin
        .from("communication_logs")
        .select("updated_at")
        .eq("entity_type", entity_type)
        .eq("entity_id", entity_id)
        .eq("mode", "thread_fetch_marker")
        .limit(1)
        .single();

      const THROTTLE_MS = 2 * 60 * 1000; // 2 minutes
      const lastFetchAt = lastFetchLog?.updated_at ? new Date(lastFetchLog.updated_at).getTime() : 0;
      const now = Date.now();

      if (lastFetchAt > 0 && (now - lastFetchAt) < THROTTLE_MS) {
        log("Throttled – returning cached messages");
        // Return cached messages from DB
        const { data: cached } = await supabaseAdmin
          .from("communication_logs")
          .select("id, mode, direction, subject, to_recipients, body_preview, outlook_weblink, created_at, graph_message_id, last_error, ref_code")
          .eq("entity_type", entity_type)
          .eq("entity_id", entity_id)
          .neq("mode", "thread_fetch_marker")
          .order("created_at", { ascending: false })
          .limit(30);

        return respond({
          success: true,
          messages: [],
          stored_count: 0,
          throttled: true,
          last_fetch_at: new Date(lastFetchAt).toISOString(),
          ref_code: null,
          logs,
        });
      }

      // Find existing outbound logs for this entity to get conversation_id / ref_code
      const { data: existingLogs } = await supabaseAdmin
        .from("communication_logs")
        .select("conversation_id, ref_code, graph_message_id")
        .eq("entity_type", entity_type)
        .eq("entity_id", entity_id)
        .eq("direction", "outbound")
        .not("conversation_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(5);

      const conversationIds = [...new Set((existingLogs || []).map(l => l.conversation_id).filter(Boolean))];
      const refCode = (existingLogs || [])[0]?.ref_code || await resolveRefCode(entity_type, entity_id);

      log(`Found ${conversationIds.length} conversation IDs, ref: ${refCode}`);

      let graphMessages: any[] = [];

      if (conversationIds.length > 0) {
        for (const convId of conversationIds.slice(0, 3)) {
          const filterStr = `conversationId eq '${convId}'`;
          const url = `${GRAPH_BASE}/me/messages?$filter=${encodeURIComponent(filterStr)}&$top=25&$select=id,subject,bodyPreview,from,toRecipients,receivedDateTime,webLink,internetMessageId,conversationId,isDraft`;
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${msToken}` },
          });
          if (res.ok) {
            const data = await res.json();
            graphMessages.push(...(data.value || []));
          } else {
            const errText = await res.text();
            log(`Graph fetch by convId failed: ${res.status} ${errText.substring(0, 100)}`);
          }
        }
      }

      // Fallback: search by ref_code if no results
      if (graphMessages.length === 0 && refCode) {
        log("Falling back to ref_code search");
        const searchUrl = `${GRAPH_BASE}/me/messages?$search="${encodeURIComponent(`"${refCode}"`)}"&$top=25&$select=id,subject,bodyPreview,from,toRecipients,receivedDateTime,webLink,internetMessageId,conversationId,isDraft`;
        const res = await fetch(searchUrl, {
          headers: { Authorization: `Bearer ${msToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          graphMessages = data.value || [];
        } else {
          const errText = await res.text();
          log(`Graph search failed: ${res.status} ${errText.substring(0, 100)}`);
        }
      }

      log(`Found ${graphMessages.length} messages from Graph`);

      // Deduplicate by message id
      const seenIds = new Set<string>();
      const uniqueMessages = graphMessages.filter(m => {
        if (seenIds.has(m.id)) return false;
        seenIds.add(m.id);
        return true;
      });

      // Store inbound messages idempotently
      let storedCount = 0;
      for (const msg of uniqueMessages) {
        const fromAddr = msg.from?.emailAddress?.address || "";
        const userEmail = authUser.email?.toLowerCase() || "";
        const isFromSelf = fromAddr.toLowerCase() === userEmail;
        if (isFromSelf || msg.isDraft) continue;

        const { data: existing } = await supabaseAdmin
          .from("communication_logs")
          .select("id")
          .eq("graph_message_id", msg.id)
          .limit(1);

        if (existing && existing.length > 0) continue;

        const inboundRow = {
          entity_type,
          entity_id,
          direction: "inbound",
          mode: "received",
          to_recipients: (msg.toRecipients || []).map((r: any) => ({ address: r.emailAddress?.address })),
          subject: msg.subject || "",
          body_preview: (msg.bodyPreview || "").substring(0, 500),
          graph_message_id: msg.id,
          internet_message_id: msg.internetMessageId || null,
          conversation_id: msg.conversationId || null,
          outlook_weblink: msg.webLink || null,
          created_by: authUser.id,
          ref_code: refCode,
          created_at: msg.receivedDateTime || new Date().toISOString(),
        };

        const { error: insertErr } = await supabaseAdmin.from("communication_logs").insert(inboundRow);
        if (!insertErr) storedCount++;
        else log(`Inbound insert warning: ${insertErr.message}`);
      }

      log(`Stored ${storedCount} new inbound messages`);

      // ── Update thread_fetch_marker (upsert) ──
      const markerRow = {
        entity_type,
        entity_id,
        direction: "outbound",
        mode: "thread_fetch_marker",
        to_recipients: [],
        subject: "__thread_fetch_marker__",
        created_by: authUser.id,
        updated_at: new Date().toISOString(),
      };

      const { data: existingMarker } = await supabaseAdmin
        .from("communication_logs")
        .select("id")
        .eq("entity_type", entity_type)
        .eq("entity_id", entity_id)
        .eq("mode", "thread_fetch_marker")
        .limit(1)
        .single();

      if (existingMarker) {
        await supabaseAdmin
          .from("communication_logs")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", existingMarker.id);
      } else {
        await supabaseAdmin.from("communication_logs").insert(markerRow);
      }

      // Return formatted messages
      const formatted = uniqueMessages.map(msg => ({
        message_id: msg.id,
        internet_message_id: msg.internetMessageId || null,
        conversation_id: msg.conversationId || null,
        from: msg.from?.emailAddress?.address || null,
        from_name: msg.from?.emailAddress?.name || null,
        to: (msg.toRecipients || []).map((r: any) => r.emailAddress?.address),
        subject: msg.subject || "",
        body_preview: msg.bodyPreview || "",
        received_at: msg.receivedDateTime || null,
        web_link: msg.webLink || null,
        is_draft: msg.isDraft || false,
      }));

      const fetchTimestamp = new Date().toISOString();

      return respond({
        success: true,
        messages: formatted,
        stored_count: storedCount,
        last_fetch_at: fetchTimestamp,
        ref_code: refCode,
        logs,
      });
    }

    return respond({ error: `Unknown action: ${action}`, logs }, 400);
  } catch (err) {
    console.error("[ms-mail] Error:", err);
    return respond({ error: String(err) }, 500);
  }
});
