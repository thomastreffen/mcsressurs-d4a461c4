/**
 * task-thread-email-send
 * 
 * Sends an email from a task thread to assigned technicians.
 * Uses Microsoft Graph API via the system mailbox (postkontoret@mcsservice.no).
 * 
 * Threading strategy:
 * - reply-to: task-thread+{thread_token}@mcsservice.no
 * - X-MCS-Task-Thread-Token header for robust inbound matching
 * - Message-ID / In-Reply-To / References for standard email threading
 * - Subject contains [TASK-{internal_number}] for fallback matching
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { formatJobSchedule } from "../_shared/job-time.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const MAILBOX = "postkontoret@mcsservice.no";
const DOMAIN = "mcsservice.no";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { task_id, body_text, attachment_paths, recipient_emails, reply_to_message_id, priority } = body;
    // attachment_paths: array of { file_path, file_name, mime_type, file_size }
    // recipient_emails: optional array of email strings to filter recipients
    // priority: 'normal' | 'important' | 'urgent'

    const MAX_ATTACHMENT_SIZE = 3 * 1024 * 1024; // 3 MB per file — Graph limit for inline is ~4MB but we keep margin

    if (!task_id) return json({ error: "task_id required" }, 400);
    if (!body_text?.trim()) return json({ error: "body_text required" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // ── Authenticate caller ──
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    // ── Check permission ──
    const { data: canEmail } = await supabase.rpc("check_permission_v2", {
      _auth_user_id: user.id,
      _perm: "task_thread.email_external",
    });
    if (!canEmail) return json({ error: "Missing permission: task_thread.email_external" }, 403);

    // ── Get task (event) details ──
    const { data: task } = await supabase
      .from("events")
      .select("id, title, customer, address, start_time, end_time, internal_number, company_id, parent_project_id")
      .eq("id", task_id)
      .is("deleted_at", null)
      .single();
    if (!task) return json({ error: "Task not found" }, 404);

    // ── Get assigned technicians with emails ──
    const { data: techLinks } = await supabase
      .from("event_technicians")
      .select("technician_id, technicians(id, name, email)")
      .eq("event_id", task_id);

    let allRecipients: { name: string; email: string }[] = [];
    for (const link of (techLinks || []) as any[]) {
      const tech = link.technicians;
      if (tech?.email) {
        allRecipients.push({ name: tech.name, email: tech.email });
      }
    }

    // Filter to selected recipients if provided
    const recipientFilter = recipient_emails as string[] | undefined;
    const recipients = recipientFilter && recipientFilter.length > 0
      ? allRecipients.filter(r => recipientFilter.includes(r.email))
      : allRecipients;

    if (recipients.length === 0) {
      return json({ error: "Ingen valgte montører med e-postadresse" }, 400);
    }

    // ── Get or create thread ──
    let { data: thread } = await supabase
      .from("task_threads")
      .select("id, thread_token, company_id")
      .eq("task_id", task_id)
      .maybeSingle();

    if (!thread) {
      const { data: newThread, error: tErr } = await supabase
        .from("task_threads")
        .insert({
          task_id,
          company_id: task.company_id,
          created_by: user.id,
        })
        .select("id, thread_token, company_id")
        .single();
      if (tErr) return json({ error: "Failed to create thread: " + tErr.message }, 500);
      thread = newThread;
    }

    // ── Get author name ──
    const { data: authorData } = await supabase
      .from("user_accounts")
      .select("people(full_name)")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    const authorName = (authorData as any)?.people?.full_name || user.email || "MCS";

    // ── Build email ──
    const taskRef = task.internal_number || task_id.slice(0, 8);
    const subject = `[${taskRef}] ${task.title || "Oppgave"}`;
    const replyToAddress = `task-thread+${thread!.thread_token}@${DOMAIN}`;

    const schedule = formatJobSchedule(task.start_time, task.end_time);
    const startStr = task.start_time ? `${schedule.startDate} ${schedule.startTime}` : "";
    const endStr = task.end_time ? schedule.endTime : "";

    const bodyHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; padding: 20px;">
        <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
          <h3 style="margin: 0 0 8px 0; color: #1a1a1a;">${task.title || "Oppgave"}</h3>
          ${task.customer ? `<p style="margin: 4px 0; color: #555;"><strong>Kunde:</strong> ${task.customer}</p>` : ""}
          ${task.address ? `<p style="margin: 4px 0; color: #555;"><strong>Adresse:</strong> ${task.address}</p>` : ""}
          ${startStr ? `<p style="margin: 4px 0; color: #555;"><strong>Tid:</strong> ${startStr}${endStr ? ` – ${endStr}` : ""}</p>` : ""}
          ${taskRef ? `<p style="margin: 4px 0; color: #888; font-size: 12px;">Ref: ${taskRef}</p>` : ""}
        </div>
        <div style="white-space: pre-wrap; color: #1a1a1a; line-height: 1.6;">
${body_text}
        </div>
        <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
        <p style="color: #888; font-size: 12px;">
          Sendt fra MCS Ressurs av ${authorName}.<br/>
          Svar på denne e-posten for å legge svaret direkte i oppgavens tråd.
        </p>
      </div>`;

    // ── Get Graph token ──
    const tokenResult = await getGraphToken();
    if (tokenResult.error) return json({ error: "Graph token feil: " + tokenResult.error }, 500);

    // ── Find previous outbound message for In-Reply-To threading ──
    const { data: lastOutbound } = await supabase
      .from("task_messages")
      .select("external_message_id")
      .eq("thread_id", thread!.id)
      .eq("message_type", "external_email")
      .not("external_message_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // NOTE: Microsoft Graph internetMessageHeaders only allows headers starting with "x-" or "X-".
    // Standard RFC headers like In-Reply-To and References cannot be set via internetMessageHeaders.
    // Graph handles email threading internally via conversationId.
    const emailHeaders: Array<{ name: string; value: string }> = [
      { name: "X-MCS-Task-Thread-Token", value: thread!.thread_token },
      { name: "X-MCS-Entity", value: "task_thread" },
      { name: "X-MCS-ID", value: thread!.id },
    ];
    if (lastOutbound?.external_message_id) {
      emailHeaders.push({ name: "X-MCS-In-Reply-To", value: lastOutbound.external_message_id });
      emailHeaders.push({ name: "X-MCS-References", value: lastOutbound.external_message_id });
    }

    // ── Prepare attachments for Graph ──
    const graphAttachments: Array<{ "@odata.type": string; name: string; contentType: string; contentBytes: string }> = [];
    const linkFallbackAttachments: Array<{ file_name: string; file_path: string; file_size: number; mime_type: string; signed_url?: string }> = [];

    if (attachment_paths && attachment_paths.length > 0) {
      for (const att of attachment_paths) {
        try {
          const fileSize = att.file_size || 0;
          if (fileSize > MAX_ATTACHMENT_SIZE) {
            // Too large for inline — generate signed URL
            const signed = await generateSignedUrl(supabase, att.file_path);
            linkFallbackAttachments.push({
              file_name: att.file_name,
              file_path: att.file_path,
              file_size: fileSize,
              mime_type: att.mime_type || "application/octet-stream",
              signed_url: signed || undefined,
            });
            continue;
          }

          const { data: fileData, error: dlErr } = await supabase.storage
            .from("task-thread-files")
            .download(att.file_path);

          if (dlErr || !fileData) {
            console.error("ATTACHMENT_DOWNLOAD_FAILED", att.file_path, dlErr?.message);
            const signed = await generateSignedUrl(supabase, att.file_path);
            linkFallbackAttachments.push({
              file_name: att.file_name, file_path: att.file_path,
              file_size: fileSize, mime_type: att.mime_type || "application/octet-stream",
              signed_url: signed || undefined,
            });
            continue;
          }

          const arrayBuffer = await fileData.arrayBuffer();
          if (arrayBuffer.byteLength > MAX_ATTACHMENT_SIZE) {
            const signed = await generateSignedUrl(supabase, att.file_path);
            linkFallbackAttachments.push({
              file_name: att.file_name, file_path: att.file_path,
              file_size: arrayBuffer.byteLength, mime_type: att.mime_type || "application/octet-stream",
              signed_url: signed || undefined,
            });
            continue;
          }

          const base64 = btoa(
            new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
          );

          graphAttachments.push({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: att.file_name,
            contentType: att.mime_type || "application/octet-stream",
            contentBytes: base64,
          });
        } catch (attErr: any) {
          console.error("ATTACHMENT_PROCESS_ERROR", att.file_name, attErr?.message);
          const signed = await generateSignedUrl(supabase, att.file_path);
          linkFallbackAttachments.push({
            file_name: att.file_name, file_path: att.file_path,
            file_size: att.file_size || 0, mime_type: att.mime_type || "application/octet-stream",
            signed_url: signed || undefined,
          });
        }
      }
    }

    // ── Build attachment section for email HTML ──
    const appBaseUrl = "https://mcsressurs.lovable.app";
    const taskDate = task.start_time ? new Date(task.start_time).toISOString().slice(0, 10) : "";
    const deepLinkParams = new URLSearchParams({
      openTask: task_id,
      companyId: task.company_id,
      tab: "thread",
      ...(taskDate ? { date: taskDate } : {}),
    });
    const taskDeepLink = `${appBaseUrl}/projects/plan?${deepLinkParams.toString()}`;
    let finalBodyHtml = bodyHtml;

    const hasInline = graphAttachments.length > 0;
    const hasFallback = linkFallbackAttachments.length > 0;

    if (hasInline || hasFallback) {
      let attachmentHtml = `
        <div style="margin: 20px 0;">
          <table cellpadding="0" cellspacing="0" width="100%" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
            <tr>
              <td style="background: #f9fafb; padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
                <p style="margin: 0; font-weight: 600; color: #1a1a1a; font-size: 14px;">📎 Vedlegg</p>`;

      // Summary line
      const parts: string[] = [];
      if (hasInline) parts.push(`${graphAttachments.length} ${graphAttachments.length === 1 ? "fil vedlagt" : "filer vedlagt"} i e-posten`);
      if (hasFallback) parts.push(`${linkFallbackAttachments.length} ${linkFallbackAttachments.length === 1 ? "fil" : "filer"} tilgjengelig via sikre lenker`);
      attachmentHtml += `
                <p style="margin: 4px 0 0; color: #6b7280; font-size: 12px;">${parts.join(" · ")}</p>
              </td>
            </tr>`;

      // List inline attachments
      if (hasInline) {
        for (const att of graphAttachments) {
          attachmentHtml += `
            <tr>
              <td style="padding: 10px 16px; border-bottom: 1px solid #f3f4f6;">
                <table cellpadding="0" cellspacing="0" width="100%"><tr>
                  <td style="color: #374151; font-size: 13px;">
                    📄 ${escapeHtml(att.name)}
                  </td>
                  <td align="right" style="color: #9ca3af; font-size: 12px;">
                    Vedlagt i e-posten
                  </td>
                </tr></table>
              </td>
            </tr>`;
        }
      }

      // List fallback attachments with signed links
      if (hasFallback) {
        if (hasInline) {
          // Separator note
          attachmentHtml += `
            <tr>
              <td style="padding: 10px 16px; border-bottom: 1px solid #f3f4f6; background: #fffbeb;">
                <p style="margin: 0; color: #92400e; font-size: 12px;">
                  Noen vedlegg er for store til å sendes direkte på e-post, men kan åpnes trygt via lenkene nedenfor.
                </p>
              </td>
            </tr>`;
        }

        for (const att of linkFallbackAttachments) {
          const sizeStr = formatFileSize(att.file_size);
          const linkUrl = att.signed_url || taskDeepLink;
          const linkLabel = att.signed_url ? "Åpne" : "Åpne i MCS";
          attachmentHtml += `
            <tr>
              <td style="padding: 10px 16px; border-bottom: 1px solid #f3f4f6;">
                <table cellpadding="0" cellspacing="0" width="100%"><tr>
                  <td style="color: #374151; font-size: 13px;">
                    📎 ${escapeHtml(att.file_name)}
                    <span style="color: #9ca3af; font-size: 12px; margin-left: 6px;">(${sizeStr})</span>
                  </td>
                  <td align="right">
                    <a href="${linkUrl}" target="_blank" style="display: inline-block; background: #2563eb; color: #ffffff; font-size: 12px; font-weight: 600; padding: 5px 14px; border-radius: 6px; text-decoration: none;">${linkLabel}</a>
                  </td>
                </tr></table>
              </td>
            </tr>`;
        }
      }

      // Deep link to task
      attachmentHtml += `
            <tr>
              <td style="padding: 12px 16px; background: #f9fafb; text-align: center;">
                <a href="${taskDeepLink}" target="_blank" style="color: #2563eb; font-size: 13px; font-weight: 600; text-decoration: none;">Åpne oppgaven i MCS →</a>
              </td>
            </tr>
          </table>
        </div>`;

      // Insert before the footer hr
      finalBodyHtml = bodyHtml.replace(
        `<hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />`,
        attachmentHtml + `<hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />`
      );
    }

    // ── Send email via Graph ──
    const recipientEmails = recipients.map(r => r.email);
    const sendResult = await sendMailViaGraph(tokenResult.token!, {
      subject,
      bodyHtml: finalBodyHtml,
      recipients: recipientEmails,
      mailbox: MAILBOX,
      saveToSentItems: true,
      replyTo: replyToAddress,
      replyToName: `MCS Oppgave ${taskRef}`,
      headers: emailHeaders,
      attachments: graphAttachments.length > 0 ? graphAttachments : undefined,
    });

    if (sendResult.error) {
      console.error("TASK_THREAD_EMAIL_SEND_FAILED", sendResult);
      return json({ error: "E-post sending feilet: " + sendResult.error }, 500);
    }

    // ── Verify in sent items ──
    const verification = await verifySentItems(tokenResult.token!, MAILBOX, subject, recipientEmails);

    // ── Save outbound message ──
    const { data: msg, error: msgErr } = await supabase
      .from("task_messages")
      .insert({
        thread_id: thread!.id,
        task_id,
        company_id: task.company_id,
        message_type: "external_email",
        direction: "outbound",
        body: body_text,
        body_html: finalBodyHtml,
        subject,
        author_user_id: user.id,
        author_name: authorName,
        author_email: user.email,
        external_message_id: verification.internetMessageId || null,
        recipients: recipients.map(r => ({ name: r.name, email: r.email })),
        email_status: sendResult.error ? "failed" : "sent",
        reply_to_address: replyToAddress,
        reply_to_message_id: reply_to_message_id || null,
        priority: priority || "normal",
        metadata: {
          graph_request_id: sendResult.requestId,
          duration_ms: sendResult.durationMs,
          verified: verification.verified,
          attachments_inline: graphAttachments.length,
          attachments_fallback: linkFallbackAttachments.length,
        },
      })
      .select("id")
      .single();

    if (msgErr) {
      console.error("TASK_THREAD_EMAIL_MSG_INSERT_ERROR", msgErr);
      return json({ error: "E-post sendt, men lagring feilet" }, 500);
    }

    // ── Save attachment records ──
    if (attachment_paths && attachment_paths.length > 0) {
      for (const att of attachment_paths) {
        await supabase.from("task_message_attachments").insert({
          company_id: task.company_id,
          message_id: msg!.id,
          file_name: att.file_name,
          file_path: att.file_path,
          file_size: att.file_size || null,
          mime_type: att.mime_type || null,
          uploaded_by: user.id,
        });
      }
    }

    console.log("TASK_THREAD_EMAIL_SENT", {
      task_id,
      thread_id: thread!.id,
      message_id: msg!.id,
      recipients: recipientEmails,
      verified: verification.verified,
      attachments_inline: graphAttachments.length,
      attachments_fallback: linkFallbackAttachments.length,
    });

    return json({
      sent: true,
      message_id: msg!.id,
      recipients: recipientEmails,
      verified: verification.verified,
      attachments_inline: graphAttachments.length,
      attachments_fallback: linkFallbackAttachments.length,
    });
  } catch (err: any) {
    console.error("task-thread-email-send error:", err);
    return json({ error: err.message || "Internal error" }, 500);
  }
});

// ═══════════════════════════════════════════
// Graph API helpers (shared pattern)
// ═══════════════════════════════════════════

async function getGraphToken(): Promise<{ token?: string; error?: string }> {
  const tenantId = Deno.env.get("AZURE_TENANT_ID");
  const clientId = Deno.env.get("AZURE_CLIENT_ID");
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET");
  if (!tenantId || !clientId || !clientSecret) {
    return { error: "Missing Azure credentials" };
  }
  const resp = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials",
      }),
    }
  );
  const data = await resp.json();
  if (!data.access_token) {
    return { error: `Token failed (${resp.status}): ${data.error_description || data.error}` };
  }
  return { token: data.access_token };
}

interface SendMailOptions {
  subject: string;
  bodyHtml: string;
  recipients: string[];
  mailbox: string;
  saveToSentItems: boolean;
  replyTo?: string;
  replyToName?: string;
  headers?: Array<{ name: string; value: string }>;
  attachments?: Array<{ "@odata.type": string; name: string; contentType: string; contentBytes: string }>;
}

async function sendMailViaGraph(token: string, opts: SendMailOptions) {
  const start = Date.now();
  const endpoint = `https://graph.microsoft.com/v1.0/users/${opts.mailbox}/sendMail`;

  const messagePayload: any = {
    subject: opts.subject,
    body: { contentType: "HTML", content: opts.bodyHtml },
    toRecipients: opts.recipients.map(e => ({ emailAddress: { address: e } })),
  };

  if (opts.replyTo) {
    messagePayload.replyTo = [{ emailAddress: { address: opts.replyTo, name: opts.replyToName || opts.replyTo } }];
  }
  if (opts.headers?.length) {
    messagePayload.internetMessageHeaders = opts.headers;
  }
  if (opts.attachments?.length) {
    messagePayload.attachments = opts.attachments;
  }

  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: messagePayload, saveToSentItems: opts.saveToSentItems }),
    });
    const durationMs = Date.now() - start;
    const requestId = resp.headers.get("request-id") || undefined;

    if (resp.status === 202 || resp.ok) {
      return { durationMs, requestId };
    }

    const errBody = await resp.text();
    return { error: `Graph ${resp.status}: ${errBody}`, statusCode: resp.status, durationMs, requestId };
  } catch (e) {
    return { error: `Network: ${String(e)}`, durationMs: Date.now() - start };
  }
}

async function verifySentItems(token: string, mailbox: string, subject: string, recipients: string[]) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 2500));
    try {
      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const filter = `subject eq '${subject.replace(/'/g, "''")}' and sentDateTime ge ${twoMinAgo}`;
      const endpoint = `https://graph.microsoft.com/v1.0/users/${mailbox}/mailFolders/SentItems/messages?$filter=${encodeURIComponent(filter)}&$top=5&$select=id,subject,internetMessageId,webLink,sentDateTime`;
      const resp = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) { await resp.text(); continue; }
      const data = await resp.json();
      if (data?.value?.length > 0) {
        return { verified: true, internetMessageId: data.value[0].internetMessageId, webLink: data.value[0].webLink };
      }
    } catch { /* retry */ }
  }
  return { verified: false };
}

// ═══════════════════════════════════════════
// Attachment helpers
// ═══════════════════════════════════════════

async function generateSignedUrl(supabase: any, filePath: string): Promise<string | null> {
  try {
    const SEVEN_DAYS = 7 * 24 * 60 * 60; // seconds
    const { data, error } = await supabase.storage
      .from("task-thread-files")
      .createSignedUrl(filePath, SEVEN_DAYS);
    if (error || !data?.signedUrl) {
      console.error("SIGNED_URL_FAILED", filePath, error?.message);
      return null;
    }
    return data.signedUrl;
  } catch (e: any) {
    console.error("SIGNED_URL_ERROR", filePath, e?.message);
    return null;
  }
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return "ukjent størrelse";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
