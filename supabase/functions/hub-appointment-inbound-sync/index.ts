// Outlook -> Hub for Hub-created appointments/tasks (app-only Graph). Feature flag default OFF,
// inbound_enabled default OFF, dry_run default ON. Never touches project jobs, customers, economy or
// documentation. Cancellations and unsupported variants become conflicts for a planner, never silent
// overwrites. One bounded batch per call (no mass sync).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { isSystemCaller } from "../_shared/system-caller.ts";
import { getAppToken } from "../_shared/m365-sender.ts";
import {
  classifyGraphEvent, decideInbound, buildSnapshot, hubFingerprint,
  type HubAppointment, type GraphEventShape,
} from "../_shared/hub-outlook-sync-core.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const BATCH = 25;
const SELECT = "id,subject,start,end,changeKey,isCancelled,isAllDay,type,seriesMasterId";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!;
  const sb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (!(await isSystemCaller(sb as never, url, Deno.env.get("SUPABASE_ANON_KEY")!, req.headers.get("Authorization")))) {
    return json({ error: "unauthorized" }, 401);
  }

  const { data: s } = await sb.from("hub_outlook_sync_settings").select("*").eq("id", true).maybeSingle();
  const enabled = !!s?.enabled && !!s?.inbound_enabled;
  const dryRun = s?.dry_run !== false;
  if (!enabled) return json({ status: "flag_off" }); // no DB reads of links, no network

  const { data: links } = await sb
    .from("hub_outlook_event_links")
    .select("*")
    .in("state", ["synced", "conflict"])
    .not("outlook_event_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(BATCH);
  if (!links?.length) return json({ status: "ok", dry_run: dryRun, processed: 0 });

  const token = await getAppToken();
  if (!token) return json({ error: "system_sender_unavailable" }, 503);

  const results: unknown[] = [];
  for (const link of links) {
    const log = (action: string, detail: unknown) =>
      sb.from("hub_outlook_sync_log").insert({ link_id: link.id, company_id: link.company_id, task_id: link.task_id, mailbox: link.mailbox, direction: "inbound", action, dry_run: dryRun, detail });

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(link.mailbox)}/events/${encodeURIComponent(link.outlook_event_id)}?$select=${SELECT}`,
      { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' } },
    );

    if (res.status === 404) {
      // The Outlook copy vanished. The Hub task is never deleted; the link is closed and logged.
      if (!dryRun) {
        await sb.from("hub_outlook_event_links").update({ state: "deleted", last_error: null, updated_at: new Date().toISOString() }).eq("id", link.id);
      }
      await log("outlook_copy_missing", {});
      results.push({ link_id: link.id, status: "outlook_copy_missing" });
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      await log("graph_error", { status: res.status, body: text.slice(0, 300) });
      results.push({ link_id: link.id, status: "graph_error", code: res.status });
      continue;
    }

    const ev = (await res.json()) as GraphEventShape;
    const cls = classifyGraphEvent(ev);
    if (cls.kind === "blocked") {
      // Unsupported variant (recurring, all-day, invalid times): flag for a planner, change nothing.
      if (!dryRun && link.state !== "conflict") {
        await sb.from("hub_outlook_event_links").update({ state: "conflict", conflict_reason: cls.reason, updated_at: new Date().toISOString() }).eq("id", link.id);
      }
      await log("blocked", { reason: cls.reason });
      results.push({ link_id: link.id, status: "blocked", reason: cls.reason });
      continue;
    }

    const { data: task } = await sb.from("tasks").select("id,company_id,title,description,planned_start_at,planned_end_at,status,updated_at").eq("id", link.task_id).maybeSingle();
    if (!task) {
      await log("task_missing", {});
      results.push({ link_id: link.id, status: "task_missing" });
      continue;
    }
    const appt: HubAppointment = { ...task, start_at: task.planned_start_at, end_at: task.planned_end_at };
    const decision = decideInbound(appt, link, cls.change);

    if (decision.kind === "noop") {
      results.push({ link_id: link.id, status: "noop" });
      continue;
    }

    if (decision.kind === "apply_to_hub") {
      const next = { ...appt, title: decision.fields.title, start_at: decision.fields.start_at, end_at: decision.fields.end_at };
      if (dryRun) {
        await log("would_apply", { fields: decision.fields });
        results.push({ link_id: link.id, status: "dry_run_apply" });
        continue;
      }
      await sb.from("tasks").update({ title: decision.fields.title, planned_start_at: decision.fields.start_at, planned_end_at: decision.fields.end_at, updated_at: new Date().toISOString() }).eq("id", task.id).eq("company_id", link.company_id);
      await sb.from("hub_outlook_event_links").update({ state: "synced", hub_version: hubFingerprint(next), outlook_change_key: cls.change.outlook_change_key, conflict_reason: null, outlook_snapshot: null, last_error: null, updated_at: new Date().toISOString() }).eq("id", link.id);
      await log("applied", { fields: decision.fields });
      results.push({ link_id: link.id, status: "applied" });
      continue;
    }

    // mark_cancelled and conflict both require a planner's decision; nothing is overwritten silently.
    const reason = decision.kind === "mark_cancelled" ? "cancelled_in_outlook" : decision.reason;
    const snapshot = decision.kind === "conflict" ? buildSnapshot(cls.change, appt) : null;
    if (dryRun) {
      await log("would_conflict", { reason });
      results.push({ link_id: link.id, status: "dry_run_conflict", reason });
      continue;
    }
    await sb.from("hub_outlook_event_links").update({ state: "conflict", conflict_reason: reason, outlook_snapshot: snapshot, outlook_change_key: cls.change.outlook_change_key, updated_at: new Date().toISOString() }).eq("id", link.id);
    await log("conflict", { reason });
    results.push({ link_id: link.id, status: "conflict", reason });
  }
  return json({ status: "ok", dry_run: dryRun, processed: links.length, results });
});
