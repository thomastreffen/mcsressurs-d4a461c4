import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { getApprovalCallerId } from "../_shared/approval-auth.ts";
import { planningInviteEmail } from "./email.ts";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const schema = z.object({ project_id: z.string().uuid(), name: z.string().trim().min(1).max(200), email: z.string().trim().email().max(254), company: z.string().trim().max(200), type: z.enum(["customer", "supplier"]) }).strict();
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Ugyldig metode" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !service) return json({ error: "Tjenesten er ikke konfigurert" }, 503);
    const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const userId = await getApprovalCallerId(req.headers.get("Authorization"), caller);
    if (!userId) return json({ error: "Logg inn på nytt" }, 401);
    const input = schema.safeParse(await req.json().catch(() => null));
    if (!input.success) return json({ error: "Kontroller navn, e-post, firma og type" }, 400);
    const p = input.data;
    const { data: allowed, error: accessError } = await caller.rpc("planning_external_manager", { _project_id: p.project_id });
    if (accessError || allowed !== true) return json({ error: "Ingen tilgang til å invitere på prosjektet" }, 403);
    // Existing Microsoft system-mailbox delivery; never accept client HTML, sender, URL or recipient overrides.
    const tenant = Deno.env.get("AZURE_TENANT_ID"), clientId = Deno.env.get("AZURE_CLIENT_ID"), secret = Deno.env.get("AZURE_CLIENT_SECRET");
    if (!tenant || !clientId || !secret) return json({ error: "Microsoft-utsending er ikke konfigurert" }, 503);
    const graphAuth = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: secret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }) });
    const graph = await graphAuth.json();
    if (!graphAuth.ok || !graph.access_token) return json({ error: "Microsoft kunne ikke autorisere utsendingen" }, 502);
    const { data: invite, error: inviteError } = await caller.rpc("planning_create_external_invite", { _project_id: p.project_id, _name: p.name, _email: p.email, _company: p.company, _type: p.type });
    if (inviteError || !invite) return json({ error: inviteError?.message || "Kunne ikke klargjøre invitasjonen" }, 400);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(invite.token));
    const inviteHash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
    const admin = createClient(url, service);
    const { data: account } = await admin.from("user_accounts").select("person_id").eq("auth_user_id", userId).maybeSingle();
    const person = account?.person_id ? await admin.from("people").select("full_name").eq("id", account.person_id).maybeSingle() : null;
    const email = planningInviteEmail({ name: invite.name, project: invite.project_name, inviter: person?.data?.full_name || "Prosjektansvarlig i MCS", type: invite.participant_type, token: invite.token, projectId: p.project_id });
    const { error: logError } = await admin.from("planning_activity").insert({ planning_project_id: p.project_id, action: "external_email_attempt", summary: `Invitasjon forsøkt sendt til ${invite.email}`, performed_by: userId, metadata: { participant_id: invite.id } });
    if (logError) {
      await admin.from("planning_external_participants").update({ status: "send_failed", invite_hash: null }).eq("id", invite.id).eq("status", "pending").eq("invite_hash", inviteHash);
      return json({ error: "Kunne ikke registrere utsending. Ingen e-post sendt." }, 500);
    }
    let accepted = false;
    try {
      const response = await fetch("https://graph.microsoft.com/v1.0/users/postkontoret@mcsservice.no/sendMail", { method: "POST", headers: { Authorization: `Bearer ${graph.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ message: { subject: email.subject, body: { contentType: "HTML", content: email.html }, toRecipients: [{ emailAddress: { address: invite.email } }] }, saveToSentItems: true }) });
      accepted = response.status === 202;
    } catch { /* An ambiguous network result is not retried automatically. */ }
    await admin.from("planning_external_participants").update(accepted ? { status: "sent" } : { status: "send_failed", invite_hash: null }).eq("id", invite.id).eq("status", "pending").eq("invite_hash", inviteHash);
    await admin.from("planning_activity").insert({ planning_project_id: p.project_id, action: accepted ? "external_email_sent" : "external_email_failed", summary: accepted ? `Microsoft aksepterte invitasjon til ${invite.email}` : "Invitasjonen kunne ikke bekreftes sendt; lenken er sperret", performed_by: userId, metadata: { participant_id: invite.id } });
    return accepted ? json({ ok: true }) : json({ error: "Sendingen kunne ikke bekreftes. Invitasjonslenken er sperret; inviter på nytt." }, 502);
  } catch { return json({ error: "Invitasjonen kunne ikke sendes" }, 500); }
});