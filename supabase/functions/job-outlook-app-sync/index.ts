// CENTRAL app-only project-job -> Outlook calendar sync. Feature flag default OFF, dry_run default ON,
// requires recorded calendar-only scope verification and pilot mailbox allow-list. Uses a DEDICATED
// calendar app identity (HUB_CALENDAR_*); never falls back to the mail/Postkontoret app or user tokens.
// Never creates jobs, never adds attendees, bounded batches, one attempt per queue item.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { isSystemCaller } from "../_shared/system-caller.ts";
import { CENTRAL_LIFECYCLE_APPROVED, syncDaily, type DailyScope, type DailyGraph } from "../_shared/central-calendar-lifecycle.ts";
import { centralCalendarStore } from "../_shared/central-calendar-store.ts";
import { osloDayWindow } from "../_shared/job-calendar-one-shot.ts";
import { clampBatch, type AppFlags, type HubJob } from "../_shared/job-outlook-app-core.ts";
import { planJobDays, effectiveAction, isReleasedQueueItem, type PilotTarget } from "../_shared/job-outlook-app-days.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f-]{36}$/i;

async function getCalendarAppToken(): Promise<string | null> {
  const tenant = Deno.env.get("HUB_CALENDAR_TENANT_ID");
  const id = Deno.env.get("HUB_CALENDAR_CLIENT_ID");
  const secret = Deno.env.get("HUB_CALENDAR_CLIENT_SECRET");
  if (!tenant || !id || !secret) return null; // dedicated identity not configured => fail closed
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }),
  });
  if (!res.ok) { console.error("[job-outlook-app-sync] token failed", res.status); return null; }
  return (await res.json()).access_token ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!;
  const sb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (!(await isSystemCaller(sb as never, url, Deno.env.get("SUPABASE_ANON_KEY")!, req.headers.get("Authorization")))) {
    return json({ error: "system_caller_rejected", stage: "auth" }, 401);
  }
  let body: { action?: string; event_id?: string; technician_id?: string; limit?: number };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const action = body.action ?? "sync_event";
  if (action !== "sync_event" && action !== "drain_queue") return json({ error: "invalid_action" }, 400);
  if (action === "sync_event" && (!body.event_id || !UUID.test(body.event_id))) return json({ error: "event_id must be uuid" }, 400);

  if (!CENTRAL_LIFECYCLE_APPROVED) return json({ status: "activation_required", writes_enabled: false, no_queue_replay: true });
  if (body.technician_id !== undefined && !UUID.test(body.technician_id)) return json({error:"invalid_technician_id"},400);
  const { data: s } = await sb.from("job_outlook_app_sync_settings").select("*").eq("id", true).maybeSingle();
  const flags: AppFlags = { enabled: !!s?.enabled, dryRun: s?.dry_run !== false, pilotMailboxes: s?.pilot_mailboxes ?? [], scopeVerified: !!s?.scope_verified_at };
  // Explicit audited per-mailbox (or all-active) activations; empty => nothing ever reaches Graph.
  const { data: actRows, error: actError } = await sb.from("central_calendar_activations").select("company_id,scope,technician_id,mailbox,effective_from").is("revoked_at", null);
  if (actError) return json({ status: "activation_read_failed" });
  const activations = (actRows ?? []) as { company_id: string; scope: string; technician_id: string | null; mailbox: string | null; effective_from: string }[];
  if (!flags.enabled && activations.length === 0) return json({ status: "not_activated" }); // no job reads, no network
  if (!flags.scopeVerified && activations.length === 0) return json({ status: "scope_not_verified" });
  if (action === "drain_queue" && activations.length > 0 && !flags.enabled) return json({ status: "queue_never_replayed" });
  const activeFor = (company: string, tech: string, mailbox: string | null, day: string) => activations.some((a) =>
    a.company_id === company && (a.scope === "all_active" || (a.technician_id === tech && a.mailbox === (mailbox ?? "").toLowerCase())) &&
    day >= new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date(a.effective_from)));
  let token: string | null = null;
  const now = new Date();
  const { data: targetRows } = await sb.from("job_outlook_app_pilot_targets").select("*").is("revoked_at", null);
  const targets = (targetRows ?? []) as PilotTarget[];

  // One Outlook event per (job, technician, Oslo work date). Every day passes flags + exact pilot target gate.
  const syncOne = async (eventId: string, onlyTech?: string) => {
    const { data: ev, error: eventError } = await sb.from("events").select("id,company_id,title,address,start_time,end_time,status,deleted_at,project_type,job_number,internal_number,description,site_contact_name,site_contact_phone").eq("id", eventId).maybeSingle();
    if (eventError) return [{ status: "authoritative_read_failed" }];
    if (!ev) return [{ status: "not_found" }];
    // Resource Plan tasks/appointments are ordinary assignments too; activation + exact DB claim gate them.
    const job: HubJob = { ...ev, id: ev.id, company_id: ev.company_id, title: ev.title, address: ev.address, start_at: ev.start_time, end_at: ev.end_time, status: ev.status, deleted_at: ev.deleted_at };
    const [{ data: rows, error: assignmentError }, { data: blocks, error: blockError }, { data: appLinks, error: linkError }, { data: legacy, error: legacyError }] = await Promise.all([
      sb.from("event_technicians").select("technician_id, calendar_event_id, technicians(email)").eq("event_id", eventId),
      sb.from("schedule_blocks").select("technician_id,start_at,end_at").eq("project_id", eventId).is("deleted_at", null),
      sb.from("job_outlook_app_links").select("*").eq("event_id", eventId),
      sb.from("job_calendar_day_links").select("id,technician_id,work_date,start_at,end_at,outlook_event_id,status").eq("event_id", eventId),
    ]);
    if (assignmentError || blockError || linkError || legacyError) return [{ status: "authoritative_read_failed" }];
    const plan = planJobDays({
      job, blocks: (blocks ?? []) as any, assignees: (rows ?? []).map((r: any) => ({ technician_id: r.technician_id, email: r.technicians?.email ?? null })),
      appLinks: ((appLinks ?? []) as any[]).filter((l) => l.work_date), legacyLinks: (legacy ?? []) as any, targets, flags, now, onlyTechnicianId: onlyTech,
    });
    const { data: reviews } = await sb.from("central_calendar_conflict_reviews").select("technician_id,work_date,signature").eq("event_id", eventId).not("approved_at", "is", null);
    const out: unknown[] = [];
    for (const row of plan) {
      const activated = !!row.mailbox && activeFor(ev.company_id, row.technicianId, row.mailbox, row.workDate);
      // Activated mailbox: per-mailbox gate replaces target/dry-run; the atomic DB claim re-checks it (no backfill).
      const eff = activated ? effectiveAction({ ...row, gate: null } as any, false) : effectiveAction(row, flags.dryRun);
      const base = { technician_id: row.technicianId, work_date: row.workDate };
      if (eff === "none") { out.push({ ...base, status: (row.decision as any).reason }); continue; }
      if (eff === "blocked") { out.push({ ...base, status: row.gate }); continue; }
      // A delegated single-event copy without a day link cannot be matched safely: never create a second copy.
      const delegatedCopy = (rows ?? []).some((r: any) => r.technician_id === row.technicianId && r.calendar_event_id);
      if (row.decision.kind === "create" && delegatedCopy && !(legacy ?? []).some((l: any) => l.technician_id === row.technicianId && l.work_date === row.workDate)) {
        out.push({ ...base, status: "delegated_copy_exists_reconcile_required" }); continue;
      }
      const log = (act: string, detail: unknown) => sb.from("job_outlook_app_log").insert({ link_id: row.link?.id, company_id: ev.company_id, event_id: eventId, technician_id: row.technicianId, mailbox: row.mailbox, direction: "outbound", action: act, dry_run: flags.dryRun, detail: { work_date: row.workDate, ...(detail as object) } });
      if (eff === "dry_run") { await log(`would_${row.decision.kind}`, {}); out.push({ ...base, status: `dry_run_${row.decision.kind}` }); continue; }
      const d = row.decision;
      // Legacy delegated copies are never silently promoted into central ownership.
      if (d.kind === "adopt") { out.push({ ...base, status: "delegated_copy_requires_verified_adoption" }); continue; }
      if (!row.mailbox || !row.startAt && d.kind !== "delete" || !row.endAt && d.kind !== "delete") { out.push({...base,status:"invalid_scope"}); continue; }
      token ??= await getCalendarAppToken();
      if (!token) { out.push({...base,status:"calendar_app_unconfigured"}); continue; }
      const scope: DailyScope = {eventId, technicianId:row.technicianId, companyId:ev.company_id,mailbox:row.mailbox,workDate:row.workDate,start:row.startAt ?? `${row.workDate}T00:00:00Z`,end:row.endAt ?? `${row.workDate}T23:59:59Z`,key:row.dedupKey ?? ""};
      const w=osloDayWindow(row.workDate);
      const viewPath=`/v1.0/users/${encodeURIComponent(row.mailbox)}/calendarView?startDateTime=${w.start}&endDateTime=${w.end}&$select=id,changeKey,transactionId,start,end,showAs,isCancelled,type,isAllDay,body,subject,attendees&$top=100`;
      const graph: DailyGraph=async(method,path,payload,ifMatch)=>{
        const res=await fetch(`https://graph.microsoft.com${path}`,{method,signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json",Prefer:'outlook.timezone="UTC", IdType="ImmutableId"',...(ifMatch?{"If-Match":ifMatch}:{})},body:payload?JSON.stringify(payload):undefined});
        const text=await res.text();let data=null;try{data=text?JSON.parse(text):null;}catch{}return{status:res.status,data};
      };
      const version=d.kind==="delete"?row.link?.hub_version ?? null:d.fingerprint;
      const copy=row.link?.outlook_event_id && row.link.outlook_change_key?{id:row.link.outlook_event_id,changeKey:row.link.outlook_change_key,source:row.link.adopted_from_day_link_id?"delegated" as const:"central" as const}:null;
      const result=await syncDaily({scope,kind:d.kind,payload:d.kind==="delete"?{}:d.payload,copy,viewPath,graph,store:centralCalendarStore(sb,scope,version),authorized:true,conflictConsent:false,approvedConflictSignatures:(reviews??[]).filter((r:any)=>r.technician_id===row.technicianId&&String(r.work_date)===row.workDate).map((r:any)=>r.signature),operationKey:`${scope.key}:${d.kind}:${version ?? copy?.changeKey ?? "none"}`});
      if (result.state==="known_conflict_consent_required" && (result as any).signature) {
        await sb.from("central_calendar_conflict_reviews").upsert({company_id:ev.company_id,event_id:eventId,technician_id:row.technicianId,mailbox:row.mailbox,work_date:row.workDate,signature:(result as any).signature,summary:(result as any).diagnosis?.conflicts ?? []},{onConflict:"event_id,technician_id,work_date,signature",ignoreDuplicates:true});
      }
      await log("daily_lifecycle",{state:result.state});out.push({...base,status:result.state});
    }
    return out;
  };


  if (action === "sync_event") {
    const results = await syncOne(body.event_id!, body.technician_id);
    return json({ status: results.length > 0 && results.every((r: any) => r.status === "verified") ? "verified" : "pending", dry_run: flags.dryRun, results });
  }

  // Only explicitly released intents are ever drained. Held (released_at null) intents are never touched.
  const { data: items } = await sb.from("job_outlook_app_queue").select("*").eq("status", "pending").not("released_at", "is", null).order("created_at").limit(clampBatch(body.limit));
  if (flags.dryRun) return json({ status: "ok", dry_run: true, would_process: (items ?? []).map((i: any) => i.id) });
  const results: unknown[] = [];
  for (const it of items ?? []) {
    if (!isReleasedQueueItem(it as any)) continue;
    const { data: claimed } = await sb.from("job_outlook_app_queue").update({ status: "processing", attempts: it.attempts + 1 }).eq("id", it.id).eq("status", "pending").select("id").maybeSingle();
    if (!claimed) continue;
    const r = await syncOne(it.event_id, it.technician_id);
    const ok = r.every((x: any) => ["create", "update", "delete", "adopted", "unchanged", "nothing_to_delete"].includes(x.status));
    await sb.from("job_outlook_app_queue").update({ status: ok ? "done" : "failed", result: JSON.stringify(r).slice(0, 500), processed_at: new Date().toISOString() }).eq("id", it.id);
    await sb.from("job_outlook_app_log").insert({ event_id: it.event_id, technician_id: it.technician_id, direction: "queue", action: ok ? "processed" : "failed", dry_run: flags.dryRun, detail: r });
    results.push({ queue_id: it.id, ok, r });
  }
  return json({ status: "ok", dry_run: flags.dryRun, processed: results.length, results });
});
