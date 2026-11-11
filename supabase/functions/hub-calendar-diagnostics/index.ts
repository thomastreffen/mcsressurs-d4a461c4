// ADMIN-ONLY, READ-ONLY connection test for the dedicated central calendar app (HUB_CALENDAR_*).
// - Global superadmin only (user JWT; no service/cron bearer).
// - Inactive until all three HUB_CALENDAR_* secrets exist. No fallback to the mail app or user tokens.
// - Only fixed GET metadata probes (see _shared/hub-calendar-diagnostics-core.ts); never POST/PATCH/DELETE.
// - Response and audit contain only pass/fail, HTTP status, Graph error codes and app role names.
//   Never the token, secrets, calendar/mail ids or content.
// - Does NOT change job_outlook_app_sync_settings (enabled/dry_run/scope_verified_at stay untouched).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireGlobalAccessManager } from "../_shared/security-boundary.ts";
import {
  PROBES, REQUIRED_SECRETS, missingSecrets, tokenRoles, assessRoles, assessIdentity,
  explainTokenError, assessProbe, overallResult, assertReadOnlyProbe, TEST_MAILBOX,
  type DiagnosticCheck,
} from "../_shared/hub-calendar-diagnostics-core.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const COOLDOWN_MS = 30_000;

async function graphCode(res: Response): Promise<string | null> {
  try { const b = await res.json(); return typeof b?.error?.code === "string" ? b.error.code.slice(0, 80) : null; }
  catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: claims, error: cErr } = await userClient.auth.getClaims(auth.slice(7).trim());
  const callerId = claims?.claims?.sub as string | undefined;
  if (cErr || !callerId) return json({ error: "unauthorized" }, 401);
  if (!(await requireGlobalAccessManager(admin as never, callerId))) return json({ error: "forbidden" }, 403);

  let body: { action?: string } = {};
  try { body = await req.json(); } catch { /* empty body = status */ }
  const action = body.action ?? "status";
  if (action !== "status" && action !== "run") return json({ error: "invalid_action" }, 400);

  const env = (n: string) => Deno.env.get(n);
  const missing = missingSecrets(env);
  const secrets = Object.fromEntries(REQUIRED_SECRETS.map((n) => [n, !missing.includes(n)]));
  const { data: runs } = await admin.from("hub_calendar_diagnostic_runs")
    .select("run_at, overall, checks, app_roles").order("run_at", { ascending: false }).limit(5);
  const { data: settings } = await admin.from("job_outlook_app_sync_settings").select("enabled, dry_run").eq("id", true).maybeSingle();
  const status = {
    configured: missing.length === 0, secrets, test_mailbox: TEST_MAILBOX,
    central_sync: { enabled: !!settings?.enabled, dry_run: settings?.dry_run !== false },
    runs: runs ?? [],
  };
  if (action === "status") return json(status);

  if (missing.length) return json({ ...status, error: "not_configured" }, 409);
  const last = runs?.[0]?.run_at ? Date.parse(runs[0].run_at) : 0;
  if (Date.now() - last < COOLDOWN_MS) return json({ ...status, error: "cooldown" }, 429);

  const checks: DiagnosticCheck[] = [];
  let roles: string[] = [];
  const tenant = env("HUB_CALENDAR_TENANT_ID")!.trim();
  const clientId = env("HUB_CALENDAR_CLIENT_ID")!.trim();
  const tokRes = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: env("HUB_CALENDAR_CLIENT_SECRET")!.trim(), grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }),
  });
  let token: string | null = null;
  if (!tokRes.ok) {
    let aadsts: string | null = null;
    try { const t = await tokRes.json(); aadsts = Array.isArray(t?.error_codes) && t.error_codes[0] ? `AADSTS${t.error_codes[0]}` : null; } catch { /* ignore */ }
    checks.push(explainTokenError(tokRes.status, aadsts));
  } else {
    token = (await tokRes.json()).access_token ?? null;
    checks.push({ id: "token", label: "Innlogging for appen", expected: "Token mottatt", result: token ? "pass" : "fail", httpStatus: tokRes.status, explanation: token ? "Microsoft godtok app-identiteten." : "Tomt svar fra Microsoft." });
  }

  if (token) {
    const t = tokenRoles(token);
    roles = t.roles;
    checks.push(assessIdentity(clientId, env("AZURE_CLIENT_ID"), t.appId));
    checks.push(assessRoles(roles));
    for (const probe of PROBES) {
      assertReadOnlyProbe("GET", probe.path);
      const res = await fetch(`https://graph.microsoft.com${probe.path}`, { method: "GET", headers: { Authorization: `Bearer ${token}` } });
      const code = res.ok ? null : await graphCode(res);
      if (res.ok) await res.body?.cancel(); // never read calendar/mail content
      checks.push(assessProbe(probe, res.status, code));
    }
    token = null;
  }

  const overall = overallResult(checks);
  const run_at = new Date().toISOString();
  await admin.from("hub_calendar_diagnostic_runs").insert({ run_at, run_by: callerId, overall, checks, app_roles: roles });
  console.log(`[hub-calendar-diagnostics] run overall=${overall} checks=${checks.map((c) => `${c.id}:${c.result}`).join(",")}`);
  return json({ ...status, run: { run_at, overall, checks, app_roles: roles }, runs: [{ run_at, overall, checks, app_roles: roles }, ...(runs ?? [])].slice(0, 5) });
});
