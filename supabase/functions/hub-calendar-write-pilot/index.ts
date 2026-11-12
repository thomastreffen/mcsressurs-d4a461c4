// ADMIN-ONLY synthetic WRITE PILOT on test-kalender@mcsservice.no ONLY (hard allowlist).
// create -> read -> patch -> read -> delete -> verify 404, with cleanup of only the event this run created.
// Never touches jobs, staff calendars, job_outlook_app_sync_settings, mail, notifications or legacy tokens.
// Never returns tokens, secrets or the Graph event id (masked flag only).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireGlobalAccessManager } from "../_shared/security-boundary.ts";
import { missingSecrets, tokenRoles } from "../_shared/hub-calendar-diagnostics-core.ts";
import {
  PILOT_MAILBOX, PILOT_SUBJECT_UPDATED, CONFIRM_PHRASE, assertPilotMailbox, pilotPath, assertPilotRequest,
  osloSlot, pilotEventBody, diagnosticGate, type PilotStep, type StepId,
} from "../_shared/hub-calendar-write-pilot-core.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: claims } = await userClient.auth.getClaims(auth.slice(7).trim());
  const callerId = claims?.claims?.sub as string | undefined;
  if (!callerId) return json({ error: "unauthorized" }, 401);
  if (!(await requireGlobalAccessManager(admin as never, callerId))) return json({ error: "forbidden" }, 403);

  let body: { action?: string; confirm?: string; idempotency_key?: string; mailbox?: string } = {};
  try { body = await req.json(); } catch { /* status */ }
  const history = async () => (await admin.from("hub_calendar_write_pilot_runs")
    .select("started_at, finished_at, overall, cleanup_state, steps, graph_event_id").order("started_at", { ascending: false }).limit(5)).data
    ?.map(({ graph_event_id, ...r }) => ({ ...r, event_id_present: !!graph_event_id })) ?? [];
  if ((body.action ?? "status") === "status") return json({ mailbox: PILOT_MAILBOX, runs: await history() });
  if (body.action !== "run") return json({ error: "invalid_action" }, 400);

  // Gates
  if (body.confirm !== CONFIRM_PHRASE) return json({ error: "confirm_required" }, 400);
  if (!body.idempotency_key || !UUID.test(body.idempotency_key)) return json({ error: "idempotency_key_required" }, 400);
  try { assertPilotMailbox(body.mailbox ?? ""); } catch { return json({ error: "mailbox_not_allowlisted" }, 400); }
  const env = (n: string) => Deno.env.get(n);
  if (missingSecrets(env).length) return json({ error: "not_configured" }, 409);
  const { data: settings } = await admin.from("job_outlook_app_sync_settings").select("enabled, dry_run, pilot_mailboxes").eq("id", true).maybeSingle();
  const pilotList: string[] = settings?.pilot_mailboxes ?? [];
  if (pilotList.some((m) => m.toLowerCase() !== PILOT_MAILBOX)) return json({ error: "foreign_pilot_mailbox_configured" }, 409);
  const { data: diag } = await admin.from("hub_calendar_diagnostic_runs").select("run_at, overall, checks").order("run_at", { ascending: false }).limit(1).maybeSingle();
  const gate = diagnosticGate(diag as never, new Date());
  if (gate) return json({ error: gate }, 409);
  const { data: running } = await admin.from("hub_calendar_write_pilot_runs").select("id").eq("overall", "running").gt("started_at", new Date(Date.now() - 10 * 60_000).toISOString()).limit(1);
  if (running?.length) return json({ error: "already_running" }, 409);

  const { data: row, error: insErr } = await admin.from("hub_calendar_write_pilot_runs")
    .insert({ idempotency_key: body.idempotency_key, run_by: callerId, mailbox: PILOT_MAILBOX }).select("id").single();
  if (insErr) return json({ error: insErr.code === "23505" ? "duplicate_run" : "audit_failed", runs: await history() }, 409);

  const steps: PilotStep[] = [];
  let eventId: string | null = null;
  let overall: "pass" | "fail" | "blocked" = "pass";
  let cleanup: "none" | "deleted" | "pending" | "failed" = "none";
  const save = (extra: Record<string, unknown> = {}) => admin.from("hub_calendar_write_pilot_runs").update({ steps, graph_event_id: eventId, overall, cleanup_state: cleanup, ...extra }).eq("id", row.id);

  const tokRes = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(env("HUB_CALENDAR_TENANT_ID")!.trim())}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env("HUB_CALENDAR_CLIENT_ID")!.trim(), client_secret: env("HUB_CALENDAR_CLIENT_SECRET")!.trim(), grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }),
  });
  const token: string | null = tokRes.ok ? (await tokRes.json()).access_token ?? null : null;
  const t = token ? tokenRoles(token) : { roles: [], appId: null };
  if (!token || t.appId !== env("HUB_CALENDAR_CLIENT_ID")!.trim() || env("HUB_CALENDAR_CLIENT_ID")!.trim() === env("AZURE_CLIENT_ID")?.trim()) {
    overall = "blocked"; await save({ finished_at: new Date().toISOString() });
    return json({ error: "app_identity_failed", runs: await history() }, 409);
  }

  const graph = async (id: StepId, label: string, method: string, path: string, expect: number[], payload?: unknown) => {
    assertPilotRequest(method, path, method === "POST" ? null : eventId);
    const res = await fetch(`https://graph.microsoft.com${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(payload ? { "Content-Type": "application/json" } : {}) }, body: payload ? JSON.stringify(payload) : undefined });
    let data: any = null; let code: string | undefined;
    try { data = res.status === 204 ? null : await res.json(); } catch { /* ignore */ }
    if (!res.ok) code = typeof data?.error?.code === "string" ? data.error.code.slice(0, 80) : undefined;
    const ok = expect.includes(res.status);
    steps.push({ id, label, method, expectStatus: expect, httpStatus: res.status, result: ok ? "pass" : "fail", graphCode: code });
    if (!ok) overall = "fail";
    return { ok, status: res.status, data };
  };

  const key = body.idempotency_key;
  const slot = osloSlot(new Date(), 7);
  const slot2 = osloSlot(new Date(), 7, 45);
  try {
    const c = await graph("create", "Opprett testavtale", "POST", pilotPath(PILOT_MAILBOX, "events"), [201], pilotEventBody(slot, key));
    eventId = typeof c.data?.id === "string" ? c.data.id : null; await save();
    if (c.ok && eventId) {
      const r1 = await graph("read_created", "Les opprettet avtale", "GET", pilotPath(PILOT_MAILBOX, "event", eventId) + "?$select=id,subject,start,end", [200]);
      if (r1.ok && r1.data?.start?.dateTime?.slice(0, 16) !== slot.start.slice(0, 16)) { steps[steps.length - 1].result = "fail"; overall = "fail"; }
      const u = await graph("update", "Endre tid og tittel", "PATCH", pilotPath(PILOT_MAILBOX, "event", eventId), [200], { subject: PILOT_SUBJECT_UPDATED, end: { dateTime: slot2.end, timeZone: "Europe/Oslo" } });
      if (u.ok) {
        const r2 = await graph("read_updated", "Les endret avtale", "GET", pilotPath(PILOT_MAILBOX, "event", eventId) + "?$select=id,subject,end", [200]);
        if (r2.ok && r2.data?.subject !== PILOT_SUBJECT_UPDATED) { steps[steps.length - 1].result = "fail"; overall = "fail"; }
      }
      const d = await graph("delete", "Slett testavtale", "DELETE", pilotPath(PILOT_MAILBOX, "event", eventId), [204]);
      if (d.ok) {
        cleanup = "deleted";
        await graph("verify_deleted", "Bekreft at avtalen er borte", "GET", pilotPath(PILOT_MAILBOX, "event", eventId) + "?$select=id", [404]);
      } else cleanup = "pending";
    } else if (c.ok) { overall = "fail"; }
  } catch (_e) { overall = "fail"; cleanup = eventId ? "pending" : "none"; }

  if (eventId && cleanup === "pending") {
    try {
      const d = await graph("cleanup", "Opprydding av egen testavtale", "DELETE", pilotPath(PILOT_MAILBOX, "event", eventId), [204, 404]);
      cleanup = d.ok ? "deleted" : "failed";
    } catch { cleanup = "failed"; }
  }
  await save({ finished_at: new Date().toISOString() });
  console.log(`[hub-calendar-write-pilot] overall=${overall} cleanup=${cleanup} steps=${steps.map((s) => `${s.id}:${s.httpStatus}`).join(",")}`);
  return json({ mailbox: PILOT_MAILBOX, run: { overall, cleanup_state: cleanup, event_id_present: !!eventId, steps }, runs: await history() });
});
