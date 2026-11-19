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
import { invokeCentralSync, centralEnv } from "../_shared/central-sync-invoke.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireGlobalAccessManager } from "../_shared/security-boundary.ts";
import { probeCalendarMailbox } from "../_shared/calendar-mailbox-probe.ts";
import { diagnosticGate } from "../_shared/hub-calendar-write-pilot-core.ts";
import { missingSecrets } from "../_shared/hub-calendar-diagnostics-core.ts";
import type { HubJob } from "../_shared/job-outlook-app-core.ts";
import { pilotChoices, freshMailboxProbe, existingTargetDecision, activeIdentity, mailboxReadiness, type IdentityFacts } from "../_shared/job-outlook-pilot-selector.ts";
import { planJobDays, clampTargetHours, type PilotTarget } from "../_shared/job-outlook-app-days.ts";
import { CENTRAL_LIFECYCLE_APPROVED, previewDaily, type DailyGraph, type DailyScope } from "../_shared/central-calendar-lifecycle.ts";
import { osloDayWindow } from "../_shared/job-calendar-one-shot.ts";
import { buildDayPayload, jobDayDedupKey } from "../_shared/job-outlook-app-days.ts";

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
  if (action === "enable_rollout") return json({ error: "separate_live_activation_approval_required", writes_enabled: false, no_queue_replay: true }, 409);

  if (action === "rollout_preflight") {
    const eventId = b.event_id, techId = b.technician_id, day = b.work_date;
    if (typeof eventId !== "string" || !UUID.test(eventId) || typeof techId !== "string" || !UUID.test(techId) || typeof day !== "string" || !DATE.test(day)) return json({error:"invalid_input"},400);
    // Selection never saves or enables a target. The current administrator explicitly initiates this GET.
    const {data: job,error:je}=await uc.from("events").select("*").eq("id",eventId).maybeSingle();
    if(je || !job?.company_id) return json({error:"job_not_visible"},403);
    const rights=await uc.rpc("has_company_access",{_uid:caller,_company:job.company_id,_module:"resource_plan",_level:"edit"});
    if(rights.error || rights.data!==true) return json({error:"company_edit_required"},403);
    const choice=await choicesFor(eventId);const person=choice.technicians.find(x=>x.id===techId);const selected=person?.days.find(x=>x.work_date===day);
    if(!selected || Date.parse(selected.start_at)<=now.getTime())return json({error:"active_future_assignment_required"},409);
    const tech=await admin.from("technicians").select("email").eq("id",techId).maybeSingle();
    const mb=tech.data?.email?.trim().toLowerCase();if(tech.error || !mb)return json({error:"mailbox_unverified"},409);
    const link=await admin.from("job_outlook_app_links").select("outlook_event_id,outlook_change_key,adopted_from_day_link_id").eq("event_id",eventId).eq("technician_id",techId).eq("company_id",job.company_id).eq("mailbox",mb).eq("work_date",day).maybeSingle();
    if(link.error)return json({error:"copy_lookup_failed"},409);
    const copy=link.data?.outlook_event_id && link.data.outlook_change_key?{id:link.data.outlook_event_id,changeKey:link.data.outlook_change_key,source:link.data.adopted_from_day_link_id?"delegated" as const:"central" as const}:null;
    const scope:DailyScope={eventId,technicianId:techId,companyId:job.company_id,mailbox:mb,workDate:day,start:selected.start_at,end:selected.end_at,key:jobDayDedupKey(eventId,techId,day,mb)};
    const payload=buildDayPayload({...job,start_at:job.start_time,end_at:job.end_time},{technicianId:techId,workDate:day,startAt:selected.start_at,endAt:selected.end_at,operationKey:scope.key},scope.key);
    const env=(n:string)=>Deno.env.get(n)?.trim()??"";
    if(missingSecrets(env).length)return json({error:"calendar_app_not_configured"},409);
    try {
      const tr=await fetch(`https://login.microsoftonline.com/${encodeURIComponent(env("HUB_CALENDAR_TENANT_ID"))}/oauth2/v2.0/token`,{method:"POST",signal:AbortSignal.timeout(15000),body:new URLSearchParams({client_id:env("HUB_CALENDAR_CLIENT_ID"),client_secret:env("HUB_CALENDAR_CLIENT_SECRET"),grant_type:"client_credentials",scope:"https://graph.microsoft.com/.default"})});
      if(!tr.ok)return json({error:"calendar_token_failed"},409);
      const token=(await tr.json()).access_token;
      const facts=JSON.parse(atob(String(token).split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
      if(facts.tid!==env("HUB_CALENDAR_TENANT_ID")||(facts.appid??facts.azp)!==env("HUB_CALENDAR_CLIENT_ID")||env("HUB_CALENDAR_CLIENT_ID")===env("AZURE_CLIENT_ID")||(Array.isArray(facts.roles)&&facts.roles.some((r:string)=>!['Calendars.Read','Calendars.ReadWrite'].includes(r))))return json({error:"calendar_identity_unverified"},409);
      const graph:DailyGraph=async(method,path)=>{if(method!=="GET")throw Error("read_only");const r=await fetch(`https://graph.microsoft.com${path}`,{method:"GET",signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${token}`,Prefer:'outlook.timezone="UTC", IdType="ImmutableId"'}});return{status:r.status,data:await r.json().catch(()=>null)};};
      const w=osloDayWindow(day);const result=await previewDaily(graph,scope,`/v1.0/users/${encodeURIComponent(mb)}/calendarView?startDateTime=${w.start}&endDateTime=${w.end}&$select=id,changeKey,transactionId,start,end,showAs,isCancelled,type,isAllDay,body,subject,attendees&$top=100`,payload,copy);
      return json({read_only:true,mailbox:mb,work_date:day,existing_central_copy:!!copy,blocked:result.blocked,diagnosis:result.diagnosis,writes_enabled:CENTRAL_LIFECYCLE_APPROVED,no_queue_replay:true});
    }catch{return json({error:"calendar_read_failed",read_only:true,graph_write_attempted:false},409);}
  }

  const loadTarget = async (id: unknown) => {
    if (typeof id !== "string" || !UUID.test(id)) return null;
    const { data } = await admin.from("job_outlook_app_pilot_targets").select("*").eq("id", id).maybeSingle();
    return data as (PilotTarget & { id: string }) | null;
  };

  const latestProbe = async (id: string) => {
    const { data } = await admin.from("job_outlook_app_pilot_actions").select("created_at,result").eq("target_id", id).eq("action", "probe_mailbox").order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data;
  };
  // Live identity facts per technician for one company (read-only).
  const identities = async (techIds: string[], companyId: string): Promise<Map<string, IdentityFacts>> => {
    const out = new Map<string, IdentityFacts>();
    if (!techIds.length) return out;
    const { data: techs } = await admin.from("technicians").select("id,user_id,email,archived_at,deleted_at").in("id", techIds);
    const users = (techs ?? []).map((t: any) => t.user_id).filter(Boolean);
    const { data: accts } = users.length ? await admin.from("user_accounts").select("auth_user_id,person_id,is_active").in("auth_user_id", users).eq("is_active", true).not("verified_at", "is", null) : { data: [] as any[] };
    const persons = (accts ?? []).map((a: any) => a.person_id);
    const [{ data: ppl }, { data: emp }] = persons.length ? await Promise.all([
      admin.from("people").select("id,is_active").in("id", persons),
      admin.from("employment_profiles").select("person_id").in("person_id", persons).eq("company_id", companyId).eq("relationship_type", "employee").is("archived_at", null),
    ]) : [{ data: [] as any[] }, { data: [] as any[] }];
    for (const t of techs ?? []) {
      const a = (accts ?? []).find((x: any) => x.auth_user_id === t.user_id);
      out.set(t.id, { technician_id: t.id, archived: !!t.archived_at, deleted: !!t.deleted_at, account_active: !!a, person_active: !!a && !!(ppl ?? []).find((p: any) => p.id === a.person_id)?.is_active, employed_in_company: !!a && (emp ?? []).some((e: any) => e.person_id === a.person_id), mailbox: (t.email ?? "").trim().toLowerCase() });
    }
    return out;
  };
  const choicesFor = async (eventId: string) => {
    const [{ data: ev }, { data: rows }, { data: blocks }, { data: links }] = await Promise.all([
      admin.from("events").select("id,company_id,deleted_at,project_type,title,project_number").eq("id", eventId).maybeSingle(),
      admin.from("event_technicians").select("technician_id,technicians(name,email,deleted_at,archived_at)").eq("event_id", eventId),
      admin.from("schedule_blocks").select("company_id,technician_id,start_at,end_at,source,deleted_at").eq("project_id", eventId).is("deleted_at", null),
      admin.from("job_calendar_day_links").select("technician_id,work_date,status,outlook_event_id").eq("event_id", eventId),
    ]);
    if (!ev) return { job: ev, technicians: [] };
    const ids = await identities((rows ?? []).map((r: any) => r.technician_id), ev.company_id);
    // Former employees / inactive logins never appear and can never be confirmed.
    const eligible = (rows ?? []).filter((r: any) => { const f = ids.get(r.technician_id); return !!f && activeIdentity(f); });
    return { job: ev, technicians: pilotChoices(ev, eligible.map((r: any) => ({ technician_id: r.technician_id, ...r.technicians })), blocks ?? [], links ?? []) };
  };
  // Standalone metadata test: no target, job, day or rollout setting required/changed.
  if (action === "mailbox_candidates" || action === "probe_technician_mailbox") {
    const company = b.company_id;
    if (typeof company !== "string" || !UUID.test(company)) return json({ error: "invalid_company" }, 400);
    const rights = await uc.rpc("has_company_access", { _uid: caller, _company: company, _module: "resource_plan", _level: "edit" });
    if (rights.error || rights.data !== true) return json({ error: "company_edit_required" }, 403);
    const { data: techs, error: te } = await admin.from("technicians").select("id,name,email").is("archived_at", null).is("deleted_at", null);
    if (te) return json({ error: "identity_lookup_failed" }, 409);
    const facts = await identities((techs ?? []).map(t => t.id), company);
    // Require verified canonical account too; membership never counts as employment.
    const candidates = (techs ?? []).filter(t => { const f = facts.get(t.id); return !!f && activeIdentity(f); });
    if (action === "mailbox_candidates") return json({ read_only: true, technicians: candidates });
    if (typeof b.technician_id !== "string" || !UUID.test(b.technician_id) || b.confirm_read_only !== true) return json({ error: "invalid_input" }, 400);
    const chosen = candidates.find(t => t.id === b.technician_id);
    if (!chosen) return json({ error: "inactive_or_former_employee" }, 409);
    const mailbox = chosen.email.trim().toLowerCase();
    const context = { company_id: company, technician_id: chosen.id, mailbox, read_only: true, writes_enabled: false, no_queue_replay: true };
    const { data: diag, error: de } = await admin.from("hub_calendar_diagnostic_runs").select("run_at,overall,checks").order("run_at", { ascending: false }).limit(1).maybeSingle();
    const scopeDenied = de ? "scope_lookup_failed" : diagnosticGate(diag, now);
    const { data: last, error: le } = await admin.from("job_outlook_app_pilot_actions").select("created_at").in("action", ["probe_mailbox", "probe_technician_mailbox_started"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (le) return json({ error: "audit_lookup_failed" }, 409);
    if (last && now.getTime() - Date.parse(last.created_at) < PROBE_COOLDOWN_MS) return json({ error: "cooldown" }, 429);
    // Mandatory pre-GET audit: if audit storage fails, Microsoft is never contacted.
    const operation = crypto.randomUUID();
    const started = await audit("probe_technician_mailbox_started", { ...context, scope_gate: scopeDenied ?? "passed" }, { idempotency_key: operation });
    if (started.error) return json({ error: "audit_required", graph_read_attempted: false }, 409);
    const result = scopeDenied ? { ...context, pass: false, step: "scope", reason: scopeDenied } : { ...context, ...await probeCalendarMailbox(mailbox, n => Deno.env.get(n)) };
    const finished = await audit("probe_technician_mailbox", result, { idempotency_key: operation });
    if (finished.error) return json({ error: "audit_result_failed", result, audit_complete: false }, 409);
    return json({ ok: true, result, audit_complete: true, rollout_approved: false });
  }
  // Exact operator-authorized retry for ONE activated technician on ONE already-assigned job day. Never other recipients.
  if (action === "central_pending" || action === "retry_central_assignment") {
    const company = b.company_id;
    if (typeof company !== "string" || !UUID.test(company)) return json({ error: "invalid_company" }, 400);
    const rights = await uc.rpc("has_company_access", { _uid: caller, _company: company, _module: "resource_plan", _level: "edit" });
    if (rights.error || rights.data !== true) return json({ error: "company_edit_required" }, 403);
    const { data: acts, error: ae } = await admin.from("central_calendar_activations").select("scope,technician_id,mailbox").eq("company_id", company).is("revoked_at", null);
    if (ae) return json({ error: "activation_read_failed" }, 409);
    const { data: pend, error: pe } = await admin.from("event_recipient_delivery").select("event_id,technician_id,recipient_email,reason_code").eq("channel", "calendar").neq("status", "sent").like("reason_code", "central_%");
    if (pe) return json({ error: "delivery_read_failed" }, 409);
    const rows: any[] = [];
    for (const p of pend ?? []) {
      const { data: ev } = await admin.from("events").select("id,title,company_id,deleted_at,start_time,job_number,internal_number").eq("id", p.event_id).maybeSingle();
      if (!ev || ev.company_id !== company || ev.deleted_at) continue;
      const mailbox = String(p.recipient_email ?? "").trim().toLowerCase();
      if (!(acts ?? []).some((a: any) => a.scope === "all_active" || (a.technician_id === p.technician_id && a.mailbox === mailbox))) continue;
      const { data: et } = await admin.from("event_technicians").select("technician_id").eq("event_id", p.event_id).eq("technician_id", p.technician_id).maybeSingle();
      if (!et) continue;
      const live = (await identities([p.technician_id], company)).get(p.technician_id);
      if (!live || !activeIdentity(live)) continue;
      const { data: done } = await admin.from("job_outlook_app_links").select("id").eq("event_id", p.event_id).eq("technician_id", p.technician_id).not("outlook_event_id", "is", null).limit(1);
      if (done?.length) continue;
      rows.push({ event_id: p.event_id, technician_id: p.technician_id, mailbox, title: ev.title, job_number: ev.job_number ?? ev.internal_number, start_time: ev.start_time, reason_code: p.reason_code, phrase: `KJØR KALENDER ${mailbox} ${p.event_id.slice(0, 8)}` });
    }
    if (action === "central_pending") return json({ read_only: true, pending: rows });
    const row = rows.find((r) => r.event_id === b.event_id && r.technician_id === b.technician_id);
    if (!row) return json({ error: "not_pending_or_not_activated" }, 409);
    if (b.phrase !== row.phrase) return json({ error: "exact_phrase_required" }, 400);
    const operation = `retry:${row.event_id}:${row.technician_id}`;
    const started = await audit("retry_central_assignment_started", { event_id: row.event_id, technician_id: row.technician_id, mailbox: row.mailbox }, { idempotency_key: operation + ":" + now.toISOString() });
    if (started.error) return json({ error: "audit_failed_no_microsoft_call" }, 409);
    // Only this technician; the daily claim/duplicate guard decides create vs reconcile, never a blind repost.
    const r = await invokeCentralSync({ action: "sync_event", event_id: row.event_id, technician_id: row.technician_id }, centralEnv());
    await audit("retry_central_assignment", { http_status: r.http_status, stage: r.stage, result: r.ok ? r.data : null, error: r.ok ? null : r.stage });
    const st = r.ok ? (r.data?.results?.[0]?.status ?? r.data?.status ?? "no_result") : r.stage;
    await admin.from("event_recipient_delivery").update({ status: st === "verified" ? "sent" : "pending", reason_code: st === "verified" ? "central_verified_readback" : `central_${String(st).slice(0, 60)}` }).eq("event_id", row.event_id).eq("technician_id", row.technician_id).eq("channel", "calendar");
    return json({ status: st, stage: r.stage, http_status: r.http_status });
  }
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

  if (action === "readiness") {
    // Read-only overview: active technicians with planned future job days, per mailbox and day. No Graph call, no writes.
    const horizon = new Date(now.getTime() + 60 * 86_400_000).toISOString();
    const { data: blocks, error } = await admin.from("schedule_blocks").select("project_id,technician_id,company_id,start_at,end_at").eq("source", "manual").is("deleted_at", null).not("project_id", "is", null).gte("start_at", now.toISOString()).lt("start_at", horizon).limit(2000);
    if (error) return json({ error: "lookup_failed" }, 500);
    const byCompany = new Map<string, Set<string>>();
    for (const bl of blocks ?? []) { if (!byCompany.has(bl.company_id)) byCompany.set(bl.company_id, new Set()); byCompany.get(bl.company_id)!.add(bl.technician_id); }
    const idMaps = await Promise.all([...byCompany].map(async ([c, t]) => [c, await identities([...t], c)] as const));
    const idByCompany = new Map(idMaps);
    const [{ data: targets }, { data: links }, { data: names }] = await Promise.all([
      admin.from("job_outlook_app_pilot_targets").select("id,event_id,technician_id,work_date,mailbox").is("revoked_at", null).gt("expires_at", now.toISOString()),
      admin.from("job_calendar_day_links").select("event_id,technician_id,work_date,status,outlook_event_id").gte("work_date", now.toISOString().slice(0, 10)),
      admin.from("technicians").select("id,name").in("id", [...new Set((blocks ?? []).map((b: any) => b.technician_id))]),
    ]);
    const evIds = [...new Set((blocks ?? []).map((b: any) => b.project_id))];
    const { data: deliveries } = evIds.length ? await admin.from("event_recipient_delivery").select("event_id,technician_id,channel,status,graph_status").in("event_id", evIds) : { data: [] as any[] };
    const { data: jobs } = evIds.length ? await admin.from("events").select("id,title,project_number").in("id", evIds) : { data: [] as any[] };
    const osloDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date(iso));
    const rows: any[] = [];
    let excluded = 0;
    for (const bl of blocks ?? []) {
      const f = idByCompany.get(bl.company_id)?.get(bl.technician_id);
      if (!f || !activeIdentity(f)) { excluded++; continue; }
      const day = osloDate(bl.start_at);
      const tgt = (targets ?? []).find((t: any) => t.event_id === bl.project_id && t.technician_id === bl.technician_id && t.work_date === day);
      const link = (links ?? []).find((l: any) => l.event_id === bl.project_id && l.technician_id === bl.technician_id && l.work_date === day);
      rows.push({ event_id: bl.project_id, technician_id: bl.technician_id, technician_name: (names ?? []).find((n: any) => n.id === bl.technician_id)?.name ?? null, mailbox: f.mailbox, work_date: day,
        calendar: link?.outlook_event_id ? (link.status === "synced" ? "in_outlook" : "needs_check") : "not_in_outlook",
        job: (jobs ?? []).find((j: any) => j.id === bl.project_id) ?? null,
        // E-mail is a separate outcome; Graph 202 = accepted by Microsoft, never "delivered".
        email: (() => { const d = (deliveries ?? []).find((x: any) => x.event_id === bl.project_id && x.technician_id === bl.technician_id && x.channel === "email"); return d ? (d.status === "sent" ? "accepted_by_microsoft" : d.status) : "none"; })(),
        central: mailboxReadiness(tgt ? await latestProbe(tgt.id) : null, !!tgt, now) });
    }
    rows.sort((a, b) => a.work_date.localeCompare(b.work_date) || String(a.technician_name).localeCompare(String(b.technician_name)));
    return json({ read_only: true, rows: rows.slice(0, 300), excluded_inactive_or_former: excluded, note: "Hver postkasse trenger egen lesetest; én godkjent postkasse beviser ikke en annen." });
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
    // choicesFor already filtered on active identity; re-check explicitly so a stale UI can never select a former employee.
    const live = (await identities([techId], ev.company_id)).get(techId);
    if (!live || !activeIdentity(live)) return json({ error: "inactive_or_former_employee" }, 409);
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
    const result = await probeCalendarMailbox(t.mailbox, env);
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
