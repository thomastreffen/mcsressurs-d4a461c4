import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════
// Task Thread Inbound Matching (inline)
// Matches inbound emails to task threads via:
// 1. X-MCS-Task-Thread-Token header
// 2. task-thread+{token}@domain in reply-to/to
// 3. In-Reply-To/References → task_messages.external_message_id
// ═══════════════════════════════════════════

const TASK_THREAD_PATTERN = /task-thread\+([a-zA-Z0-9-]+)@/i;

// ═══════════════════════════════════════════
// Order Message Inbound Matching
// Matches inbound emails to order messages via:
// 1. X-MCS-Order-Msg-Token header
// 2. order-msg+{token}@domain in reply-to/to
// ═══════════════════════════════════════════

const ORDER_MSG_PATTERN = /order-msg\+([a-zA-Z0-9-]+)@/i;

// Common reply separators for quote stripping
const REPLY_SEPARATORS = [
  /^-{2,}\s*Original Message\s*-{2,}/im,
  /^_{2,}/m,
  /^On .+ wrote:$/im,
  /^Den .+ skrev .+:$/im,
  /^Fra:\s/im,
  /^From:\s/im,
  /^Sendt:\s/im,
  /^Sent:\s/im,
  /^>+\s/m,
  /^--\s*$/m,
  /Vennlig hilsen/im,
  /Med vennlig hilsen/im,
  /Best regards/im,
  /Kind regards/im,
  /^\s*Get Outlook for/im,
  /^\s*Sendt fra min/im,
  /^\s*Sent from my/im,
];

function stripEmailQuotes(body: string): string {
  let text = body;
  // Try each separator, take content before the first match
  for (const sep of REPLY_SEPARATORS) {
    const match = text.match(sep);
    if (match && match.index !== undefined && match.index > 10) {
      text = text.substring(0, match.index);
      break;
    }
  }
  return text.trim();
}

interface OrderMsgMatchResult {
  matched: boolean;
  participant_id?: string;
  submission_id?: string;
  company_id?: string;
  user_id?: string;
  inbound_token?: string;
  match_strategy?: string;
}

async function tryMatchOrderMessage(message: any, supabase: any): Promise<OrderMsgMatchResult> {
  // Strategy 1: X-MCS-Order-Msg-Token header
  for (const h of message.internetMessageHeaders || []) {
    if (h.name === "X-MCS-Order-Msg-Token" && h.value) {
      const token = h.value.trim();
      console.log("ORDER_MSG_STRATEGY_1_XHEADER", { token });
      const { data } = await supabase
        .from("order_form_participants")
        .select("id, submission_id, user_id, inbound_token, participant_type")
        .eq("inbound_token", token)
        .eq("participant_type", "internal_user")
        .maybeSingle();
      if (data) {
        const { data: sub } = await supabase
          .from("order_form_submissions")
          .select("company_id")
          .eq("id", data.submission_id)
          .single();
        console.log("ORDER_MSG_MATCH_FOUND", { strategy: "x-header", participant_id: data.id, submission_id: data.submission_id });
        return { matched: true, participant_id: data.id, submission_id: data.submission_id, company_id: sub?.company_id, user_id: data.user_id, inbound_token: data.inbound_token, match_strategy: "x-header" };
      }
    }
  }

  // Strategy 2: order-msg+{token} in addresses
  const replyTo = message.replyTo?.[0]?.emailAddress?.address || "";
  const toAddrs = (message.toRecipients || []).map((r: any) => r.emailAddress?.address || "");
  const ccAddrs = (message.ccRecipients || []).map((r: any) => r.emailAddress?.address || "");
  const allAddrs = [replyTo, ...toAddrs, ...ccAddrs].join(" ");

  const tokenMatch = allAddrs.match(ORDER_MSG_PATTERN);
  if (tokenMatch) {
    const token = tokenMatch[1].trim();
    console.log("ORDER_MSG_TOKEN_EXTRACTED", { token });
    const { data } = await supabase
      .from("order_form_participants")
      .select("id, submission_id, user_id, inbound_token, participant_type")
      .eq("inbound_token", token)
      .eq("participant_type", "internal_user")
      .maybeSingle();
    if (data) {
      const { data: sub } = await supabase
        .from("order_form_submissions")
        .select("company_id")
        .eq("id", data.submission_id)
        .single();
      console.log("ORDER_MSG_MATCH_FOUND", { strategy: "reply-to-token", participant_id: data.id, submission_id: data.submission_id });
      return { matched: true, participant_id: data.id, submission_id: data.submission_id, company_id: sub?.company_id, user_id: data.user_id, inbound_token: data.inbound_token, match_strategy: "reply-to-token" };
    }
  }

  return { matched: false };
}

