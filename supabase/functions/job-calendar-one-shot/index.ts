// Operator-click-only create exception. Never called by scheduler/queue or other functions.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { requireGlobalAccessManager } from "../_shared/security-boundary.ts";
import { tokenRoles } from "../_shared/hub-calendar-diagnostics-core.ts";
import { diagnosticGate } from "../_shared/hub-calendar-write-pilot-core.ts";
import { buildDayPayload } from "../_shared/job-outlook-app-days.ts";
import { MUTATIONS_APPROVED, assertMutationRequest, storedScopeOk, verifyCopy, mutationGate, patchDiff, exactGetPath, type StoredCopy } from "../_shared/job-calendar-one-shot-mutation.ts";
import { ONE_SHOT, PERMITS, type OneShotPermit, oneShotGate, oneShotPayload, assertOneShotRequest, inspectMailbox, createOneShot, oneShotConflictGuard, type OneShotContext, type OneShotGraph } from "../_shared/job-calendar-one-shot.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status") }).strict(),
  z.object({ action: z.literal("preflight") }).strict(),
  z.object({ action: z.literal("diagnose") }).strict(),
  z.object({ action: z.literal("create"), run_id: z.string().uuid(), payload_hash: z.string().regex(/^[a-f0-9]{64}$/), confirm: z.string().max(120), pending_busy_confirmed: z.literal(true), conflict_override: z.boolean().default(false), resource_plan_confirmed: z.literal(true), calendar_signature: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ action: z.literal("reconcile"), run_id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("mutation_preview"), kind: z.enum(["update", "delete"]) }).strict(),
  z.object({ action: z.literal("mutation_execute"), kind: z.enum(["update", "delete"]) }).passthrough(),
]);
class AuthoritativeReadError extends Error {
  constructor(public reason: string) { super(reason); }
}
const check = <T>(r: { data: T; error: unknown }): T => {
  if (r.error) {
    const code = typeof r.error === "object" && r.error !== null && "code" in r.error ? String(r.error.code) : "";
    throw new AuthoritativeReadError(code === "23514" || code === "23503" ? "preview_scope_constraint_failed" : code === "PGRST116" ? "authoritative_row_count_invalid" : ["42703", "42P01", "PGRST204", "PGRST202"].includes(code) ? "database_schema_mismatch" : "authoritative_database_failed");
  }
  return r.data;
};
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
  let input: unknown;
  try { input = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  // Permit selection is an exact allow-list key; unknown permits fail closed. Default keeps the original 60570 permit.
  const rawPermit = (input && typeof input === "object" && "permit" in input) ? (input as Record<string, unknown>).permit : ONE_SHOT.id;
  const x: OneShotPermit | undefined = typeof rawPermit === "string" && Object.hasOwn(PERMITS, rawPermit) ? PERMITS[rawPermit] : undefined;
  if (!x) return json({ error: "unknown_permit" }, 400);
  if (input && typeof input === "object") { const { permit: _p, ...rest } = input as Record<string, unknown>; input = rest; }
  const permission = await uc.rpc("has_company_access", { _uid: caller, _company: x.company_id, _module: "resource_plan", _level: "edit" });
  // Parameter names match the live function; fail closed, never a superadmin bypass.
  if (permission.error || permission.data !== true) return json({ error: "company_edit_required" }, 403);
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return json({ error: "invalid_input" }, 400);
  const b = parsed.data;
  if (b.action === "create" && ![x.phrase, x.overridePhrase].includes(b.confirm)) return json({ error: "conflict_confirmation_required" }, 409);
  // Update/delete stay bound to the original verified 60570 copy only.
  if ((b.action === "mutation_preview" || b.action === "mutation_execute") && x.id !== ONE_SHOT.id) return json({ error: "mutation_not_available_for_permit", no_graph_call: true }, 409);
  // Locked until separate written approval + claim migration: no PATCH/DELETE path exists.
  if (b.action === "mutation_execute" && !MUTATIONS_APPROVED) return json({ error: "mutation_not_approved", no_graph_call: true }, 409);
  const respond = (body: Record<string, unknown>, status = 200) => json(body.error ? { ...body, reason_code: body.error, stage, graph_post_attempted: graphPostAttempted, status_check_required: graphPostAttempted || b.action === "reconcile", no_automatic_retry: true } : body, status);
  const publicRun = (r: any) => ({ id: r.id, state: r.state, consumed_at: r.consumed_at, expires_at: r.expires_at, http_status: r.http_status, event_id_persisted: !!r.graph_event_id });
  let stage = "history_read";
  let graphPostAttempted = false;
  try {
    stage = "history_read";
    const history = check(await admin.from("job_calendar_one_shot_runs").select("id,state,consumed_at,expires_at,http_status,graph_event_id").eq("event_id", x.event_id).eq("technician_id", x.technician_id).eq("work_date", x.work_date).order("created_at", { ascending: false }).limit(15));
    // A consumed permit cannot fall out of a bounded recent-preflight list.
    stage = "consumedRun_read";
    const consumedRun = check(await admin.from("job_calendar_one_shot_runs").select("id,state,consumed_at,expires_at,http_status,graph_event_id").eq("event_id", x.event_id).eq("technician_id", x.technician_id).eq("work_date", x.work_date).not("consumed_at", "is", null).limit(1));
    const consumed = consumedRun.length > 0;
    if (consumed && !history.some(r => r.id === consumedRun[0].id)) history.unshift(consumedRun[0]);
    if (b.action === "status") return respond({ permit: x.id, label: x.label, scope: { event_id: x.event_id, technician_id: x.technician_id, mailbox: x.mailbox, work_date: x.work_date }, runs: history.map(publicRun), consumed });
    const run = b.action === "create" || b.action === "reconcile" ? check(await admin.from("job_calendar_one_shot_runs").select("*").eq("id", b.run_id).eq("event_id", x.event_id).eq("technician_id", x.technician_id).eq("work_date", x.work_date).maybeSingle()) : null;
    if ((b.action === "create" || b.action === "reconcile") && !run) return respond({ error: "run_not_found" }, 404);
    if (b.action === "create" && (run?.actor !== caller || run.payload_hash !== b.payload_hash || run.state !== "prepared" || Date.parse(run.expires_at) <= Date.now() || run.consumed_at)) return respond({ error: "preflight_expired_or_consumed" }, 409);
    if (b.action === "create" && (run.calendar_signature !== b.calendar_signature || b.confirm !== (run.conflict_summary?.category === "other" ? x.overridePhrase : x.phrase) || (run.conflict_summary?.category === "other" && !b.conflict_override))) return respond({ error: "conflict_confirmation_required" }, 409);
    if (b.action === "preflight" && consumed) return respond({ error: "permit_already_consumed", runs: history.map(publicRun) }, 409);
    if (b.action === "reconcile" && (!run?.consumed_at || run.state === "succeeded")) return respond({ error: "no_uncertain_run" }, 409);
    stage = "job_read";
    const job = check(await uc.from("events").select("*").eq("id", x.event_id).eq("company_id", x.company_id).maybeSingle());
    if (!job) return respond({ error: "job_not_visible" }, 403);
    stage = "target_read";
    const target = check(await admin.from("job_outlook_app_pilot_targets").select("*").eq("event_id", x.event_id).eq("technician_id", x.technician_id).eq("work_date", x.work_date).eq("company_id", x.company_id).is("revoked_at", null).maybeSingle());
    if (!target) return respond({ error: "active_pilot_required" }, 409);
    stage = "tech_read";
    const tech = check(await admin.from("technicians").select("id,user_id,email,deleted_at,archived_at").eq("id", x.technician_id).single());
    stage = "account_read";
    const account = check(await admin.from("user_accounts").select("person_id,is_active").eq("auth_user_id", tech.user_id ?? "").eq("is_active", true).maybeSingle());
    const person = account ? check(await admin.from("people").select("is_active").eq("id", account.person_id).maybeSingle()) : null;
    const employed = account ? check(await admin.from("employment_profiles").select("id").eq("person_id", account.person_id).eq("company_id", x.company_id).eq("relationship_type", "employee").is("archived_at", null).limit(1)) : [];
    stage = "assignment_read";
    const assignment = check(await admin.from("event_technicians").select("id,calendar_event_id").eq("event_id", x.event_id).eq("technician_id", x.technician_id).maybeSingle());
    stage = "approval_read";
    const approval = check(await admin.from("job_approvals").select("status,outlook_event_id").eq("job_id", x.event_id).eq("technician_user_id", tech.user_id ?? "").order("created_at", { ascending: false }).limit(1).maybeSingle());
    stage = "blocks_read";
    const blocks = check(await admin.from("schedule_blocks").select("company_id,technician_id,start_at,end_at").eq("project_id", x.event_id).eq("technician_id", x.technician_id).eq("source", "manual").is("deleted_at", null));
    stage = "probe_read";
    const probe = check(await admin.from("job_outlook_app_pilot_actions").select("created_at,result").eq("target_id", target.id).eq("action", "probe_mailbox").order("created_at", { ascending: false }).limit(1).maybeSingle());
    stage = "settings_read";
    const settings = check(await admin.from("job_outlook_app_sync_settings").select("enabled,dry_run,pilot_mailboxes,scope_verified_at").eq("id", true).single());
    stage = "signature_read";
    const signature = check(await admin.rpc("assignment_schedule_signature", { _event: x.event_id, _user: tech.user_id }));
    const c: OneShotContext = { job: { ...job, start_at: job.start_time, end_at: job.end_time }, target, assigned: !!assignment, identityActive: !!account && !!person?.is_active && employed.length > 0 && !tech.archived_at && !tech.deleted_at, mailbox: tech.email?.trim().toLowerCase() ?? "", approval: approval?.status ?? "unknown", blocks, probe: probe as any, settings };
    stage = "scope_validation";
    const denied = oneShotGate(c, new Date(), x);
    // Recovery is read-only and must remain possible after a target or preview expires.
    // It still requires this exact scope, active identity, live assignment and caller company access.
    const mutationReadable = b.action === "mutation_preview" && !!denied && !["exact_scope_mismatch", "global_settings_changed"].includes(denied);
    if (denied && !mutationReadable && (b.action !== "reconcile" || ["exact_scope_mismatch", "inactive_assignment_or_identity"].includes(denied))) return respond({ error: denied }, 409);
    const payload = oneShotPayload(c.job, x);
    const digest = await hash(JSON.stringify(payload));
    if (b.action === "create" && (digest !== run?.payload_hash || signature !== run.schedule_signature)) return respond({ error: "preview_changed" }, 409);
    stage = "diag_read";
    const diag = check(await admin.from("hub_calendar_diagnostic_runs").select("run_at,overall,checks").order("run_at", { ascending: false }).limit(1).maybeSingle());
    const diagDenied = diagnosticGate(diag as any, new Date());
    if (diagDenied && b.action !== "mutation_preview") return respond({ error: diagDenied }, 409);
    const tenant = env("HUB_CALENDAR_TENANT_ID"), client = env("HUB_CALENDAR_CLIENT_ID"), secret = env("HUB_CALENDAR_CLIENT_SECRET"), mailClient = env("AZURE_CLIENT_ID");
    if (!tenant || !client || !secret || !mailClient || client === mailClient) return respond({ error: "calendar_identity_unverified" }, 409);
    stage = "calendar_token";
    const tokenRes = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, { method: "POST", signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: client, client_secret: secret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }) });
    const tokenText = await tokenRes.text();
    if (!tokenRes.ok) return respond({ error: "calendar_token_failed", http: tokenRes.status }, 409);
    const token = JSON.parse(tokenText)?.access_token;
    if (typeof token !== "string") return respond({ error: "calendar_token_failed" }, 409);
    const facts = tokenRoles(token);
    const decoded = JSON.parse(atob((token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/")));
    if (decoded.tid !== tenant || facts.appId !== client || !facts.roles.includes("Calendars.ReadWrite") || facts.roles.some(r => !["Calendars.Read", "Calendars.ReadWrite"].includes(r))) return respond({ error: "calendar_identity_unverified" }, 409);
    const graph: OneShotGraph = async (method, path, body) => {
      assertOneShotRequest(method, path, x);
      stage = method === "POST" ? "graph_post" : "graph_calendar_read";
      if (method === "POST") graphPostAttempted = true;
      const res = await fetch(`https://graph.microsoft.com${path}`, { method, signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: 'outlook.timezone="UTC", IdType="ImmutableId"', "client-request-id": x.key }, body: body ? JSON.stringify(body) : undefined });
      const text = await res.text();
      let data = null; try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON is held */ }
      return { status: res.status, data };
    };
    if (b.action === "mutation_preview") {
      // Read-only: one GET of the exact stored ID. No claim, audit, queue, flag or Graph write.
      stage = "stored_copy_read";
      const stored = check(await admin.from("job_calendar_one_shot_runs").select("graph_event_id,graph_change_key,mailbox,event_id,technician_id,work_date,company_id,state,payload").eq("event_id", x.event_id).eq("technician_id", x.technician_id).eq("company_id", x.company_id).eq("mailbox", x.mailbox).eq("work_date", x.work_date).eq("idempotency_key", x.key).eq("state", "succeeded").not("consumed_at", "is", null).limit(2));
      if (stored.length !== 1) return respond({ error: "no_verified_copy" }, 409);
      const s = stored[0] as StoredCopy & { payload: Record<string, unknown> };
      const scope = storedScopeOk(s); if (scope) return respond({ error: scope }, 409);
      if (c.mailbox !== x.mailbox) return respond({ error: "exact_scope_mismatch" }, 409);
      const path = exactGetPath(s.graph_event_id);
      assertMutationRequest("GET", path, s.graph_event_id);
      stage = "graph_calendar_read";
      const res = await fetch(`https://graph.microsoft.com${path}`, { method: "GET", signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC", IdType="ImmutableId"' } });
      let data = null; try { data = await res.json(); } catch { /* held as unknown */ }
      const v = verifyCopy({ status: res.status, data }, s);
      const day = blocks.filter(bl => bl.start_at.slice(0, 10) === x.work_date && bl.company_id === x.company_id);
      const dayStillPlanned = !!assignment && day.length > 0;
      const desired = day.length === 1 ? { ...buildDayPayload(c.job, { technicianId: x.technician_id, workDate: x.work_date, startAt: new Date(day[0].start_at).toISOString(), endAt: new Date(day[0].end_at).toISOString(), operationKey: x.key }, x.key), isReminderOn: false, isOnlineMeeting: false } : s.payload;
      const changes = Object.keys(patchDiff(desired, s.payload));
      const blockedBy = mutationGate(b.kind, v, { dayStillPlanned, specialDeletePermit: false, desired, current: s.payload });
      return respond({ read_only: true, kind: b.kind, verification: v.verification, facts: v.facts ?? null, day_still_planned: dayStillPlanned, changed_fields: changes, blocked_by: blockedBy ?? "mutation_not_approved", writes_enabled: MUTATIONS_APPROVED, confirm_phrase_required: true });
    }
    if (b.action === "reconcile") {
      const seen = await inspectMailbox(graph, "", x);
      if (!seen.own) {
        check(await admin.from("job_calendar_one_shot_audit").insert({ run_id: run.id, actor: caller, action: "reconcile", state: "unresolved" }));
        return respond({ state: "unresolved_no_repost" });
      }
      const saved = check(await admin.rpc("finish_job_calendar_one_shot", { _run: run.id, _actor: caller, _state: "succeeded", _event_id: seen.own.id, _http: 200, _change_key: seen.own.changeKey ?? null, _reconcile: true }));
      if (!saved) throw new Error("receipt_not_persisted");
      return respond({ state: "succeeded", event_id_persisted: true, reconciled: true });
    }
    stage = "appLinks_read";
    const appLinks = check(await admin.from("job_outlook_app_links").select("id,work_date").eq("event_id", x.event_id).eq("technician_id", x.technician_id));
    stage = "dayLinks_read";
    const dayLinks = check(await admin.from("job_calendar_day_links").select("id").eq("event_id", x.event_id).eq("technician_id", x.technician_id).eq("work_date", x.work_date));
    stage = "legacy_read";
    const legacy = check(await admin.from("job_calendar_links").select("id").eq("job_id", x.event_id).eq("technician_id", x.technician_id).not("calendar_event_id", "is", null));
    stage = "organizer_read";
    const organizer = check(await admin.from("m365_organizer_links").select("event_id").eq("event_id", x.event_id).eq("technician_id", x.technician_id).not("graph_event_id", "is", null));
    const hasMapping = !!(appLinks.some(l => l.work_date === x.work_date || !l.work_date) || dayLinks.length || legacy.length || organizer.length || assignment?.calendar_event_id || approval?.outlook_event_id);
    if (b.action === "diagnose") {
      // Explicit read-only action: no prepared permit, audit, claim, receipt or queue/flag writes.
      const seen = await inspectMailbox(graph, c.job.title, x);
      return respond({ diagnosis: seen.diagnosis, existing_mapping: hasMapping, read_only: true });
    }
    if (hasMapping) return respond({ error: "existing_mapping_requires_reconciliation" }, 409);
    if (b.action === "preflight") {
      const seen = await inspectMailbox(graph, c.job.title, x);
      const conflictDenied = oneShotConflictGuard(seen.diagnosis, true);
      if (conflictDenied) return respond({ error: conflictDenied, diagnosis: seen.diagnosis }, 409);
      stage = "preview_persist";
      const prepared = check(await admin.from("job_calendar_one_shot_runs").insert({ target_id: target.id, actor: caller, idempotency_key: x.key, event_id: x.event_id, technician_id: x.technician_id, company_id: x.company_id, mailbox: x.mailbox, work_date: x.work_date, payload, payload_hash: digest, job_snapshot: job, schedule_signature: signature, calendar_signature: seen.signature, conflict_summary: seen.diagnosis }).select("id,expires_at").single());
      stage = "preview_audit";
      check(await admin.from("job_calendar_one_shot_audit").insert({ run_id: prepared.id, actor: caller, action: "preflight", state: "prepared" }));
      return respond({ diagnosis: seen.diagnosis, preview: { run_id: prepared.id, payload_hash: digest, calendar_signature: seen.signature, conflict_override_required: seen.diagnosis.category === "other", expires_at: prepared.expires_at, mailbox: x.mailbox, work_date: x.work_date, local_time: "08:00–16:00 Europe/Oslo", approval: c.approval, show_as: "busy", payload, request_method: "POST", request_path: oneShotPathForPreview(x) } });
    }
    if (b.action === "create") {
      const result = await createOneShot(graph, run.payload, async () => check(await admin.rpc("claim_job_calendar_one_shot", { _run: run.id, _actor: caller, _hash: b.payload_hash, _calendar_signature: b.calendar_signature, _override: b.conflict_override, _resource_plan_confirmed: b.resource_plan_confirmed, _confirm: b.confirm })) === true, async (state, id, http, changeKey) => {
        const saved = check(await admin.rpc("finish_job_calendar_one_shot", { _run: run.id, _actor: caller, _state: state, _event_id: id, _http: http, _change_key: changeKey ?? null, _reconcile: false }));
        if (!saved) throw new Error("receipt_not_persisted");
      }, { override: b.conflict_override, signature: b.calendar_signature }, x);
      return respond({ ...result, event_id_persisted: result.state === "succeeded" });
    }
    return respond({ error: "invalid_action" }, 400);
  } catch (e) {
    // Only fixed codes/stages leave the server. Never log raw exception or Graph/DB content.
    const statusCheckRequired = graphPostAttempted || b.action === "reconcile";
    const reason = statusCheckRequired ? "stopped_requires_status_check" : e instanceof AuthoritativeReadError ? e.reason : stage === "graph_calendar_read" ? "graph_calendar_read_failed" : stage === "calendar_token" ? "calendar_token_read_failed" : "preflight_runtime_failed";
    console.warn(JSON.stringify({ function: "job-calendar-one-shot", action: b.action, permit: x.id, stage, reason_code: reason, graph_post_attempted: graphPostAttempted }));
    return respond({ error: reason, reason_code: reason, stage, graph_post_attempted: graphPostAttempted, status_check_required: statusCheckRequired, no_automatic_retry: true }, 409);
  }
});
function oneShotPathForPreview(x: OneShotPermit) { return `/v1.0/users/${x.mailbox}/calendar/events`; }