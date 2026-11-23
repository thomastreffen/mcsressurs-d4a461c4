// ADMIN-ONLY, READ-ONLY connection test for the dedicated Avtalevakt app (AVTALEVAKT_*).
// Fixed GET metadata probes only ($select=id, $top=1); message content is never read or returned.
// Never changes contract_watch_settings (enabled/scope_verified_at/mailboxes/consent stay untouched).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireGlobalAccessManager } from "../_shared/security-boundary.ts";
import { assessRoles, assessTokenIdentity, judgeNegativeProbe, isSeparateIdentity, judgeProbe, missingSecrets, overall, OTHER_MAILBOX_PROBE, PILOT_MAILBOX, REQUIRED_SECRETS } from "../_shared/contract-watch-core.ts";

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
  let token: string | null = null; let roles: string[] = []; let claims: { tid?: string; appid?: string; azp?: string; roles?: string[] } | null = null;
  if (tok?.ok) { token = (await tok.json()).access_token; try { claims = JSON.parse(atob(token!.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); roles = claims?.roles ?? []; } catch { claims = null; roles = []; } }
  checks.push({ id: "token", label: "Appen får tilgang fra Microsoft", result: token ? "pass" : "fail", httpStatus: tok?.status, explanation: token ? "OK" : "Sjekk app-ID, hemmelighet og tenant" });
  const ti = assessTokenIdentity(claims, env("AVTALEVAKT_TENANT_ID"), env("AVTALEVAKT_CLIENT_ID"));
  checks.push({ id: "token_identity", label: "Token gjelder riktig tenant og Avtalevakt-app", result: !token ? "inconclusive" : ti.ok ? "pass" : "fail", explanation: ti.ok ? "OK" : ti.reason === "tenant_mismatch" ? "Feil tenant i token" : ti.reason === "app_mismatch" ? "Token er utstedt til en annen app" : "Kunne ikke lese token" });
  const r = assessRoles(roles);
  checks.push({ id: "roles", label: "Ingen brede Graph-e-post/kalendertillatelser i Entra", result: !token ? "inconclusive" : r.ok ? "pass" : "fail", explanation: r.ok ? "Ingen Entra-roller for e-post/kalender – riktig for Exchange RBAC for Applications. Tilgang bevises bare av postkasseprøvene." : `Fjern Entra-tillatelser (gjelder hele organisasjonen og overstyrer Exchange-avgrensningen): ${r.extra.join(", ")}` });
  checks.push({ id: "identity", label: "Egen app, adskilt fra e-post- og kalenderappene", result: isSeparateIdentity(env("AVTALEVAKT_CLIENT_ID"), [env("AZURE_CLIENT_ID"), env("M365_SENDER_CLIENT_ID"), env("HUB_CALENDAR_CLIENT_ID")]) ? "pass" : "fail", explanation: "Avtalevakten skal ha sin egen identitet" });
  // Folder-level metadata GET only: never lists or returns messages. Error body is parsed for its code and discarded.
  const probe = async (mb: string): Promise<{ status: number | null; code: string | null }> => {
    if (!token) return { status: null, code: null };
    const p = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mb)}/mailFolders/inbox?$select=id`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
    if (!p) return { status: null, code: null };
    let code: string | null = null;
    try { const j = await p.json(); code = p.ok ? null : (j?.error?.code ?? null); } catch { /* ignore */ }
    return { status: p.status, code };
  };
  const own = await probe(PILOT_MAILBOX); const other = await probe(OTHER_MAILBOX_PROBE);
  checks.push({ id: "own_mailbox", label: "Når Thomas sin postkasse (kun mappeinfo)", result: judgeProbe(200, own.status), httpStatus: own.status ?? undefined, explanation: own.status === 200 ? "OK" : `Sjekk Exchange RBAC-tildelingen${own.code ? ` (${own.code})` : ""}` });
  const neg = judgeNegativeProbe(other.status, other.code);
  checks.push({ id: "other_mailbox", label: "Avvist fra annen postkasse", result: neg, httpStatus: other.status ?? undefined, explanation: neg === "pass" ? `OK (${other.code})` : other.status === 200 ? "Appen når andre postkasser – avgrensningen virker ikke" : `Uavklart${other.code ? ` (${other.code})` : ""}` });
  const res = overall(checks.map((c) => c.result));
  await admin.from("contract_watch_diagnostic_runs").insert({ run_by: callerId, overall: res, checks, app_roles: roles });
  await admin.from("contract_watch_audit").insert({ actor: callerId, action: "diagnostic_run", details: { overall: res, auth_path: "exchange_rbac" } });
  return json({ ...base, runs: [{ run_at: new Date().toISOString(), overall: res, checks, app_roles: roles }, ...(runs ?? [])].slice(0, 5) });
});
