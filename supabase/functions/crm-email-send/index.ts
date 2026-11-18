// CRM email from the signed-in user's OWN Microsoft account. Never falls back to postkontoret.
// Off unless CRM_EMAIL_SEND_ENABLED=true; preview is always read-only.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { buildMessage, classifySend, resolveRecipients, sendEnabled, validateContent } from "../_shared/crm-email-core.ts";

const env = (k: string) => Deno.env.get(k);
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const Body = z.object({
  action: z.enum(["preview", "send"]),
  company_id: z.string().uuid(), customer_id: z.string().uuid(),
  account_id: z.string().uuid().nullable().optional(), lead_id: z.string().uuid().nullable().optional(),
  contact_ids: z.array(z.string().uuid()).max(20), manual_emails: z.array(z.string()).max(20).default([]),
  manual_confirmed: z.boolean().default(false), subject: z.string().max(250), body: z.string().max(20000),
  request_id: z.string().uuid(), confirmed: z.boolean().default(false),
});

async function delegatedToken(admin: any, userId: string): Promise<{ token: string | null; email: string | null }> {
  const { data } = await admin.auth.admin.getUserById(userId);
  const u = data?.user; const meta = u?.user_metadata || {};
  const email = (meta.ms_email || u?.email || null) as string | null;
  if (meta.ms_access_token && meta.ms_expires_at && new Date(meta.ms_expires_at).getTime() > Date.now() + 5 * 60_000) return { token: meta.ms_access_token, email };
  if (!meta.ms_refresh_token) return { token: null, email };
  const r = await fetch(`https://login.microsoftonline.com/${env("AZURE_TENANT_ID")}/oauth2/v2.0/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env("AZURE_CLIENT_ID")!, client_secret: env("AZURE_CLIENT_SECRET")!, grant_type: "refresh_token", refresh_token: meta.ms_refresh_token,
      scope: "https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Calendars.ReadWrite https://graph.microsoft.com/User.Read offline_access" }) });
  if (!r.ok) return { token: null, email };
  const t = await r.json();
  await admin.auth.admin.updateUserById(userId, { user_metadata: { ...meta, ms_access_token: t.access_token, ms_refresh_token: t.refresh_token || meta.ms_refresh_token, ms_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString() } });
  return { token: t.access_token, email };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const uc = createClient(env("SUPABASE_URL")!, env("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: claims } = await uc.auth.getClaims(auth.slice(7).trim());
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) return json({ error: "unauthorized" }, 401);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "invalid_input" }, 400);
  const b = parsed.data;

  // Caller-bearer: enforces customers.edit in the company and resolves only active contacts of this customer.
  const { data: ctx, error: ctxErr } = await uc.rpc("crm_email_prepare", { _company_id: b.company_id, _customer_id: b.customer_id, _account_id: b.account_id ?? null, _lead_id: b.lead_id ?? null, _contact_ids: b.contact_ids });
  if (ctxErr || !ctx) return json({ error: "not_available" }, 403);
  const rec = resolveRecipients({ contacts: ctx.contacts, requestedContactIds: b.contact_ids, manual: b.manual_emails, manualConfirmed: b.manual_confirmed });
  if (!rec.ok) return json({ error: rec.code }, 400);
  const contentErr = validateContent(b.subject, b.body);
  if (contentErr) return json({ error: contentErr }, 400);

  const admin = createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!);
  const { token, email: senderEmail } = await delegatedToken(admin, userId);
  const replyDomain = env("CRM_REPLY_DOMAIN") || "mcsservice.no";
  const preview = { sender: senderEmail, sender_connected: !!token, reply_to: `thread+…@${replyDomain}`, to: rec.to, manual: rec.manual,
    customer_name: ctx.customer_name, account_name: ctx.account_name, reuses_thread: !!ctx.existing_thread_id, send_enabled: sendEnabled(env) };
  if (b.action === "preview") return json({ preview });

  if (!b.confirmed) return json({ error: "not_confirmed" }, 400);
  if (!sendEnabled(env)) return json({ error: "send_disabled", preview }, 409);
  if (!token) return json({ error: "no_ms_connection", preview }, 409); // never fall back to postkontoret

  // One-shot claim: a repeated click/request never sends twice.
  const { error: claimErr } = await admin.from("crm_email_sends").insert({ id: b.request_id, company_id: b.company_id, customer_id: b.customer_id,
    customer_account_id: b.account_id ?? null, lead_id: b.lead_id ?? null, sender_user_id: userId, sender_email: senderEmail,
    to_emails: rec.to, manual_emails: rec.manual, subject: b.subject });
  if (claimErr) {
    const { data: prev } = await admin.from("crm_email_sends").select("status,sender_user_id").eq("id", b.request_id).maybeSingle();
    if (prev?.sender_user_id !== userId) return json({ error: "not_available" }, 403);
    return json({ status: prev?.status ?? "uncertain", replay: true });
  }

  let threadId = ctx.existing_thread_id as string | null; let inboundToken: string;
  if (threadId) {
    const { data: t } = await admin.from("conversation_threads").select("inbound_token").eq("id", threadId).single();
    inboundToken = t?.inbound_token || crypto.randomUUID();
    if (!t?.inbound_token) await admin.from("conversation_threads").update({ inbound_token: inboundToken }).eq("id", threadId);
  } else {
    inboundToken = crypto.randomUUID();
    const title = [ctx.customer_name, ctx.account_name].filter(Boolean).join(" – ");
    const { data: t, error } = await admin.from("conversation_threads").insert({ company_id: b.company_id, title, thread_type: "email_thread", created_by: userId,
      email_enabled: true, email_subject: b.subject, inbound_token: inboundToken, customer_id: b.customer_id, customer_account_id: b.account_id ?? null, lead_id: b.lead_id ?? null }).select("id").single();
    if (error || !t) { await admin.from("crm_email_sends").update({ status: "failed", error_code: "thread_create_failed", finished_at: new Date().toISOString() }).eq("id", b.request_id); return json({ status: "failed", error: "thread_create_failed" }, 500); }
    threadId = t.id;
  }
  await admin.from("crm_email_sends").update({ thread_id: threadId }).eq("id", b.request_id);

  const message = buildMessage({ subject: b.subject, body: b.body, to: rec.to, inboundToken, threadId: threadId!, replyDomain, senderName: senderEmail || "MCS" });
  // Draft first to obtain internetMessageId for reply threading, then send that exact draft once.
  let status: number | null = null; let internetMessageId: string | null = null; let errorCode: string | null = null;
  try {
    const d = await fetch("https://graph.microsoft.com/v1.0/me/messages", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(message) });
    if (!d.ok) { status = d.status; errorCode = `draft_${d.status}`; }
    else {
      const draft = await d.json(); internetMessageId = draft.internetMessageId ?? null;
      const s = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(draft.id)}/send`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      status = s.status; if (s.status !== 202) errorCode = `send_${s.status}`;
    }
  } catch { status = null; errorCode = "network_unknown"; }
  const outcome = errorCode?.startsWith("draft_") ? "failed" : classifySend(status);
  const now = new Date().toISOString();
  await admin.from("crm_email_sends").update({ status: outcome, graph_status: status, error_code: errorCode, internet_message_id: internetMessageId, finished_at: now }).eq("id", b.request_id);
  if (outcome !== "failed") {
    const { data: post } = await admin.from("conversation_posts").insert({ thread_id: threadId, company_id: b.company_id, author_id: null, post_type: "email", direction: "outbound",
      subject: b.subject, body_text: b.body, from_email: senderEmail, to_emails: rec.to, sent_at: now }).select("id").maybeSingle();
    await admin.from("conversation_email_messages").insert({ company_id: b.company_id, thread_id: threadId, post_id: post?.id ?? null, direction: "outbound", provider: "graph_delegated",
      outlook_internet_message_id: internetMessageId, subject: b.subject, from_email: senderEmail, to_emails: rec.to, status: outcome === "accepted" ? "sent" : "uncertain", verified: false });
    await admin.from("conversation_threads").update({ last_emailed_at: now, last_activity_at: now }).eq("id", threadId);
  }
  return json({ status: outcome, error: errorCode });
});
