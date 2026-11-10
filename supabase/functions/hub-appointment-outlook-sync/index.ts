// Hub appointment/task -> Outlook (app-only Graph). Feature flag default OFF + dry_run default ON.
// Never creates project jobs, never adds attendees (no invitations), one task per call (no mass sync).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { isSystemCaller } from "../_shared/system-caller.ts";
import { getAppToken } from "../_shared/m365-sender.ts";
import { gate, planOutbound, dedupKey, type HubAppointment, type SyncFlags } from "../_shared/hub-outlook-sync-core.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f-]{36}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!;
  const sb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (!(await isSystemCaller(sb as never, url, Deno.env.get("SUPABASE_ANON_KEY")!, req.headers.get("Authorization")))) {
    return json({ error: "unauthorized" }, 401);
  }
  let body: { task_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!body.task_id || !UUID.test(body.task_id)) return json({ error: "task_id must be uuid" }, 400);

  const { data: s } = await sb.from("hub_outlook_sync_settings").select("*").eq("id", true).maybeSingle();
  const flags: SyncFlags = { enabled: !!s?.enabled, dryRun: s?.dry_run !== false, pilotMailboxes: s?.pilot_mailboxes ?? [] };
  if (!flags.enabled) return json({ status: "flag_off" }); // no DB reads of tasks, no network

  const { data: task } = await sb.from("tasks").select("id,company_id,title,description,planned_start_at,planned_end_at,status,updated_at").eq("id", body.task_id).maybeSingle();
  if (!task) return json({ error: "not_found" }, 404);
  const appt: HubAppointment = { ...task, start_at: task.planned_start_at, end_at: task.planned_end_at };
  const { data: assignees } = await sb.from("task_assignees").select("user_id").eq("task_id", task.id).is("removed_at", null);

  const results: unknown[] = [];
  let token: string | null = null;
  for (const a of assignees ?? []) {
    const { data: u } = await sb.auth.admin.getUserById(a.user_id);
    const mailbox = u?.user?.email?.toLowerCase();
    if (!mailbox) { results.push({ user_id: a.user_id, status: "no_mailbox" }); continue; }
    const blocked = gate(flags, mailbox);
    if (blocked) { results.push({ mailbox, status: blocked }); continue; }
    const key = dedupKey(task.id, mailbox);
    const { data: link } = await sb.from("hub_outlook_event_links").select("*").eq("dedup_key", key).maybeSingle();
    const action = planOutbound(appt, link, mailbox);
    const log = (act: string, detail: unknown) => sb.from("hub_outlook_sync_log").insert({ link_id: link?.id, company_id: task.company_id, task_id: task.id, mailbox, direction: "outbound", action: act, dry_run: flags.dryRun, detail });
    if (action.kind === "skip") { results.push({ mailbox, status: action.reason }); continue; }
    if (flags.dryRun) { await log(`would_${action.kind}`, { fingerprint: action.fingerprint }); results.push({ mailbox, status: `dry_run_${action.kind}` }); continue; }

    token ??= await getAppToken();
    if (!token) { results.push({ mailbox, status: "system_sender_unavailable" }); continue; }
    const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/events`;
    const target = action.kind === "create" ? base : `${base}/${encodeURIComponent(link!.outlook_event_id!)}`;
    const method = action.kind === "create" ? "POST" : action.kind === "update" ? "PATCH" : "DELETE";
    const res = await fetch(target, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: action.payload ? JSON.stringify(action.payload) : undefined });
    const text = await res.text();
    if (!res.ok) {
      await sb.from("hub_outlook_event_links").upsert({ company_id: task.company_id, task_id: task.id, mailbox, dedup_key: key, state: "failed", last_error: `${res.status}: ${text.slice(0, 500)}`, last_attempt_at: new Date().toISOString() }, { onConflict: "dedup_key" });
      await log(`${action.kind}_failed`, { status: res.status });
      results.push({ mailbox, status: "graph_error", code: res.status }); continue;
    }
    const ev = text ? JSON.parse(text) : {};
    await sb.from("hub_outlook_event_links").upsert({ company_id: task.company_id, task_id: task.id, mailbox, dedup_key: key, outlook_event_id: action.kind === "delete" ? link?.outlook_event_id : ev.id ?? link?.outlook_event_id, outlook_change_key: ev.changeKey ?? null, hub_version: action.fingerprint, state: action.kind === "delete" ? "deleted" : "synced", last_error: null, last_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "dedup_key" });
    await log(action.kind, { status: res.status });
    results.push({ mailbox, status: action.kind });
  }
  return json({ status: "ok", dry_run: flags.dryRun, results });
});
