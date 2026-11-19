// Superadmin-only. diagnose = token request only (no Graph call). test_send = one message to the caller, gated.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { requireGlobalAccessManager } from "../_shared/security-boundary.ts";
import { tokenRoles } from "../_shared/hub-calendar-diagnostics-core.ts";
import { sendMail } from "../_shared/m365-sender.ts";
import { evaluateSender, testSendGate } from "../_shared/system-sender-diagnostics-core.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("diagnose") }).strict(),
  z.object({ action: z.literal("test_send"), confirm: z.string().max(100) }).strict(),
]);
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const env = (n: string) => Deno.env.get(n)?.trim() ?? "";
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const uc = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: claims, error } = await uc.auth.getClaims(auth.slice(7).trim());
  const caller = claims?.claims?.sub, callerEmail = typeof claims?.claims?.email === "string" ? claims.claims.email : null;
  if (error || typeof caller !== "string") return json({ error: "unauthorized" }, 401);
  if (!await requireGlobalAccessManager(admin as never, caller)) return json({ error: "forbidden" }, 403);
  let body: unknown; try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const p = Schema.safeParse(body); if (!p.success) return json({ error: "invalid_input" }, 400);
  try {
    const tenant = env("AZURE_TENANT_ID"), client = env("AZURE_CLIENT_ID"), secret = env("AZURE_CLIENT_SECRET");
    let token = null as null | { ok: boolean; http: number | null; tid: string | null; appId: string | null; roles: string[] };
    if (tenant && client && secret) {
      const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, { method: "POST", signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: client, client_secret: secret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && typeof d.access_token === "string") {
        const f = tokenRoles(d.access_token);
        let tid: string | null = null; try { tid = JSON.parse(atob(d.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).tid ?? null; } catch { /* unknown */ }
        token = { ok: true, http: r.status, tid, appId: f.appId, roles: f.roles };
      } else token = { ok: false, http: r.status, tid: null, appId: null, roles: [] };
    }
    const pilot = env("M365_PILOT_RECIPIENTS").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    const result = evaluateSender({ secrets: { tenant: !!tenant, client: !!client, secret: !!secret }, calendarClientId: env("HUB_CALENDAR_CLIENT_ID") || null, mode: env("SYSTEM_SENDER_MODE"), scopeVerified: env("M365_MAILBOX_SCOPE_VERIFIED"), rbacAttestation: env("M365_RBAC_ATTESTATION"), pilotRecipients: pilot, token, tenantId: tenant || null, mailClientId: client || null });
    // Roles are permission names only; no IDs, secrets or tokens are returned.
    if (p.data.action === "diagnose") return json({ ...result, roles: token?.roles ?? [], read_only: true });
    const denied = testSendGate(result.ready_for_test, p.data.confirm, callerEmail, pilot);
    if (denied) return json({ error: denied, checks: result.checks }, 409);
    const claim = await admin.from("system_sender_test_runs").insert({ actor: caller, recipient: callerEmail }).select("id").single();
    if (claim.error) return json({ error: "test_already_in_progress" }, 409);
    const sent = await sendMail({ to: callerEmail!, subject: "MCS Hub – testmelding fra postkontoret", html: "<p>Dette er én testmelding fra MCS Hub sin systemavsender. Ingen handling kreves.</p>", replyTo: null }, { personalToken: null, useSystem: true });
    const outcome = sent.ok ? "accepted" : sent.status === null || (sent.status ?? 0) >= 500 ? "uncertain" : "failed";
    await admin.from("system_sender_test_runs").update({ outcome, http_status: sent.status, finished_at: new Date().toISOString() }).eq("id", claim.data.id);
    return json({ outcome, http: sent.status, note: "accepted = Microsoft har tatt imot (202), ikke bekreftet levert." });
  } catch {
    return json({ error: "stopped_no_retry" }, 409);
  }
});
