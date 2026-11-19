// ADMIN-ONLY, READ-ONLY connection test for the dedicated Avtalevakt app (AVTALEVAKT_*).
// Fixed GET metadata probes only ($select=id, $top=1); message content is never read or returned.
// Never changes contract_watch_settings (enabled/scope_verified_at/mailboxes/consent stay untouched).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireGlobalAccessManager } from "../_shared/security-boundary.ts";
import { assessRoles, isSeparateIdentity, judgeProbe, missingSecrets, overall, OTHER_MAILBOX_PROBE, PILOT_MAILBOX, REQUIRED_SECRETS } from "../_shared/contract-watch-core.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const env = (n: string) => Deno.env.get(n);
  const url = env("SUPABASE_URL")!;
  const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY")!);
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const uc = createClient(url, env("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: claims } = await uc.auth.getClaims(auth.slice(7).trim());
  const callerId = claims?.claims?.sub as string | undefined;
  if (!callerId) return json({ error: "unauthorized" }, 401);
  if (!(await requireGlobalAccessManager(admin as never, callerId))) return json({ error: "forbidden" }, 403);

  let body: { action?: string } = {};
  try { body = await req.json(); } catch { /* status */ }
  const action = body.action ?? "status";
  if (action !== "status" && action !== "run") return json({ error: "invalid_action" }, 400);

  const missing = missingSecrets(env);
  const secrets = Object.fromEntries(REQUIRED_SECRETS.map((n) => [n, !missing.includes(n)]));
  const { data: settings } = await admin.from("contract_watch_settings").select("enabled, allowed_mailboxes, scope_verified_at, consent_at").eq("id", true).maybeSingle();
  const { data: runs } = await admin.from("contract_watch_diagnostic_runs").select("run_at, overall, checks, app_roles").order("run_at", { ascending: false }).limit(5);
  const base = { configured: missing.length === 0, secrets, pilot_mailbox: PILOT_MAILBOX, settings, runs: runs ?? [] };
  if (action === "status") return json(base);
  if (missing.length) return json({ ...base, error: "not_configured" }, 409);

  const checks: { id: string; label: string; result: "pass" | "fail" | "inconclusive"; httpStatus?: number; explanation: string }[] = [];
  const tok = await fetch(`https://login.microsoftonline.com/${env("AVTALEVAKT_TENANT_ID")}/oauth2/v2.0/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env("AVTALEVAKT_CLIENT_ID")!, client_secret: env("AVTALEVAKT_CLIENT_SECRET")!, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }) }).catch(() => null);
  let token: string | null = null; let roles: string[] = [];
  if (tok?.ok) { token = (await tok.json()).access_token; try { roles = JSON.parse(atob(token!.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).roles ?? []; } catch { roles = []; } }
  checks.push({ id: "token", label: "Appen får tilgang fra Microsoft", result: token ? "pass" : "fail", httpStatus: tok?.status, explanation: token ? "OK" : "Sjekk app-ID, hemmelighet og tenant" });
  const r = assessRoles(roles);
  checks.push({ id: "roles", label: "Ingen sending/skriving/kalender i appen", result: r.ok ? "pass" : "fail", explanation: !r.ok ? `Fjern Entra-tillatelser: ${r.extra.join(", ")}` : r.path === "exchange_rbac" ? "Ingen Entra-roller i token – forventet ved Exchange RBAC for Applications. Tilgang bevises bare av postkasseprøvene under." : "Klassisk Entra Mail.Read (gjelder hele organisasjonen uten Exchange-begrensning). Avgrensning bevises bare av postkasseprøvene under." });
  checks.push({ id: "identity", label: "Egen app, adskilt fra e-post- og kalenderappene", result: isSeparateIdentity(env("AVTALEVAKT_CLIENT_ID"), [env("AZURE_CLIENT_ID"), env("M365_SENDER_CLIENT_ID"), env("HUB_CALENDAR_CLIENT_ID")]) ? "pass" : "fail", explanation: "Avtalevakten skal ha sin egen identitet" });
  const probe = async (mb: string) => {
    if (!token) return null;
    const p = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mb)}/mailFolders/inbox/messages?$select=id&$top=1`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
    return p?.status ?? null;
  };
  const own = await probe(PILOT_MAILBOX); const other = await probe(OTHER_MAILBOX_PROBE);
  checks.push({ id: "own_mailbox", label: "Kan lese Thomas sin postkasse", result: judgeProbe(200, own), httpStatus: own ?? undefined, explanation: own === 200 ? "OK" : "Sjekk samtykke og Exchange-regel" });
  checks.push({ id: "other_mailbox", label: "Blokkert fra andre postkasser", result: judgeProbe(403, other), httpStatus: other ?? undefined, explanation: other === 403 ? "OK" : other === 200 ? "Appen kan lese andre postkasser – Exchange-begrensning mangler" : "Uavklart" });
  const res = overall(checks.map((c) => c.result));
  await admin.from("contract_watch_diagnostic_runs").insert({ run_by: callerId, overall: res, checks, app_roles: roles });
  await admin.from("contract_watch_audit").insert({ actor: callerId, action: "diagnostic_run", details: { overall: res } });
  return json({ ...base, runs: [{ run_at: new Date().toISOString(), overall: res, checks, app_roles: roles }, ...(runs ?? [])].slice(0, 5) });
});
