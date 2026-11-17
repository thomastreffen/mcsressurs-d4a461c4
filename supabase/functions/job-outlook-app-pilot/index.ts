// SUPERADMIN-ONLY pilot control for the central app-only job calendar. Never enables the sync,
// never changes job_outlook_app_sync_settings, never POST/PATCH/DELETE to Graph.
// Actions:
//  status          – flags, pilot targets, HELD queue intents (never drained until released)
//  add_target      – exact (job, technician, Oslo work date) target; mailbox = technician e-mail; expires ≤72h
//  revoke_target   – revoke a target
//  probe_mailbox   – read-only GET calendar metadata for a target mailbox (expect 200); body never read
//  simulate        – per-day dry-run plan for a target (no Graph, no link writes)
//  release_queue   – blocked pending separate staff-calendar write approval
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireGlobalAccessManager } from "../_shared/security-boundary.ts";
import { missingSecrets } from "../_shared/hub-calendar-diagnostics-core.ts";
import type { HubJob } from "../_shared/job-outlook-app-core.ts";
import { pilotChoices, freshMailboxProbe, existingTargetDecision } from "../_shared/job-outlook-pilot-selector.ts";
import { planJobDays, clampTargetHours, type PilotTarget } from "../_shared/job-outlook-app-days.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PROBE_COOLDOWN_MS = 30_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const uc = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
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

  const latestProbe = async (id: string) => {
    const { data } = await admin.from("job_outlook_app_pilot_actions").select("created_at,result").eq("target_id", id).eq("action", "probe_mailbox").order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data;
  };
  const choicesFor = async (eventId: string) => {
    const [{ data: ev }, { data: rows }, { data: blocks }, { data: links }] = await Promise.all([
      admin.from("events").select("id,company_id,deleted_at,project_type,title,project_number").eq("id", eventId).maybeSingle(),
      admin.from("event_technicians").select("technician_id,technicians(name,email,deleted_at,archived_at)").eq("event_id", eventId),
      admin.from("schedule_blocks").select("company_id,technician_id,start_at,end_at,source,deleted_at").eq("project_id", eventId).is("deleted_at", null),
      admin.from("job_calendar_day_links").select("technician_id,work_date,status,outlook_event_id").eq("event_id", eventId),
    ]);
    return { job: ev, technicians: ev ? pilotChoices(ev, (rows ?? []).map((r: any) => ({ technician_id: r.technician_id, ...r.technicians })), blocks ?? [], links ?? []) : [] };
  };
  if (action === "candidates") {
    if (b.event_id !== undefined) {
      if (typeof b.event_id !== "string" || !UUID.test(b.event_id)) return json({ error: "invalid_input" }, 400);
      return json(await choicesFor(b.event_id));
    }
    const search = typeof b.search === "string" ? b.search.trim() : "";
    if (search.length < 2 || search.length > 100 || !/^[\p{L}\p{N} ._-]+$/u.test(search)) return json({ jobs: [] });
    const { data, error } = await admin.from("events").select("id,title,project_number,company_id").is("deleted_at", null).neq("project_type", "task").ilike("title", `%${search}%`).order("start_time", { ascending: false }).limit(30);
    if (error) return json({ error: "lookup_failed" }, 500);
    return json({ jobs: data ?? [] });
  }

  if (action === "status") {
    const [{ data: s }, { data: t }, { data: q }, { data: acts }] = await Promise.all([
      admin.from("job_outlook_app_sync_settings").select("enabled,dry_run,pilot_mailboxes,scope_verified_at").eq("id", true).maybeSingle(),
      admin.from("job_outlook_app_pilot_targets").select("id,event_id,technician_id,mailbox,work_date,expires_at,revoked_at,created_at").order("created_at", { ascending: false }).limit(20),
      admin.from("job_outlook_app_queue").select("id,event_id,technician_id,reason,status,released_at,created_at").eq("status", "pending").order("created_at").limit(50),
      admin.from("job_outlook_app_pilot_actions").select("action,created_at,result").order("created_at", { ascending: false }).limit(10),
    ]);
    const evIds = [...new Set([...(t ?? []), ...(q ?? [])].map((x: any) => x.event_id))];
    const techIds = [...new Set([...(t ?? []), ...(q ?? [])].map((x: any) => x.technician_id))];
    const [{ data: evs }, { data: techs }] = await Promise.all([
      evIds.length ? admin.from("events").select("id,title,project_number").in("id", evIds) : Promise.resolve({ data: [] as any[] }),
      techIds.length ? admin.from("technicians").select("id,name").in("id", techIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const evMap = new Map((evs ?? []).map((e: any) => [e.id, { title: e.title, project_number: e.project_number }]));
    const tMap = new Map((techs ?? []).map((x: any) => [x.id, x.name]));
    const enrich = (x: any) => ({ ...x, job: evMap.get(x.event_id) ?? null, technician_name: tMap.get(x.technician_id) ?? null });
    t?.splice(0, t.length, ...(t ?? []).map(enrich)); q?.splice(0, q.length, ...(q ?? []).map(enrich));
    const targets = await Promise.all((t ?? []).map(async (target: any) => ({ ...target, probe: await latestProbe(target.id) })));
    return json({
      settings: { enabled: !!s?.enabled, dry_run: s?.dry_run !== false, pilot_mailboxes: s?.pilot_mailboxes ?? [], scope_verified: !!s?.scope_verified_at },
      secrets_configured: missingSecrets((n) => Deno.env.get(n)).length === 0,
      targets, held_queue: (q ?? []).filter((x: any) => !x.released_at), released_queue: (q ?? []).filter((x: any) => x.released_at), actions: acts ?? [],
    });
  }

  if (action === "add_target") {
    const eventId = b.event_id, techId = b.technician_id, workDate = b.work_date;
    if (typeof eventId !== "string" || !UUID.test(eventId) || typeof techId !== "string" || !UUID.test(techId) || typeof workDate !== "string" || !DATE.test(workDate)) return json({ error: "invalid_input" }, 400);
    if (b.confirm_day !== true) return json({ error: "day_confirmation_required" }, 400);
    const choice = await choicesFor(eventId);
    const ev = choice.job;
    const selected = choice.technicians.find((t) => t.id === techId);
    const day = selected?.days.find((d) => d.work_date === workDate);
    if (!ev || !selected || !day) return json({ error: "no_eligible_assigned_day" }, 409);
    if (day.synced) return json({ error: "already_synced_no_change" }, 409);
    const { data: et } = await admin.from("event_technicians").select("technicians(email)").eq("event_id", eventId).eq("technician_id", techId).maybeSingle();
    const email = ((et as any)?.technicians?.email ?? "").trim().toLowerCase();
    if (!email) return json({ error: "no_mailbox" }, 409);
    const { data: prior } = await admin.from("job_outlook_app_pilot_targets").select("id,revoked_at,expires_at").eq("event_id", eventId).eq("technician_id", techId).eq("work_date", workDate).is("revoked_at", null).maybeSingle();
    const decision = existingTargetDecision(prior as any, now);
    if (decision === "active") return json({ error: "active_target_exists", target_id: (prior as any).id }, 409);
    if (decision === "expired") {
      // Retire only if still unrevoked AND expired (compare-and-set; concurrent confirmations race on the unique index).
      const { data: retired } = await admin.from("job_outlook_app_pilot_targets").update({ revoked_at: now.toISOString(), revoked_by: caller }).eq("id", (prior as any).id).is("revoked_at", null).lte("expires_at", now.toISOString()).select("id");
      if (retired?.length) await audit("retire_expired_target", { reason: "replaced_by_new_confirmation", work_date: workDate }, { target_id: (prior as any).id });
    }
    const expires_at = new Date(now.getTime() + clampTargetHours(b.expires_hours) * 3600_000).toISOString();
    const { data, error } = await admin.from("job_outlook_app_pilot_targets").insert({ company_id: ev.company_id, event_id: eventId, technician_id: techId, mailbox: email, work_date: workDate, approved_by: caller, expires_at, note: typeof b.note === "string" ? b.note.slice(0, 200) : null }).select("id").maybeSingle();
    if (error || !data) return json({ error: error?.code === "23505" ? "active_target_exists" : "insert_failed" }, 409);
    await audit("add_target", { work_date: workDate }, { target_id: data.id });
    return json({ ok: true, id: data.id, expires_at });
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
    const current = await choicesFor(t.event_id);
    if (current.job?.company_id !== t.company_id || !current.technicians.some(x => x.id === t.technician_id && x.days.some(d => d.work_date === t.work_date))) return json({ error: "target_no_longer_assigned" }, 409);
    const { data: assigned } = await admin.from("event_technicians").select("technicians(email)").eq("event_id", t.event_id).eq("technician_id", t.technician_id).maybeSingle();
    if (((assigned as any)?.technicians?.email ?? "").trim().toLowerCase() !== t.mailbox.toLowerCase()) return json({ error: "mailbox_changed" }, 409);
    const env = (n: string) => Deno.env.get(n) ?? "";
    if (missingSecrets(env).length) return json({ error: "not_configured" }, 409);
    const { data: last } = await admin.from("job_outlook_app_pilot_actions").select("created_at").eq("action", "probe_mailbox").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (last && now.getTime() - Date.parse(last.created_at) < PROBE_COOLDOWN_MS) return json({ error: "cooldown" }, 429);
    const tok = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(env("HUB_CALENDAR_TENANT_ID").trim())}/oauth2/v2.0/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env("HUB_CALENDAR_CLIENT_ID").trim(), client_secret: env("HUB_CALENDAR_CLIENT_SECRET").trim(), grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }),
    });
    let result: Record<string, unknown>;
    if (!tok.ok) { await tok.body?.cancel(); result = { pass: false, step: "token", http: tok.status }; }
    else {
      let token: string | null = (await tok.json()).access_token ?? null;
      // Sanitized token facts only (never the token): tenant/app match and roles.
      let claims: Record<string, unknown> = {};
      try { const c = JSON.parse(atob((token ?? "").split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); claims = { tid_match: c.tid === env("HUB_CALENDAR_TENANT_ID").trim(), appid_match: (c.appid ?? c.azp) === env("HUB_CALENDAR_CLIENT_ID").trim(), roles: Array.isArray(c.roles) ? c.roles.filter((r: unknown) => typeof r === "string" && /^(Calendars|Mail)\./.test(r as string)) : [] }; } catch { claims = { decode: "failed" }; }
      const clientRequestId = crypto.randomUUID();
      const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(t.mailbox)}/calendar?$select=id`, { method: "GET", headers: { Authorization: `Bearer ${token}`, "client-request-id": clientRequestId, "return-client-request-id": "true" } });
      token = null;
      let code: string | null = null; let message: string | null = null;
      if (res.ok) await res.body?.cancel(); else { try { const j = await res.json(); code = String(j?.error?.code ?? "").slice(0, 80) || null; message = String(j?.error?.message ?? "").replace(/[\w.+-]+@[\w.-]+/g, "<mailbox>").slice(0, 200) || null; } catch { /* ignore */ } }
      result = { pass: res.status === 200, step: "calendar_get", http: res.status, graph_code: code, graph_message: message, request_id: res.headers.get("request-id"), client_request_id: clientRequestId, graph_date: res.headers.get("date"), endpoint: "GET /v1.0/users/{mailbox}/calendar?$select=id", ...claims };
    }
    await audit("probe_mailbox", result, { target_id: t.id });
    return json({ ok: true, result });
  }

  if (action === "simulate") {
    const t = await loadTarget(b.target_id);
    if (!t || t.revoked_at || Date.parse(t.expires_at) <= now.getTime()) return json({ error: "no_active_target" }, 409);
    if (!freshMailboxProbe(await latestProbe(t.id), now)) return json({ error: "mailbox_read_test_required" }, 409);
    const current = await choicesFor(t.event_id);
    if (current.job?.company_id !== t.company_id || !current.technicians.some(x => x.id === t.technician_id && x.days.some(d => d.work_date === t.work_date))) return json({ error: "target_no_longer_assigned" }, 409);
    const [{ data: ev }, { data: rows }, { data: blocks }, { data: appLinks }, { data: legacy }] = await Promise.all([
      admin.from("events").select("id,company_id,title,address,start_time,end_time,status,deleted_at").eq("id", t.event_id).maybeSingle(),
      admin.from("event_technicians").select("technician_id, technicians(email)").eq("event_id", t.event_id),
      admin.from("schedule_blocks").select("technician_id,start_at,end_at").eq("project_id", t.event_id).eq("company_id", t.company_id).eq("source", "manual").is("deleted_at", null),
      admin.from("job_outlook_app_links").select("*").eq("event_id", t.event_id),
      admin.from("job_calendar_day_links").select("id,technician_id,work_date,start_at,end_at,outlook_event_id,status").eq("event_id", t.event_id),
    ]);
    if (!ev) return json({ error: "job_not_found" }, 404);
    const job: HubJob = { id: ev.id, company_id: ev.company_id, title: ev.title, address: ev.address, start_at: ev.start_time, end_at: ev.end_time, status: ev.status, deleted_at: ev.deleted_at };
    // Simulation as if the global gate were opened ONLY for this target's mailbox, always dry-run.
    const plan = planJobDays({ job, blocks: (blocks ?? []) as any, assignees: (rows ?? []).map((r: any) => ({ technician_id: r.technician_id, email: r.technicians?.email ?? null })),
      appLinks: ((appLinks ?? []) as any[]).filter((l) => l.work_date), legacyLinks: (legacy ?? []) as any, targets: [t],
      flags: { enabled: true, dryRun: true, scopeVerified: true, pilotMailboxes: [t.mailbox] }, now });
    // Read-only "what if the job were active" comparison; never used for any gate or write.
    const hypo = planJobDays({ job: { ...job, status: "scheduled" }, blocks: (blocks ?? []) as any, assignees: (rows ?? []).map((r: any) => ({ technician_id: r.technician_id, email: r.technicians?.email ?? null })),
      appLinks: ((appLinks ?? []) as any[]).filter((l) => l.work_date), legacyLinks: (legacy ?? []) as any, targets: [t],
      flags: { enabled: true, dryRun: true, scopeVerified: true, pilotMailboxes: [t.mailbox] }, now });
    const { data: gs } = await admin.from("job_outlook_app_sync_settings").select("enabled,dry_run,pilot_mailboxes,scope_verified_at").eq("id", true).maybeSingle();
    const global = { enabled: !!gs?.enabled, dry_run: gs?.dry_run !== false, scope_verified: !!gs?.scope_verified_at, mailbox_allowed: ((gs?.pilot_mailboxes ?? []) as string[]).map((m) => m.toLowerCase()).includes(t.mailbox.toLowerCase()) };
    const days = plan.map((r) => ({ job_status: ev.status ?? null, what_if_active: hypo.find((h) => h.technicianId === r.technicianId && h.workDate === r.workDate)?.decision.kind ?? null, technician_id: r.technicianId, technician_name: current.technicians.find(x => x.id === r.technicianId)?.name ?? "Montør", work_date: r.workDate, start_at: r.startAt, end_at: r.endAt, in_pilot: !r.gate, gate: r.gate, decision: r.decision.kind, reason: (r.decision as any).reason ?? null }));
    await audit("simulate", { days: days.length, writable: days.filter((d) => d.in_pilot && d.decision !== "skip").length, job_status: ev.status ?? null }, { target_id: t.id });
    return json({ ok: true, simulation: true, days, global });
  }

  if (action === "release_queue") {
    // No staff write authorization has been granted. Holding even direct API calls is intentional.
    return json({ error: "separate_write_approval_required" }, 409);
  }

  return json({ error: "invalid_action" }, 400);
});