async function processOrderMessageInbound(
  message: any, match: OrderMsgMatchResult, supabase: any,
): Promise<{ message_id: string }> {
  const senderEmail = message.from?.emailAddress?.address?.toLowerCase() || "";
  const senderName = message.from?.emailAddress?.name || senderEmail;

  console.log("ORDER_MSG_INBOUND_START", {
    submission_id: match.submission_id,
    participant_id: match.participant_id,
    sender: senderEmail,
    subject: message.subject,
  });

  // Validate sender is the participant or has matching email
  const { data: participant } = await supabase
    .from("order_form_participants")
    .select("id, user_id, email, name, can_reply, role_label")
    .eq("id", match.participant_id)
    .single();

  if (!participant) {
    throw new Error("Participant not found");
  }

  if (!participant.can_reply) {
    console.warn("ORDER_MSG_REPLY_DENIED", { participant_id: participant.id, reason: "can_reply=false" });
    throw new Error("Participant cannot reply");
  }

  // Validate email matches participant or their user account
  let emailValid = false;
  if (participant.email && participant.email.toLowerCase() === senderEmail) {
    emailValid = true;
  }
  if (!emailValid && participant.user_id) {
    const { data: ua } = await supabase
      .from("user_accounts")
      .select("people:people!user_accounts_person_id_fkey(email)")
      .eq("auth_user_id", participant.user_id)
      .eq("is_active", true)
      .maybeSingle();
    const person = Array.isArray((ua as any)?.people) ? (ua as any).people[0] : (ua as any)?.people;
    if (person?.email?.toLowerCase() === senderEmail) {
      emailValid = true;
    }
  }

  if (!emailValid) {
    console.error("ORDER_MSG_SENDER_MISMATCH", { expected_user_id: participant.user_id, actual_email: senderEmail });
    throw new Error("Sender email does not match participant");
  }

  // Idempotency check
  if (message.internetMessageId) {
    const { data: existing } = await supabase
      .from("order_form_messages")
      .select("id")
      .eq("source", "email")
      .eq("body", message.internetMessageId)
      .maybeSingle();
    // Use a metadata approach instead - check if we already processed this internet message id
    // We'll store internet_message_id in the message for dedup
  }

  // Extract clean reply body
  const rawBody = message.bodyPreview || message.body?.content || "";
  const cleanBody = stripEmailQuotes(rawBody);

  if (!cleanBody || cleanBody.length < 2) {
    console.warn("ORDER_MSG_EMPTY_BODY", { submission_id: match.submission_id });
    throw new Error("Empty reply body after quote stripping");
  }

  // Insert as order_form_message
  const { data: msg, error: insertErr } = await supabase
    .from("order_form_messages")
    .insert({
      submission_id: match.submission_id,
      sender_type: "admin",
      sender_user_id: participant.user_id,
      sender_name: participant.name || senderName,
      sender_participant_id: participant.id,
      message_type: "message",
      body: cleanBody,
      is_visible_to_customer: false,
      requires_reply: false,
      visibility: "internal",
      source: "email",
    })
    .select("id")
    .single();

  if (insertErr) {
    console.error("ORDER_MSG_INSERT_ERROR", { error: insertErr.message });
    throw new Error("Failed to insert order message: " + insertErr.message);
  }

  // Update submission last_activity_at
  await supabase
    .from("order_form_submissions")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", match.submission_id);

  console.log("ORDER_MSG_INBOUND_COMPLETE", {
    message_id: msg!.id,
    submission_id: match.submission_id,
    participant: participant.name,
    body_length: cleanBody.length,
    match_strategy: match.match_strategy,
  });

  return { message_id: msg!.id };
}

interface TaskThreadMatchResult {
  matched: boolean;
  thread_id?: string;
  task_id?: string;
  company_id?: string;
  thread_token?: string;
  match_strategy?: string;
}

