import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { getApprovalCallerId } from "../_shared/approval-auth.ts";
import { planningAccessEmail } from "./email.ts";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const schema = z.union([
  z.object({ participant_id: z.string().uuid(), project_id: z.string().uuid() }).strict(),
  z.object({ email: z.string().trim().email().max(254) }).strict(),
]);
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Ugyldig metode" }, 405);
  let linkId: string | undefined;
  let admin: ReturnType<typeof createClient> | undefined;
  let internal = false;
  try {
    const input = schema.safeParse(await req.json().catch(() => null));
    if (!input.success) return json({ error: "Kontroller e-postadressen" }, 400);
    const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const tenant = Deno.env.get("AZURE_TENANT_ID"), clientId = Deno.env.get("AZURE_CLIENT_ID"), secret = Deno.env.get("AZURE_CLIENT_SECRET");
    if (!url || !anon || !service || !tenant || !clientId || !secret) return json({ error: "Utsending er ikke tilgjengelig akkurat nå" }, 503);
    admin = createClient(url, service);
    let userId: string | null = null;
    const p = input.data;
    internal = "participant_id" in p;
    if ("participant_id" in p) {
      const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
      userId = await getApprovalCallerId(req.headers.get("Authorization"), caller);
      if (!userId) return json({ error: "Logg inn på nytt" }, 401);
      const { data: allowed } = await caller.rpc("planning_external_manager", { _project_id: p.project_id });
      const { data: participant } = await admin.from("planning_external_participants").select("planning_project_id").eq("id", p.participant_id).maybeSingle();
      if (allowed !== true || participant?.planning_project_id !== p.project_id) return json({ error: "Ingen tilgang" }, 403);
    }
    const { data: link, error } = await admin.rpc("planning_external_prepare_login", "participant_id" in p ? { _participant_id: p.participant_id } : { _email: p.email });
    if (error) throw new Error("Login preparation failed");
    if (!link) return internal ? json({ error: "Vent litt før du sender på nytt, eller kontroller at tilgangen fortsatt er aktiv." }, 429) : json({ ok: true });
    linkId = link.link_id;
    const { error: audit } = await admin.from("planning_activity").insert({ planning_project_id: link.project_id, action: "external_access_email_attempt", summary: `Tilgangslenke forsøkt sendt til ${link.email}`, performed_by: userId, metadata: { participant_id: link.id } });
    if (audit) throw new Error("Audit failed");
    const auth = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: secret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }) });
    const graph = await auth.json();
    if (!auth.ok || !graph.access_token) throw new Error("Mail authorization failed");
    const mail = planningAccessEmail({ name: link.name, project: link.project_name, type: link.participant_type, token: link.token });
    const sent = await fetch("https://graph.microsoft.com/v1.0/users/postkontoret@mcsservice.no/sendMail", { method: "POST", headers: { Authorization: `Bearer ${graph.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ message: { subject: mail.subject, body: { contentType: "HTML", content: mail.html }, toRecipients: [{ emailAddress: { address: link.email } }] }, saveToSentItems: true }) });
    if (sent.status !== 202) throw new Error("Mail not accepted");
    await admin.from("planning_activity").insert({ planning_project_id: link.project_id, action: "external_access_email_sent", summary: `Microsoft aksepterte tilgangslenke til ${link.email}`, performed_by: userId, metadata: { participant_id: link.id } });
    return json({ ok: true });
  } catch {
    if (admin && linkId) await admin.from("planning_external_login_links").update({ used_at: new Date().toISOString() }).eq("id", linkId);
    // Never disclose whether a public email address has project access. Never retry sends.
    return internal ? json({ error: "Sendingen kunne ikke bekreftes. Prøv igjen senere." }, 502) : json({ ok: true });
  }
});