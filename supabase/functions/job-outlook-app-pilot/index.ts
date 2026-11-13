// SUPERADMIN-ONLY pilot control for the central app-only job calendar. Never enables the sync,
// never changes job_outlook_app_sync_settings, never POST/PATCH/DELETE to Graph.
// Actions:
//  status          – flags, pilot targets, HELD queue intents (never drained until released)
//  add_target      – exact (job, technician, Oslo work date) target; mailbox = technician e-mail; expires ≤72h
//  revoke_target   – revoke a target
//  probe_mailbox   – read-only GET calendar metadata for a target mailbox (expect 200); body never read
//  simulate        – per-day dry-run plan for a target (no Graph, no link writes)
//  release_queue   – explicit release of ONE held intent with idempotency key; requires matching active target
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireGlobalAccessManager } from "../_shared/security-boundary.ts";
import { missingSecrets } from "../_shared/hub-calendar-diagnostics-core.ts";
import type { HubJob } from "../_shared/job-outlook-app-core.ts";
import { osloDayKey } from "../_shared/multi-day-calendar.ts";
import { planJobDays, canReleaseQueueItem, clampTargetHours, type PilotTarget } from "../_shared/job-outlook-app-days.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PROBE_COOLDOWN_MS = 30_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const uc = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: claims } = await uc.auth.getClaims(auth.slice(7).trim());
  const caller = claims?.claims?.sub as string | undefined;
  if (!caller) return json({ error: "unauthorized" }, 401);
  if (!(await requireGlobalAccessManager(admin as never, caller))) return json({ error: "forbidden" }, 403);

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* status */ }
  const action = String(b.action ?? "status");
  const audit = (a: string, result: unknown, extra: Record<string, unknown> = {}) =>
    admin.from("job_outlook_app_pilot_actions").insert({ action: a, actor: caller, result, ...extra });
  const now = new Date();

  const loadTarget = async (id: unknown) => {
    if (typeof id !== "string" || !UUID.test(id)) return null;
    const { data } = await admin.from("job_outlook_app_pilot_targets").select("*").eq("id", id).maybeSingle();
    return data as (PilotTarget & { id: string }) | null;
  };

  if (action === "status") {
    const [{ data: s }, { data: t }, { data: q }, { data: acts }] = await Promise.all([
      admin.from("job_outlook_app_sync_settings").select("enabled,dry_run,pilot_mailboxes,scope_verified_at").eq("id", true).maybeSingle(),
      admin.from("job_outlook_app_pilot_targets").select("id,event_id,technician_id,mailbox,work_date,expires_at,revoked_at,created_at, events(title,project_number), technicians(name)").order("created_at", { ascending: false }).limit(20),
      admin.from("job_outlook_app_queue").select("id,event_id,technician_id,reason,status,released_at,created_at, events(title,project_number), technicians(name)").eq("status", "pending").order("created_at").limit(50),
      admin.from("job_outlook_app_pilot_actions").select("action,created_at,result").order("created_at", { ascending: false }).limit(10),
    ]);
    return json({
      settings: { enabled: !!s?.enabled, dry_run: s?.dry_run !== false, pilot_mailboxes: s?.pilot_mailboxes ?? [], scope_verified: !!s?.scope_verified_at },
      secrets_configured: missingSecrets((n) => Deno.env.get(n)).length === 0,
      targets: t ?? [], held_queue: (q ?? []).filter((x: any) => !x.released_at), released_queue: (q ?? []).filter((x: any) => x.released_at), actions: acts ?? [],
    });
  }

  if (action === "add_target") {
    const eventId = b.event_id, techId = b.technician_id, workDate = b.work_date;
    if (typeof eventId !== "string" || !UUID.test(eventId) || typeof techId !== "string" || !UUID.test(techId) || typeof workDate !== "string" || !DATE.test(workDate)) return json({ error: "invalid_input" }, 400);
    const [{ data: ev }, { data: et }, { data: blocks }] = await Promise.all([
      admin.from("events").select("id,company_id,deleted_at,project_type").eq("id", eventId).maybeSingle(),
      admin.from("event_technicians").select("technician_id, technicians(email,company_id)").eq("event_id", eventId).eq("technician_id", techId).maybeSingle(),
      admin.from("schedule_blocks").select("start_at").eq("project_id", eventId).eq("technician_id", techId).is("deleted_at", null),
    ]);
    if (!ev || ev.deleted_at || ev.project_type === "task" || !ev.company_id) return json({ error: "job_not_eligible" }, 409);
    const email = ((et as any)?.technicians?.email ?? "").trim().toLowerCase();
    if (!et || !email) return json({ error: "technician_not_assigned_or_no_mailbox" }, 409);
    if (!(blocks ?? []).some((x: any) => osloDayKey(x.start_at) === workDate)) return json({ error: "no_planned_day_on_date" }, 409);
    const expires_at = new Date(now.getTime() + clampTargetHours(b.expires_hours) * 3600_000).toISOString();
    const { data, error } = await admin.from("job_outlook_app_pilot_targets").insert({ company_id: ev.company_id, event_id: eventId, technician_id: techId, mailbox: email, work_date: workDate, approved_by: caller, expires_at, note: typeof b.note === "string" ? b.note.slice(0, 200) : null }).select("id").maybeSingle();
    if (error) return json({ error: error.code === "23505" ? "target_exists" : "insert_failed" }, 409);
    await audit("add_target", { work_date: workDate }, { target_id: data!.id });
    return json({ ok: true, id: data!.id, expires_at });
  }

  if (action === "revoke_target") {
    const t = await loadTarget(b.target_id);
    if (!t) return json({ error: "not_found" }, 404);
    await admin.from("job_outlook_app_pilot_targets").update({ revoked_at: now.toISOString(), revoked_by: caller }).eq("id", t.id).is("revoked_at", null);
    await audit("revoke_target", {}, { target_id: t.id });
    return json({ ok: true });
  }

  if (action === "probe_mailbox") {
    const t = await loadTarget(b.target_id);
    if (!t || t.revoked_at || Date.parse(t.expires_at) <= now.getTime()) return json({ error: "no_active_target" }, 409);
    const env = (n: string) => Deno.env.get(n);
    if (missingSecrets(env).length) return json({ error: "not_configured" }, 409);
    const { data: last } = await admin.from("job_outlook_app_pilot_actions").select("created_at").eq("action", "probe_mailbox").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (last && now.getTime() - Date.parse(last.created_at) < PROBE_COOLDOWN_MS) return json({ error: "cooldown" }, 429);
    const tok = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(env("HUB_CALENDAR_TENANT_ID")!.trim())}/oauth2/v2.0/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env("HUB_CALENDAR_CLIENT_ID")!.trim(), client_secret: env("HUB_CALENDAR_CLIENT_SECRET")!.trim(), grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }),
    });
    let result: Record<string, unknown>;
    if (!tok.ok) { await tok.body?.cancel(); result = { pass: false, step: "token", http: tok.status }; }
    else {
      let token: string | null = (await tok.json()).access_token ?? null;
      const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(t.mailbox)}/calendar?$select=id`, { method: "GET", headers: { Authorization: `Bearer ${token}` } });
      token = null;
      let code: string | null = null;
      if (res.ok) await res.body?.cancel(); else { try { const j = await res.json(); code = String(j?.error?.code ?? "").slice(0, 80) || null; } catch { /* ignore */ } }
      result = { pass: res.status === 200, step: "calendar_get", http: res.status, graph_code: code };
    }
    await audit("probe_mailbox", result, { target_id: t.id });
    return json({ ok: true, result });
  }

  if (action === "simulate") {
    const t = await loadTarget(b.target_id);
    if (!t) return json({ error: "not_found" }, 404);
    const [{ data: ev }, { data: rows }, { data: blocks }, { data: appLinks }, { data: legacy }] = await Promise.all([
      admin.from("events").select("id,company_id,title,address,start_time,end_time,status,deleted_at").eq("id", t.event_id).maybeSingle(),
      admin.from("event_technicians").select("technician_id, technicians(email)").eq("event_id", t.event_id),
      admin.from("schedule_blocks").select("technician_id,start_at,end_at").eq("project_id", t.event_id).is("deleted_at", null),
      admin.from("job_outlook_app_links").select("*").eq("event_id", t.event_id),
      admin.from("job_calendar_day_links").select("id,technician_id,work_date,start_at,end_at,outlook_event_id,status").eq("event_id", t.event_id),
    ]);
    if (!ev) return json({ error: "job_not_found" }, 404);
    const job: HubJob = { id: ev.id, company_id: ev.company_id, title: ev.title, address: ev.address, start_at: ev.start_time, end_at: ev.end_time, status: ev.status, deleted_at: ev.deleted_at };
    // Simulation as if the global gate were opened ONLY for this target's mailbox, always dry-run.
    const plan = planJobDays({ job, blocks: (blocks ?? []) as any, assignees: (rows ?? []).map((r: any) => ({ technician_id: r.technician_id, email: r.technicians?.email ?? null })),
      appLinks: ((appLinks ?? []) as any[]).filter((l) => l.work_date), legacyLinks: (legacy ?? []) as any, targets: [t],
      flags: { enabled: true, dryRun: true, scopeVerified: true, pilotMailboxes: [t.mailbox] }, now });
    const days = plan.map((r) => ({ technician_id: r.technicianId, work_date: r.workDate, start_at: r.startAt, end_at: r.endAt, in_pilot: !r.gate, gate: r.gate, decision: r.decision.kind, reason: (r.decision as any).reason ?? null }));
    await audit("simulate", { days: days.length, writable: days.filter((d) => d.in_pilot && d.decision !== "skip").length }, { target_id: t.id });
    return json({ ok: true, simulation: true, days });
  }

  if (action === "release_queue") {
    const qid = b.queue_id, key = b.idempotency_key;
    if (typeof qid !== "string" || !UUID.test(qid) || typeof key !== "string" || key.length < 8 || key.length > 100) return json({ error: "invalid_input" }, 400);
    const { data: prior } = await admin.from("job_outlook_app_pilot_actions").select("result").eq("action", "release_queue").eq("idempotency_key", key).maybeSingle();
    if (prior) return json({ ok: true, replay: true, result: prior.result });
    const { data: it } = await admin.from("job_outlook_app_queue").select("*").eq("id", qid).maybeSingle();
    if (!it) return json({ error: "not_found" }, 404);
    const { data: tr } = await admin.from("job_outlook_app_pilot_targets").select("*").eq("event_id", it.event_id).eq("technician_id", it.technician_id).is("revoked_at", null);
    const chk = canReleaseQueueItem(it as any, (tr ?? []) as PilotTarget[], now);
    if (!chk.ok) return json({ error: chk.reason }, 409);
    const { data: upd } = await admin.from("job_outlook_app_queue").update({ released_at: now.toISOString(), released_by: caller, release_key: key }).eq("id", qid).eq("status", "pending").is("released_at", null).select("id").maybeSingle();
    if (!upd) return json({ error: "already_released" }, 409);
    const result = { queue_id: qid, released: true };
    await audit("release_queue", result, { queue_id: qid, idempotency_key: key });
    return json({ ok: true, result });
  }

  return json({ error: "invalid_action" }, 400);
});
