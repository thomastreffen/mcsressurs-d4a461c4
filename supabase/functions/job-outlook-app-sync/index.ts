// CENTRAL app-only project-job -> Outlook calendar sync. Feature flag default OFF, dry_run default ON,
// requires recorded calendar-only scope verification and pilot mailbox allow-list. Uses a DEDICATED
// calendar app identity (HUB_CALENDAR_*); never falls back to the mail/Postkontoret app or user tokens.
// Never creates jobs, never adds attendees, bounded batches, one attempt per queue item.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { isSystemCaller } from "../_shared/system-caller.ts";
import {
  jobGate, planJobOutbound, jobDedupKey, canProcessQueueItem, clampBatch, type AppFlags, type HubJob,
} from "../_shared/job-outlook-app-core.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f-]{36}$/i;

async function getCalendarAppToken(): Promise<string | null> {
  const tenant = Deno.env.get("HUB_CALENDAR_TENANT_ID") ?? Deno.env.get("AZURE_TENANT_ID");
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
  const syncOne = async (eventId: string, onlyTech?: string) => {
    const { data: ev } = await sb.from("events").select("id,company_id,title,address,start_time,end_time,status,deleted_at,project_type").eq("id", eventId).maybeSingle();
    if (!ev) return [{ status: "not_found" }];
    if (ev.project_type === "task") return [{ status: "not_a_project_job" }]; // tasks use hub-appointment-outlook-sync
    const job: HubJob = { id: ev.id, company_id: ev.company_id, title: ev.title, address: ev.address, start_at: ev.start_time, end_at: ev.end_time, status: ev.status, deleted_at: ev.deleted_at };
    const { data: rows } = await sb.from("event_technicians").select("technician_id, technicians(id,email)").eq("event_id", eventId);
    const assignedIds = new Set((rows ?? []).map((r: any) => r.technician_id));
    const { data: existing } = await sb.from("job_outlook_app_links").select("*").eq("event_id", eventId);
    const targets = new Map<string, string>();
    for (const r of rows ?? []) if ((r as any).technicians?.email) targets.set((r as any).technician_id, (r as any).technicians.email.toLowerCase());
    for (const l of existing ?? []) if (!targets.has(l.technician_id)) targets.set(l.technician_id, l.mailbox); // removed => delete
    const out: unknown[] = [];
    for (const [techId, mailbox] of targets) {
      if (onlyTech && techId !== onlyTech) continue;
      const blocked = jobGate(flags, mailbox);
      if (blocked) { out.push({ technician_id: techId, status: blocked }); continue; }
      const key = jobDedupKey(eventId, techId, mailbox);
      const link = (existing ?? []).find((l: any) => l.dedup_key === key) ?? null;
      const plan = planJobOutbound(job, link, techId, mailbox, assignedIds.has(techId));
      const log = (act: string, detail: unknown) => sb.from("job_outlook_app_log").insert({ link_id: link?.id, company_id: ev.company_id, event_id: eventId, technician_id: techId, mailbox, direction: "outbound", action: act, dry_run: flags.dryRun, detail });
      if (plan.kind === "skip") { out.push({ technician_id: techId, status: plan.reason }); continue; }
      if (flags.dryRun) { await log(`would_${plan.kind}`, { fingerprint: plan.fingerprint }); out.push({ technician_id: techId, status: `dry_run_${plan.kind}` }); continue; }
      token ??= await getCalendarAppToken();
      if (!token) { out.push({ technician_id: techId, status: "calendar_app_unconfigured" }); continue; }
      const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/events`;
      const target = plan.kind === "create" ? base : `${base}/${encodeURIComponent(link!.outlook_event_id!)}`;
      const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
      if (plan.kind === "update" && link?.outlook_change_key) headers["If-Match"] = link.outlook_change_key;
      const res = await fetch(target, { method: plan.kind === "create" ? "POST" : plan.kind === "update" ? "PATCH" : "DELETE", headers, body: plan.payload ? JSON.stringify(plan.payload) : undefined });
      const text = await res.text();
      const now = new Date().toISOString();
      const attempts = (link?.attempt_count ?? 0) + 1;
      if (!res.ok && !(plan.kind === "delete" && res.status === 404)) {
        const state = res.status === 412 ? "conflict" : "failed"; // changeKey mismatch => edited in Outlook, never overwrite
        await sb.from("job_outlook_app_links").upsert({ company_id: ev.company_id, event_id: eventId, technician_id: techId, mailbox, dedup_key: key, outlook_event_id: link?.outlook_event_id ?? null, state, last_error: `${res.status}: ${text.slice(0, 300)}`, attempt_count: attempts, last_attempt_at: now, updated_at: now }, { onConflict: "dedup_key" });
        await log(`${plan.kind}_failed`, { status: res.status });
        out.push({ technician_id: techId, status: state, code: res.status }); continue;
      }
      const g = text ? JSON.parse(text) : {};
      await sb.from("job_outlook_app_links").upsert({ company_id: ev.company_id, event_id: eventId, technician_id: techId, mailbox, dedup_key: key, outlook_event_id: plan.kind === "delete" ? link?.outlook_event_id : g.id ?? link?.outlook_event_id, outlook_change_key: g.changeKey ?? link?.outlook_change_key ?? null, hub_version: plan.fingerprint, state: plan.kind === "delete" ? "deleted" : "synced", last_error: null, attempt_count: attempts, last_attempt_at: now, updated_at: now }, { onConflict: "dedup_key" });
      await log(plan.kind, { status: res.status });
      out.push({ technician_id: techId, status: plan.kind });
    }
    return out;
  };

  if (action === "sync_event") return json({ status: "ok", dry_run: flags.dryRun, results: await syncOne(body.event_id!) });

  const { data: items } = await sb.from("job_outlook_app_queue").select("*").eq("status", "pending").order("created_at").limit(clampBatch(body.limit));
  // Dry-run never consumes one-time queue items.
  if (flags.dryRun) return json({ status: "ok", dry_run: true, would_process: (items ?? []).map((i: any) => i.id) });
  const results: unknown[] = [];
  for (const it of items ?? []) {
    if (!canProcessQueueItem(it)) continue;
    // Atomic claim: only one worker can move pending -> processing.
    const { data: claimed } = await sb.from("job_outlook_app_queue").update({ status: "processing", attempts: it.attempts + 1 }).eq("id", it.id).eq("status", "pending").select("id").maybeSingle();
    if (!claimed) continue;
    const r = await syncOne(it.event_id, it.technician_id);
    const ok = r.every((x: any) => ["create", "update", "delete", "unchanged", "nothing_to_delete"].includes(x.status) || String(x.status).startsWith("dry_run_"));
    await sb.from("job_outlook_app_queue").update({ status: ok ? "done" : "failed", result: JSON.stringify(r).slice(0, 500), processed_at: new Date().toISOString() }).eq("id", it.id);
    await sb.from("job_outlook_app_log").insert({ event_id: it.event_id, technician_id: it.technician_id, direction: "queue", action: ok ? "processed" : "failed", dry_run: flags.dryRun, detail: r });
    results.push({ queue_id: it.id, ok, r });
  }
  return json({ status: "ok", dry_run: flags.dryRun, processed: results.length, results });
});
