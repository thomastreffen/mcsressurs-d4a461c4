// CENTRAL app-only project-job -> Outlook calendar sync. Feature flag default OFF, dry_run default ON,
// requires recorded calendar-only scope verification and pilot mailbox allow-list. Uses a DEDICATED
// calendar app identity (HUB_CALENDAR_*); never falls back to the mail/Postkontoret app or user tokens.
// Never creates jobs, never adds attendees, bounded batches, one attempt per queue item.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { isSystemCaller } from "../_shared/system-caller.ts";
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
    return json({ error: "unauthorized" }, 401);
  }
  let body: { action?: string; event_id?: string; limit?: number };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const action = body.action ?? "sync_event";
  if (action !== "sync_event" && action !== "drain_queue") return json({ error: "invalid_action" }, 400);
  if (action === "sync_event" && (!body.event_id || !UUID.test(body.event_id))) return json({ error: "event_id must be uuid" }, 400);

  const { data: s } = await sb.from("job_outlook_app_sync_settings").select("*").eq("id", true).maybeSingle();
  const flags: AppFlags = { enabled: !!s?.enabled, dryRun: s?.dry_run !== false, pilotMailboxes: s?.pilot_mailboxes ?? [], scopeVerified: !!s?.scope_verified_at };
  if (!flags.enabled) return json({ status: "flag_off" }); // no job reads, no network
  if (!flags.scopeVerified) return json({ status: "scope_not_verified" });
  let token: string | null = null;
  const now = new Date();
  const { data: targetRows } = await sb.from("job_outlook_app_pilot_targets").select("*").is("revoked_at", null);
  const targets = (targetRows ?? []) as PilotTarget[];

  // One Outlook event per (job, technician, Oslo work date). Every day passes flags + exact pilot target gate.
  const syncOne = async (eventId: string, onlyTech?: string) => {
    const { data: ev } = await sb.from("events").select("id,company_id,title,address,start_time,end_time,status,deleted_at,project_type").eq("id", eventId).maybeSingle();
    if (!ev) return [{ status: "not_found" }];
    if (ev.project_type === "task") return [{ status: "not_a_project_job" }];
    const job: HubJob = { id: ev.id, company_id: ev.company_id, title: ev.title, address: ev.address, start_at: ev.start_time, end_at: ev.end_time, status: ev.status, deleted_at: ev.deleted_at };
    const [{ data: rows }, { data: blocks }, { data: appLinks }, { data: legacy }] = await Promise.all([
      sb.from("event_technicians").select("technician_id, technicians(email)").eq("event_id", eventId),
      sb.from("schedule_blocks").select("technician_id,start_at,end_at").eq("project_id", eventId).is("deleted_at", null),
      sb.from("job_outlook_app_links").select("*").eq("event_id", eventId),
      sb.from("job_calendar_day_links").select("id,technician_id,work_date,start_at,end_at,outlook_event_id,status").eq("event_id", eventId),
    ]);
    const plan = planJobDays({
      job, blocks: (blocks ?? []) as any, assignees: (rows ?? []).map((r: any) => ({ technician_id: r.technician_id, email: r.technicians?.email ?? null })),
      appLinks: ((appLinks ?? []) as any[]).filter((l) => l.work_date), legacyLinks: (legacy ?? []) as any, targets, flags, now, onlyTechnicianId: onlyTech,
    });
    const out: unknown[] = [];
    for (const row of plan) {
      const eff = effectiveAction(row, flags.dryRun);
      const base = { technician_id: row.technicianId, work_date: row.workDate };
      if (eff === "none") { out.push({ ...base, status: (row.decision as any).reason }); continue; }
      if (eff === "blocked") { out.push({ ...base, status: row.gate }); continue; }
      const log = (act: string, detail: unknown) => sb.from("job_outlook_app_log").insert({ link_id: row.link?.id, company_id: ev.company_id, event_id: eventId, technician_id: row.technicianId, mailbox: row.mailbox, direction: "outbound", action: act, dry_run: flags.dryRun, detail: { work_date: row.workDate, ...(detail as object) } });
      if (eff === "dry_run") { await log(`would_${row.decision.kind}`, {}); out.push({ ...base, status: `dry_run_${row.decision.kind}` }); continue; }
      const nowIso = new Date().toISOString();
      const linkBase = { company_id: ev.company_id, event_id: eventId, technician_id: row.technicianId, mailbox: row.mailbox!, work_date: row.workDate, dedup_key: row.dedupKey ?? row.link!.dedup_key };
      const d = row.decision;
      if (d.kind === "adopt") {
        await sb.from("job_outlook_app_links").upsert({ ...linkBase, outlook_event_id: d.outlookEventId, hub_version: d.fingerprint, state: "synced", adopted_from_day_link_id: d.legacyId, last_error: null, updated_at: nowIso }, { onConflict: "dedup_key" });
        await log("adopt", {}); out.push({ ...base, status: "adopted" }); continue;
      }
      token ??= await getCalendarAppToken();
      if (!token) { out.push({ ...base, status: "calendar_app_unconfigured" }); continue; }
      const coll = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(row.mailbox!)}/events`;
      const evId = d.kind === "create" ? null : d.kind === "delete" ? d.outlookEventId : row.link!.outlook_event_id!;
      const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
      if (d.kind === "update" && row.link?.outlook_change_key) headers["If-Match"] = row.link.outlook_change_key;
      const res = await fetch(evId ? `${coll}/${encodeURIComponent(evId)}` : coll, { method: d.kind === "create" ? "POST" : d.kind === "update" ? "PATCH" : "DELETE", headers, body: d.kind === "create" || d.kind === "update" ? JSON.stringify(d.payload) : undefined });
      const text = await res.text();
      if (!res.ok && !(d.kind === "delete" && res.status === 404)) {
        const state = res.status === 412 ? "conflict" : "failed";
        await sb.from("job_outlook_app_links").upsert({ ...linkBase, outlook_event_id: row.link?.outlook_event_id ?? null, state, last_error: `${res.status}`, last_attempt_at: nowIso, updated_at: nowIso }, { onConflict: "dedup_key" });
        await log(`${d.kind}_failed`, { status: res.status }); out.push({ ...base, status: state, code: res.status }); continue;
      }
      const g = text ? JSON.parse(text) : {};
      await sb.from("job_outlook_app_links").upsert({ ...linkBase, outlook_event_id: d.kind === "delete" ? evId : g.id ?? row.link?.outlook_event_id, outlook_change_key: g.changeKey ?? row.link?.outlook_change_key ?? null, hub_version: d.kind === "delete" ? row.link?.hub_version : d.fingerprint, state: d.kind === "delete" ? "deleted" : "synced", last_error: null, last_attempt_at: nowIso, updated_at: nowIso }, { onConflict: "dedup_key" });
      await log(d.kind, { status: res.status }); out.push({ ...base, status: d.kind });
    }
    return out;
  };

  if (action === "sync_event") return json({ status: "ok", dry_run: flags.dryRun, results: await syncOne(body.event_id!) });

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