async function tryMatchTaskThread(message: any, supabase: any): Promise<TaskThreadMatchResult> {
  const replyTo = message.replyTo?.[0]?.emailAddress?.address || "";
  const toAddrs = (message.toRecipients || []).map((r: any) => r.emailAddress?.address || "");
  const ccAddrs = (message.ccRecipients || []).map((r: any) => r.emailAddress?.address || "");

  console.log("TASK_THREAD_MATCH_START", {
    subject: message.subject,
    from: message.from?.emailAddress?.address,
    replyTo,
    toRecipients: toAddrs,
    ccRecipients: ccAddrs,
    internetMessageId: message.internetMessageId,
    hasHeaders: (message.internetMessageHeaders || []).length,
  });

  // Strategy 1: X-MCS-Task-Thread-Token header
  for (const h of message.internetMessageHeaders || []) {
    if (h.name === "X-MCS-Task-Thread-Token" && h.value) {
      const token = h.value.trim();
      console.log("TASK_THREAD_STRATEGY_1_XHEADER", { token });
      const { data, error } = await supabase
        .from("task_threads").select("id, task_id, company_id, thread_token")
        .eq("thread_token", token).maybeSingle();
      if (error) console.error("TASK_THREAD_STRATEGY_1_DB_ERROR", error);
      if (data) {
        console.log("TASK_THREAD_MATCH_FOUND", { strategy: "x-header", thread_id: data.id, task_id: data.task_id });
        return { matched: true, thread_id: data.id, task_id: data.task_id, company_id: data.company_id, thread_token: data.thread_token, match_strategy: "x-header" };
      }
      console.warn("TASK_THREAD_STRATEGY_1_NO_MATCH", { token });
    }
  }

  // Strategy 2: task-thread+{token} in addresses
  const allAddrs = [replyTo, ...toAddrs, ...ccAddrs].join(" ");
  console.log("TASK_THREAD_STRATEGY_2_ADDRESSES", { allAddrs });
  const tokenMatch = allAddrs.match(TASK_THREAD_PATTERN);
  if (tokenMatch) {
    const token = tokenMatch[1].trim();
    console.log("TASK_THREAD_TOKEN_EXTRACTED", { token, fullMatch: tokenMatch[0], source: "addresses" });
    const { data, error } = await supabase
      .from("task_threads").select("id, task_id, company_id, thread_token")
      .eq("thread_token", token).maybeSingle();
    if (error) console.error("TASK_THREAD_STRATEGY_2_DB_ERROR", error);
    if (data) {
      console.log("TASK_THREAD_MATCH_FOUND", { strategy: "reply-to-token", thread_id: data.id, task_id: data.task_id, company_id: data.company_id });
      return { matched: true, thread_id: data.id, task_id: data.task_id, company_id: data.company_id, thread_token: data.thread_token, match_strategy: "reply-to-token" };
    }
    console.warn("NO_THREAD_MATCH_FOR_TOKEN", { token });
  } else {
    console.log("TASK_THREAD_NO_TOKEN_IN_ADDRESSES", { pattern: TASK_THREAD_PATTERN.source });
  }

  // Strategy 3: In-Reply-To/References → task_messages
  for (const h of message.internetMessageHeaders || []) {
    if ((h.name === "In-Reply-To" || h.name === "References") && h.value) {
      console.log("TASK_THREAD_STRATEGY_3_HEADER", { header: h.name, value: h.value.substring(0, 200) });
      const msgIds = h.value.match(/<[^>]+>/g) || [h.value];
      for (const msgId of msgIds) {
        const cleanId = msgId.replace(/[<>]/g, "").trim();
        if (!cleanId) continue;
        const { data: existing } = await supabase
          .from("task_messages").select("thread_id, task_id, company_id")
          .eq("external_message_id", cleanId).limit(1).maybeSingle();
        if (existing) {
          const { data: thread } = await supabase
            .from("task_threads").select("thread_token")
            .eq("id", existing.thread_id).maybeSingle();
          console.log("TASK_THREAD_MATCH_FOUND", { strategy: "in-reply-to", thread_id: existing.thread_id, task_id: existing.task_id, msgId: cleanId });
          return { matched: true, thread_id: existing.thread_id, task_id: existing.task_id, company_id: existing.company_id, thread_token: thread?.thread_token, match_strategy: "in-reply-to" };
        }
      }
      console.log("TASK_THREAD_STRATEGY_3_NO_MATCH", { checkedIds: msgIds.length });
    }
  }

  console.warn("TASK_THREAD_NO_MATCH_ANY_STRATEGY", { subject: message.subject, from: message.from?.emailAddress?.address });
  return { matched: false };
}

