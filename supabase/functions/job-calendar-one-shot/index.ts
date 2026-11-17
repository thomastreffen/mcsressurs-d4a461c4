// Operator-click-only create exception. Never called by scheduler/queue or other functions.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { requireGlobalAccessManager } from "../_shared/security-boundary.ts";
import { tokenRoles } from "../_shared/hub-calendar-diagnostics-core.ts";
import { diagnosticGate } from "../_shared/hub-calendar-write-pilot-core.ts";
import { ONE_SHOT, oneShotGate, oneShotPayload, assertOneShotRequest, inspectMailbox, createOneShot, type OneShotContext, type OneShotGraph } from "../_shared/job-calendar-one-shot.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status") }).strict(),
  z.object({ action: z.literal("preflight") }).strict(),
  z.object({ action: z.literal("create"), run_id: z.string().uuid(), payload_hash: z.string().regex(/^[a-f0-9]{64}$/), confirm: z.literal(ONE_SHOT.phrase), pending_busy_confirmed: z.literal(true) }).strict(),
  z.object({ action: z.literal("reconcile"), run_id: z.string().uuid() }).strict(),
]);
const check = <T>(r: { data: T; error: unknown }): T => { if (r.error) throw new Error("authoritative_read_failed"); return r.data; };
const hash = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map(b => b.toString(16).padStart(2, "0")).join("");

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const env = (n: string) => Deno.env.get(n)?.trim() ?? "";
  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const uc = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: claims, error: authError } = await uc.auth.getClaims(auth.slice(7).trim());
  const caller = claims?.claims?.sub;
  if (authError || typeof caller !== "string") return json({ error: "unauthorized" }, 401);
  if (!await requireGlobalAccessManager(admin as never, caller)) return json({ error: "forbidden" }, 403);
  const permission = await uc.rpc("has_company_access", { _uid: caller, _company: ONE_SHOT.company_id, _module: "resource_plan", _level: "edit" });
  // Parameter names match the live function; fail closed, never a superadmin bypass.
  if (permission.error || permission.data !== true) return json({ error: "company_edit_required" }, 403);
  let input: unknown;
  try { input = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return json({ error: "invalid_input" }, 400);
  const b = parsed.data, x = ONE_SHOT;
  const publicRun = (r: any) => ({ id: r.id, state: r.state, consumed_at: r.consumed_at, expires_at: r.expires_at, http_status: r.http_status, event_id_persisted: !!r.graph_event_id });
  try {
    const history = check(await admin.from("job_calendar_one_shot_runs").select("id,state,consumed_at,expires_at,http_status,graph_event_id").order("created_at", { ascending: false }).limit(15));
    if (b.action === "status") return json({ scope: { event_id: x.event_id, technician_id: x.technician_id, mailbox: x.mailbox, work_date: x.work_date }, runs: history.map(publicRun), consumed: history.some(r => !!r.consumed_at) });
    const run = b.action === "create" || b.action === "reconcile" ? check(await admin.from("job_calendar_one_shot_runs").select("*").eq("id", b.run_id).maybeSingle()) : null;
    if (b.action !== "preflight" && !run) return json({ error: "run_not_found" }, 404);
    if (b.action === "create" && (run?.actor !== caller || run.payload_hash !== b.payload_hash || run.state !== "prepared" || Date.parse(run.expires_at) <= Date.now() || run.consumed_at)) return json({ error: "preflight_expired_or_consumed" }, 409);
    if (b.action === "preflight" && history.some(r => !!r.consumed_at)) return json({ error: "permit_already_consumed", runs: history.map(publicRun) }, 409);
    if (b.action === "reconcile" && (!run?.consumed_at || run.state === "succeeded")) return json({ error: "no_uncertain_run" }, 409);
    const job = check(await uc.from("events").select("*").eq("id", x.event_id).eq("company_id", x.company_id).maybeSingle());
    if (!job) return json({ error: "job_not_visible" }, 403);
    const target = check(await admin.from("job_outlook_app_pilot_targets").select("*").eq("event_id", x.event_id).eq("technician_id", x.technician_id).eq("work_date", x.work_date).eq("company_id", x.company_id).is("revoked_at", null).maybeSingle());
    if (!target) return json({ error: "active_pilot_required" }, 409);
    const tech = check(await admin.from("technicians").select("id,user_id,email,deleted_at,archived_at").eq("id", x.technician_id).single());
    const account = check(await admin.from("user_accounts").select("person_id,is_active").eq("auth_user_id", tech.user_id ?? "").eq("is_active", true).maybeSingle());
    const person = account ? check(await admin.from("people").select("is_active").eq("id", account.person_id).maybeSingle()) : null;
    const employed = account ? check(await admin.from("employment_profiles").select("id").eq("person_id", account.person_id).eq("company_id", x.company_id).eq("relationship_type", "employee").is("archived_at", null).limit(1)) : [];
    const assignment = check(await admin.from("event_technicians").select("id,calendar_event_id").eq("event_id", x.event_id).eq("technician_id", x.technician_id).maybeSingle());
    const approval = check(await admin.from("job_approvals").select("status,outlook_event_id").eq("job_id", x.event_id).eq("technician_user_id", tech.user_id ?? "").order("created_at", { ascending: false }).limit(1).maybeSingle());
    const blocks = check(await admin.from("schedule_blocks").select("company_id,technician_id,start_at,end_at").eq("project_id", x.event_id).eq("technician_id", x.technician_id).eq("source", "manual").is("deleted_at", null));
    const probe = check(await admin.from("job_outlook_app_pilot_actions").select("created_at,result").eq("target_id", target.id).eq("action", "probe_mailbox").order("created_at", { ascending: false }).limit(1).maybeSingle());
    const settings = check(await admin.from("job_outlook_app_sync_settings").select("enabled,dry_run,pilot_mailboxes,scope_verified_at").eq("id", true).single());
    const signature = check(await admin.rpc("assignment_schedule_signature", { _event: x.event_id, _user: tech.user_id }));
    const c: OneShotContext = { job: { ...job, start_at: job.start_time, end_at: job.end_time }, target, assigned: !!assignment, identityActive: !!account && !!person?.is_active && employed.length > 0 && !tech.archived_at && !tech.deleted_at, mailbox: tech.email?.trim().toLowerCase() ?? "", approval: approval?.status ?? "unknown", blocks, probe: probe as any, settings };
    const denied = oneShotGate(c, new Date());
    if (denied) return json({ error: denied }, 409);
    const payload = oneShotPayload(c.job);
    const digest = await hash(JSON.stringify(payload));
    if (b.action === "create" && (digest !== run?.payload_hash || signature !== run.schedule_signature || JSON.stringify(job) !== JSON.stringify(run.job_snapshot))) return json({ error: "preview_changed" }, 409);
    const diag = check(await admin.from("hub_calendar_diagnostic_runs").select("run_at,overall,checks").order("run_at", { ascending: false }).limit(1).maybeSingle());
    const diagDenied = diagnosticGate(diag as any, new Date());
    if (diagDenied) return json({ error: diagDenied }, 409);
    const tenant = env("HUB_CALENDAR_TENANT_ID"), client = env("HUB_CALENDAR_CLIENT_ID"), secret = env("HUB_CALENDAR_CLIENT_SECRET"), mailClient = env("AZURE_CLIENT_ID");
    if (!tenant || !client || !secret || !mailClient || client === mailClient) return json({ error: "calendar_identity_unverified" }, 409);
    const tokenRes = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, { method: "POST", signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: client, client_secret: secret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }) });
    const tokenText = await tokenRes.text();
    if (!tokenRes.ok) return json({ error: "calendar_token_failed", http: tokenRes.status }, 409);
    const token = JSON.parse(tokenText)?.access_token;
    if (typeof token !== "string") return json({ error: "calendar_token_failed" }, 409);
    const facts = tokenRoles(token);
    const decoded = JSON.parse(atob((token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/")));
    if (decoded.tid !== tenant || facts.appId !== client || !facts.roles.includes("Calendars.ReadWrite") || facts.roles.some(r => !["Calendars.Read", "Calendars.ReadWrite"].includes(r))) return json({ error: "calendar_identity_unverified" }, 409);
    const graph: OneShotGraph = async (method, path, body) => {
      assertOneShotRequest(method, path);
      const res = await fetch(`https://graph.microsoft.com${path}`, { method, signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: 'outlook.timezone="UTC", IdType="ImmutableId"', "client-request-id": x.key }, body: body ? JSON.stringify(body) : undefined });
      const text = await res.text();
      let data = null; try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON is held */ }
      return { status: res.status, data };
    };
    if (b.action === "reconcile") {
      const seen = await inspectMailbox(graph);
      if (!seen.own) {
        check(await admin.from("job_calendar_one_shot_audit").insert({ run_id: run.id, actor: caller, action: "reconcile", state: "unresolved" }));
        return json({ state: "unresolved_no_repost" });
      }
      const saved = check(await admin.rpc("finish_job_calendar_one_shot", { _run: run.id, _actor: caller, _state: "succeeded", _event_id: seen.own.id, _http: 200, _change_key: seen.own.changeKey ?? null, _reconcile: true }));
      if (!saved) throw new Error("receipt_not_persisted");
      return json({ state: "succeeded", event_id_persisted: true, reconciled: true });
    }
    const appLinks = check(await admin.from("job_outlook_app_links").select("id,work_date").eq("event_id", x.event_id).eq("technician_id", x.technician_id));
    const dayLinks = check(await admin.from("job_calendar_day_links").select("id").eq("event_id", x.event_id).eq("technician_id", x.technician_id).eq("work_date", x.work_date));
    const legacy = check(await admin.from("job_calendar_links").select("id").eq("job_id", x.event_id).eq("technician_id", x.technician_id).not("calendar_event_id", "is", null));
    const organizer = check(await admin.from("m365_organizer_links").select("event_id").eq("event_id", x.event_id).eq("technician_id", x.technician_id).not("graph_event_id", "is", null));
    if (appLinks.some(l => l.work_date === x.work_date || !l.work_date) || dayLinks.length || legacy.length || organizer.length || assignment?.calendar_event_id || approval?.outlook_event_id) return json({ error: "existing_mapping_requires_reconciliation" }, 409);
    if (b.action === "preflight") {
      const seen = await inspectMailbox(graph);
      if (seen.blocked || seen.own) return json({ error: "duplicate_or_calendar_conflict" }, 409);
      const prepared = check(await admin.from("job_calendar_one_shot_runs").insert({ target_id: target.id, actor: caller, event_id: x.event_id, technician_id: x.technician_id, company_id: x.company_id, mailbox: x.mailbox, work_date: x.work_date, payload, payload_hash: digest, job_snapshot: job, schedule_signature: signature }).select("id,expires_at").single());
      check(await admin.from("job_calendar_one_shot_audit").insert({ run_id: prepared.id, actor: caller, action: "preflight", state: "prepared" }));
      return json({ preview: { run_id: prepared.id, payload_hash: digest, expires_at: prepared.expires_at, mailbox: x.mailbox, work_date: x.work_date, local_time: "08:00–16:00 Europe/Oslo", approval: c.approval, show_as: "busy", payload, request_method: "POST", request_path: oneShotPathForPreview() } });
    }
    if (b.action === "create") {
      const result = await createOneShot(graph, run.payload, async () => check(await admin.rpc("claim_job_calendar_one_shot", { _run: run.id, _actor: caller, _hash: b.payload_hash })) === true, async (state, id, http, changeKey) => {
        const saved = check(await admin.rpc("finish_job_calendar_one_shot", { _run: run.id, _actor: caller, _state: state, _event_id: id, _http: http, _change_key: changeKey ?? null, _reconcile: false }));
        if (!saved) throw new Error("receipt_not_persisted");
      });
      return json({ ...result, event_id_persisted: result.state === "succeeded" });
    }
    return json({ error: "invalid_action" }, 400);
  } catch {
    // Never echo Graph response bodies, tokens, runtime exception messages or mailbox event content.
    return json({ error: "stopped_requires_status_check", no_automatic_retry: true }, 409);
  }
});
function oneShotPathForPreview() { return `/v1.0/users/${ONE_SHOT.mailbox}/calendar/events`; }