async function processTaskThreadInbound(
  message: any, match: TaskThreadMatchResult, supabase: any,
  graphToken: string, resourceUrl: string,
): Promise<{ message_id: string }> {
  const senderEmail = message.from?.emailAddress?.address?.toLowerCase() || "";
  const senderName = message.from?.emailAddress?.name || senderEmail;

  console.log("INBOUND_MESSAGE_PARSE_START", {
    thread_id: match.thread_id,
    task_id: match.task_id,
    company_id: match.company_id,
    author_email: senderEmail,
    author_name: senderName,
    subject: message.subject,
    hasBody: !!(message.bodyPreview || message.body?.content),
    hasAttachments: message.hasAttachments,
    internetMessageId: message.internetMessageId,
  });

  // Extract In-Reply-To and References from headers
  let inReplyTo: string | null = null;
  let references: string[] | null = null;
  for (const h of message.internetMessageHeaders || []) {
    if (h.name === "In-Reply-To") inReplyTo = h.value;
    if (h.name === "References") {
      const refs = h.value.match(/<[^>]+>/g);
      references = refs ? refs.map((m: string) => m.replace(/[<>]/g, "")) : null;
    }
  }

  // Idempotency check on task_messages
  if (message.internetMessageId) {
    const { data: existingMsg } = await supabase
      .from("task_messages")
      .select("id")
      .eq("external_message_id", message.internetMessageId)
      .maybeSingle();
    if (existingMsg) {
      console.log("TASK_MESSAGE_ALREADY_EXISTS", { existing_id: existingMsg.id, internetMessageId: message.internetMessageId });
      return { message_id: existingMsg.id };
    }
  }

  console.log("TASK_MESSAGE_CREATE_START", {
    thread_id: match.thread_id,
    message_type: "external_email",
    direction: "inbound",
  });

  const { data: msg, error: msgErr } = await supabase
    .from("task_messages").insert({
      thread_id: match.thread_id,
      task_id: match.task_id,
      company_id: match.company_id,
      message_type: "external_email",
      direction: "inbound",
      body: message.bodyPreview || "",
      body_html: message.body?.content || "",
      subject: message.subject || null,
      author_name: senderName,
      author_email: senderEmail,
      external_message_id: message.internetMessageId || null,
      external_in_reply_to: inReplyTo,
      external_references: references,
      email_status: "received",
      inbound_received_at: new Date().toISOString(),
      recipients: (message.toRecipients || []).map((r: any) => ({
        name: r.emailAddress?.name, email: r.emailAddress?.address,
      })),
      metadata: {
        match_strategy: match.match_strategy,
        outlook_message_id: message.id,
        conversation_id: message.conversationId,
      },
    }).select("id").single();

  if (msgErr) {
    console.error("TASK_MESSAGE_CREATE_ERROR", {
      error: msgErr.message,
      code: msgErr.code,
      details: msgErr.details,
      thread_id: match.thread_id,
      task_id: match.task_id,
    });
    throw new Error("Failed to insert task thread inbound: " + msgErr.message);
  }

  console.log("TASK_MESSAGE_CREATE_SUCCESS", {
    message_id: msg!.id,
    thread_id: match.thread_id,
    task_id: match.task_id,
  });

  // Handle attachments (both regular and inline)
  let attachmentsSaved = 0;
  let attachmentsFailed = 0;
  if (message.hasAttachments) {
    console.log("ATTACHMENT_SAVE_START", { resourceUrl });
    try {
      const attResp = await fetch(
        `https://graph.microsoft.com/v1.0/${resourceUrl}/attachments?$expand=microsoft.graph.itemAttachment/item`,
        { headers: { Authorization: `Bearer ${graphToken}` } },
      );
      if (attResp.ok) {
        const attData = await attResp.json();
        const allAtts = attData.value || [];
        console.log("ATTACHMENT_LIST_FETCHED", {
          count: allAtts.length,
          types: allAtts.map((a: any) => ({ name: a.name, type: a["@odata.type"], size: a.size, isInline: a.isInline, contentId: a.contentId })),
        });

        for (const att of allAtts) {
          if (att["@odata.type"] !== "#microsoft.graph.fileAttachment") {
            console.log("ATTACHMENT_SKIP_NON_FILE", { name: att.name, type: att["@odata.type"] });
            continue;
          }
          if (!att.contentBytes) {
            console.warn("ATTACHMENT_SKIP_NO_CONTENT", { name: att.name });
            continue;
          }

          try {
            const bytes = Uint8Array.from(atob(att.contentBytes), c => c.charCodeAt(0));
            const safeName = (att.name || "attachment").replace(/[^a-zA-Z0-9._-]/g, "_");
            const filePath = `${match.company_id}/${match.task_id}/${msg!.id}/${Date.now()}_${safeName}`;

            console.log("ATTACHMENT_UPLOAD_START", {
              name: att.name,
              mime: att.contentType,
              size: bytes.length,
              isInline: att.isInline || false,
              contentId: att.contentId || null,
              path: filePath,
            });

            const { error: upErr } = await supabase.storage
              .from("task-thread-files")
              .upload(filePath, bytes, { contentType: att.contentType || "application/octet-stream" });

            if (upErr) {
              console.error("ATTACHMENT_UPLOAD_ERROR", { name: att.name, error: upErr.message });
              attachmentsFailed++;
              continue;
            }

            const { data: attRow, error: attInsertErr } = await supabase.from("task_message_attachments").insert({
              company_id: match.company_id,
              message_id: msg!.id,
              file_name: att.name || "attachment",
              file_path: filePath,
              file_size: att.size || bytes.length,
              mime_type: att.contentType || null,
            }).select("id").single();

            if (attInsertErr) {
              console.error("ATTACHMENT_INSERT_ERROR", { name: att.name, error: attInsertErr.message });
              attachmentsFailed++;
            } else {
              console.log("ATTACHMENT_SAVE_SUCCESS", { id: attRow?.id, name: att.name, isInline: att.isInline || false });
              attachmentsSaved++;
            }
          } catch (singleAttErr) {
            console.error("ATTACHMENT_SINGLE_ERROR", { name: att.name, error: String(singleAttErr) });
            attachmentsFailed++;
          }
        }
      } else {
        const errText = await attResp.text();
        console.error("ATTACHMENT_FETCH_ERROR", { status: attResp.status, error: errText.substring(0, 500) });
      }
    } catch (attErr) {
      console.error("ATTACHMENT_PIPELINE_ERROR", { error: String(attErr) });
    }
  }

  // Update thread last_message_at
  await supabase.from("task_threads")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", match.thread_id);

  console.log("INBOUND_PIPELINE_COMPLETE", {
    status: attachmentsFailed > 0 ? "partial" : "success",
    message_id: msg!.id,
    thread_id: match.thread_id,
    task_id: match.task_id,
    sender: senderEmail,
    match_strategy: match.match_strategy,
    attachments_saved: attachmentsSaved,
    attachments_failed: attachmentsFailed,
  });

  return { message_id: msg!.id };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function getGraphToken() {
  const tenantId = Deno.env.get("AZURE_TENANT_ID");
  const clientId = Deno.env.get("AZURE_CLIENT_ID");
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET");
  if (!tenantId || !clientId || !clientSecret) return null;
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
  const d = await resp.json();
  return d.access_token || null;
}

/** Core processing logic shared with reprocess function */
async function processMessage(
  message: any,
  supabase: any,
  companyIdHint: string | null,
) {
  const internetMessageId = message.internetMessageId;

  // Idempotency
  if (internetMessageId) {
    const { data: existing } = await supabase
      .from("conversation_email_messages")
      .select("id")
      .eq("outlook_internet_message_id", internetMessageId)
      .maybeSingle();
    if (existing) return { skipped: true, reason: "duplicate" };
  }

  // ── Find thread ──
  let threadId: string | null = null;
  let thread: any = null;

  // Strategy 1: X-MCS-THREAD extended property
  for (const prop of message.singleValueExtendedProperties || []) {
    if (prop.id?.includes("X-MCS-THREAD") && prop.value) {
      const { data } = await supabase.from("conversation_threads").select("*").eq("id", prop.value).single();
      if (data) { thread = data; threadId = data.id; }
      break;
    }
  }

  // Strategy 1b: X-MCS-Thread-Token internet header
  if (!threadId) {
    for (const h of message.internetMessageHeaders || []) {
      if (h.name === "X-MCS-Thread-Token" && h.value) {
        const { data } = await supabase.from("conversation_threads").select("*").eq("inbound_token", h.value).maybeSingle();
        if (data) { thread = data; threadId = data.id; }
        break;
      }
    }
  }

  // Strategy 2: Reply-To / To token
  if (!threadId) {
    const replyTo = message.replyTo?.[0]?.emailAddress?.address || "";
    const toAddrs = (message.toRecipients || []).map((r: any) => r.emailAddress?.address || "");
    const all = [replyTo, ...toAddrs].join(" ");
    const m = all.match(/thread\+([a-f0-9-]+)@/i);
    if (m) {
      const { data } = await supabase.from("conversation_threads").select("*")
        .or(`inbound_token.eq.${m[1]},id.eq.${m[1]}`).maybeSingle();
      if (data) { thread = data; threadId = data.id; }
    }
  }

  // Strategy 3: conversationId → thread
  if (!threadId && message.conversationId) {
    const { data } = await supabase.from("conversation_threads").select("*")
      .eq("email_thread_id", message.conversationId).maybeSingle();
    if (data) { thread = data; threadId = data.id; }
  }

  // Strategy 4: conversationId → email_messages
  if (!threadId && message.conversationId) {
    const { data: em } = await supabase.from("conversation_email_messages").select("thread_id")
      .eq("outlook_conversation_id", message.conversationId).limit(1).maybeSingle();
    if (em) {
      threadId = em.thread_id;
      const { data } = await supabase.from("conversation_threads").select("*").eq("id", threadId).single();
      thread = data;
    }
  }

  // Strategy 5: Subject [JOB-XXXXXX] fallback
  if (!threadId && message.subject) {
    const sm = message.subject.match(/\[JOB-(\d+)\]/);
    if (sm) {
      const { data: proj } = await supabase.from("events").select("id").eq("internal_number", `JOB-${sm[1]}`).maybeSingle();
      if (proj) {
        const { data: t } = await supabase.from("conversation_threads").select("*")
          .eq("project_id", proj.id).eq("email_enabled", true)
          .order("last_activity_at", { ascending: false }).limit(1).maybeSingle();
        if (t) { thread = t; threadId = t.id; }
      }
    }
  }

  if (!threadId || !thread) {
    // Log as ignored - use try/catch instead of .catch()
    try {
      await supabase.from("conversation_email_messages").insert({
        company_id: companyIdHint || "00000000-0000-0000-0000-000000000000",
        thread_id: "00000000-0000-0000-0000-000000000000",
        direction: "inbound", provider: "graph",
        outlook_message_id: message.id,
        outlook_conversation_id: message.conversationId || null,
        outlook_internet_message_id: internetMessageId || null,
        subject: message.subject,
        from_email: message.from?.emailAddress?.address,
        to_emails: (message.toRecipients || []).map((r: any) => r.emailAddress?.address),
        status: "ignored", error: "No matching thread found",
        processing_status: "ignored",
      });
    } catch (_ignoreErr) {
      console.error("Failed to log ignored message:", _ignoreErr);
    }
    throw new Error("No matching thread found");
  }

  const senderEmail = message.from?.emailAddress?.address?.toLowerCase();
  const senderName = message.from?.emailAddress?.name || senderEmail;

  // Reopen closed thread
  if (thread.status === "closed") {
    await supabase.from("conversation_threads")
      .update({ status: "open", closed_at: null, closed_by: null }).eq("id", threadId);
    await supabase.from("conversation_posts").insert({
      thread_id: threadId, company_id: thread.company_id,
      post_type: "system",
      body_text: `Tråden ble gjenåpnet av innkommende e-post fra ${senderName}`,
    });
  }

  // Create post
  const { data: post } = await supabase.from("conversation_posts").insert({
    thread_id: threadId, company_id: thread.company_id,
    post_type: "email", subject: message.subject,
    body_html: message.body?.content || "",
    body_text: message.bodyPreview || "",
    from_email: senderEmail, from_name: senderName,
    to_emails: (message.toRecipients || []).map((r: any) => r.emailAddress?.address),
    cc_emails: (message.ccRecipients || []).map((r: any) => r.emailAddress?.address),
    sent_at: message.receivedDateTime || new Date().toISOString(),
    direction: "inbound",
    outlook_message_id: message.id,
    outlook_weblink: message.webLink || null,
  }).select("id").single();

  return { threadId, thread, post, senderEmail, internetMessageId, message };
}

// Basic Graph notifications use a stored subscription secret, not a Hub login.
Deno.serve(async (req) => {
  // Graph validation handshake
  const url = new URL(req.url);
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken) {
    return new Response(validationToken, { headers: { "Content-Type": "text/plain" } });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const webhookReceivedAt = new Date();

  try {
    const body = await req.json();
    const notifications = body.value || [];

    console.log("WEBHOOK_RECEIVED", {
      notification_count: notifications.length,
      timestamp: webhookReceivedAt.toISOString(),
      subscriptionIds: notifications.map((n: any) => n.subscriptionId),
      resources: notifications.map((n: any) => n.resource),
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let processed = 0;

    for (const notification of notifications) {
      const notifStart = Date.now();
      let companyId: string | null = null;

      try {
        // ── Validate subscription + clientState ──
        const clientState = notification.clientState;
        if (typeof clientState !== "string" || !clientState || typeof notification.subscriptionId !== "string") {
          console.warn("Rejected inbound notification: missing subscription credentials");
          continue;
        }
        {
          const { data: subRecord } = await supabase
            .from("ms_graph_subscriptions")
            .select("id, company_id")
            .eq("subscription_id", notification.subscriptionId || "")
            .eq("client_state", clientState)
            .eq("status", "active")
            .maybeSingle();

          if (!subRecord?.company_id) {
            console.warn("ClientState mismatch or unknown subscription:", notification.subscriptionId);
            continue;
          }
          companyId = subRecord.company_id;
        }

        const resourceUrl = notification.resource;
        if (typeof resourceUrl !== "string" || !/^users\/[^/?#]+\/messages\/[^/?#]+$/i.test(resourceUrl)) continue;

        // Acquire privileged Graph credentials only after validating this callback.
        const accessToken = await getGraphToken();
        if (!accessToken) throw new Error("Missing Azure credentials for inbound webhook");

        // Fetch message from Graph (request headers for matching)
        console.log("INBOUND_MESSAGE_FETCH_START", { resource: resourceUrl });
        const msgResp = await fetch(
          `https://graph.microsoft.com/v1.0/${resourceUrl}?$expand=singleValueExtendedProperties($filter=id eq 'String {00020386-0000-0000-C000-000000000046} Name X-MCS-THREAD')&$select=id,subject,body,bodyPreview,from,toRecipients,ccRecipients,replyTo,internetMessageId,conversationId,internetMessageHeaders,hasAttachments,receivedDateTime,webLink,singleValueExtendedProperties`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        if (!msgResp.ok) {
          const errText = await msgResp.text();
          console.error("INBOUND_MESSAGE_FETCH_ERROR", { status: msgResp.status, error: errText.slice(0, 500) });
          try {
            await supabase.from("conversation_email_dead_letters").insert({
              company_id: companyId,
              subscription_id: notification.subscriptionId,
              raw_payload: notification,
              error: `Graph fetch failed: ${msgResp.status} ${errText.slice(0, 500)}`,
              status: "pending",
            });
          } catch (_dlErr) {
            console.error("Failed to write dead letter:", _dlErr);
          }
          continue;
        }

        const message = await msgResp.json();

        console.log("INBOUND_MESSAGE_FETCH_SUCCESS", {
          id: message.id,
          subject: message.subject,
          from: message.from?.emailAddress?.address,
          toRecipients: (message.toRecipients || []).map((r: any) => r.emailAddress?.address),
          ccRecipients: (message.ccRecipients || []).map((r: any) => r.emailAddress?.address),
          replyTo: (message.replyTo || []).map((r: any) => r.emailAddress?.address),
          internetMessageId: message.internetMessageId,
          conversationId: message.conversationId,
          hasAttachments: message.hasAttachments,
          receivedDateTime: message.receivedDateTime,
          headerCount: (message.internetMessageHeaders || []).length,
        });

        // Check idempotency before heavy processing
        if (message.internetMessageId) {
          const { data: dup } = await supabase
            .from("conversation_email_messages")
            .select("id").eq("outlook_internet_message_id", message.internetMessageId).maybeSingle();
          if (dup) {
            console.log(`Already processed in conversation: ${message.internetMessageId}`);
            continue;
          }
          const { data: dlDup } = await supabase
            .from("conversation_email_dead_letters")
            .select("id").eq("internet_message_id", message.internetMessageId).maybeSingle();
          if (dlDup) {
            console.log(`Already in dead letters: ${message.internetMessageId}`);
            continue;
          }
          // Also check task_messages idempotency
          const { data: taskDup } = await supabase
            .from("task_messages")
            .select("id").eq("external_message_id", message.internetMessageId).maybeSingle();
          if (taskDup) {
            console.log(`Already processed in task_messages: ${message.internetMessageId}`);
            continue;
          }
        }

        // ── Try order message matching first ──
        try {
          const orderMsgMatch = await tryMatchOrderMessage(message, supabase);
          if (orderMsgMatch.matched) {
            console.log("ORDER_MSG_INBOUND_MATCH", {
              submission_id: orderMsgMatch.submission_id,
              participant_id: orderMsgMatch.participant_id,
              strategy: orderMsgMatch.match_strategy,
              sender: message.from?.emailAddress?.address,
            });
            const result = await processOrderMessageInbound(message, orderMsgMatch, supabase);
            console.log("ORDER_MSG_INBOUND_DONE", { message_id: result.message_id });
            processed++;
            continue;
          }
        } catch (orderErr) {
          console.error("ORDER_MSG_INBOUND_ERROR", { error: String(orderErr), stack: (orderErr as any)?.stack?.substring(0, 500) });
          // Fall through to task thread / conversation matching
        }

        // ── Try task thread matching ──
        let isTaskThread = false;
        try {
          const taskThreadMatch = await tryMatchTaskThread(message, supabase);
          if (taskThreadMatch.matched) {
            console.log("TASK_THREAD_INBOUND_MATCH", {
              thread_id: taskThreadMatch.thread_id,
              task_id: taskThreadMatch.task_id,
              company_id: taskThreadMatch.company_id,
              strategy: taskThreadMatch.match_strategy,
              sender: message.from?.emailAddress?.address,
            });
            const result = await processTaskThreadInbound(
              message,
              taskThreadMatch,
              supabase,
              accessToken,
              resourceUrl,
            );
            console.log("TASK_THREAD_INBOUND_DONE", { message_id: result.message_id });
            isTaskThread = true;
            processed++;
            continue; // Skip conversation thread processing
          }
        } catch (taskErr) {
          console.error("TASK_THREAD_INBOUND_ERROR", { error: String(taskErr), stack: (taskErr as any)?.stack?.substring(0, 500) });
          // Fall through to conversation matching
        }

        // ── Process as conversation message ──
        const result = await processMessage(message, supabase, companyId);

        if (result.skipped) {
          continue;
        }

        const { threadId, thread, post } = result;

        // Handle attachments
        if (message.hasAttachments && post) {
          try {
            const attResp = await fetch(
              `https://graph.microsoft.com/v1.0/${resourceUrl}/attachments`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (attResp.ok) {
              const attData = await attResp.json();
              for (const att of attData.value || []) {
                if (att["@odata.type"] === "#microsoft.graph.fileAttachment" && att.contentBytes) {
                  const bytes = Uint8Array.from(atob(att.contentBytes), c => c.charCodeAt(0));
                  const filePath = `${thread.company_id}/${thread.project_id}/${threadId}/${Date.now()}_${att.name}`;
                  const { error: upErr } = await supabase.storage
                    .from("conversation-files")
                    .upload(filePath, bytes, { contentType: att.contentType });
                  if (!upErr) {
                    await supabase.from("conversation_attachments").insert({
                      post_id: post.id, file_name: att.name,
                      file_size: att.size || bytes.length,
                      mime_type: att.contentType || null, storage_path: filePath,
                    });
                  }
                }
              }
            } else {
              await attResp.text();
            }
          } catch (attErr) {
            console.error("Attachment processing error:", attErr);
          }
        }

        const processingMs = Date.now() - notifStart;

        // Log email message with observability
        await supabase.from("conversation_email_messages").insert({
          company_id: thread.company_id, thread_id: threadId,
          post_id: post?.id || null, direction: "inbound", provider: "graph",
          outlook_message_id: message.id,
          outlook_conversation_id: message.conversationId || null,
          outlook_internet_message_id: message.internetMessageId || null,
          subject: message.subject,
          from_email: message.from?.emailAddress?.address,
          to_emails: (message.toRecipients || []).map((r: any) => r.emailAddress?.address),
          cc_emails: (message.ccRecipients || []).map((r: any) => r.emailAddress?.address),
          status: "received",
          processing_status: "ok",
          webhook_received_at: webhookReceivedAt.toISOString(),
          processed_at: new Date().toISOString(),
          processing_duration_ms: processingMs,
        });

        processed++;
      } catch (notifErr: any) {
        console.error("Error processing notification:", notifErr);

        // ── Dead letter ──
        const rawPayload = {
          ...notification,
          _fetched_message_id: notification.resource,
        };
        try {
          await supabase.from("conversation_email_dead_letters").insert({
            company_id: companyId,
            subscription_id: notification.subscriptionId || null,
            raw_payload: rawPayload,
            graph_message_id: notification.resource || null,
            error: String(notifErr),
            status: "pending",
          });
        } catch (dlErr) {
          console.error("Failed to write dead letter:", dlErr);
        }
      }
    }

    // Always return 200 to Graph to prevent retry storms
    return new Response(
      JSON.stringify({ processed, total: notifications.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Inbound webhook error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

export { processMessage };
