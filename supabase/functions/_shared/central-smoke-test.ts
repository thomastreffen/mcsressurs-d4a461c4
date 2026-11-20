// Isolated central calendar API smoke test: one neutral "MCS Hub systemtest" event in ONE activated
// mailbox, using the same app-only identity, payload builder and readback verifier as ordinary
// assignments. Lifecycle: free-slot GET -> POST -> GET verify -> PATCH -> GET -> DELETE -> GET 404.
// This proves the central Graph API path only, NOT the Ressursplan trigger/dispatch pipeline.
import { buildDayPayload } from "./job-outlook-app-days.ts";
import { dailyCollection, dailyGet, dailyVerification, type DailyGraph, type DailyScope } from "./central-calendar-lifecycle.ts";

export const SMOKE_SUBJECT = "MCS Hub systemtest – ikke en jobb";
export const smokePhrase = (mailbox: string) => `SYSTEMTEST KALENDER ${mailbox.trim().toLowerCase()}`;
export const smokeTxId = (runId: string) => `mcs-smoke-${runId}`;

export type SmokeStep = { step: string; http: number | null; ok: boolean; detail?: Record<string, unknown> };
export type SmokeResult = { pass: boolean; failed_step: string | null; graph_event_id: string | null; transaction_id: string; stranded: boolean; steps: SmokeStep[] };

export function validSmokeSlot(startISO: string, endISO: string, now: Date): string | null {
  const s = Date.parse(startISO), e = Date.parse(endISO);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return "invalid_slot";
  if (s < now.getTime() + 60 * 60_000) return "slot_must_start_at_least_1h_ahead";
  if (s > now.getTime() + 30 * 86400_000) return "slot_within_30_days";
  const m = (e - s) / 60_000;
  if (m < 15 || m > 60) return "slot_15_to_60_minutes";
  return null;
}

const overlaps = (ev: any, s: number, e: number) => {
  const a = Date.parse(String(ev?.start?.dateTime ?? "") + (String(ev?.start?.dateTime ?? "").endsWith("Z") ? "" : "Z"));
  const b = Date.parse(String(ev?.end?.dateTime ?? "") + (String(ev?.end?.dateTime ?? "").endsWith("Z") ? "" : "Z"));
  return ev?.isCancelled !== true && Number.isFinite(a) && Number.isFinite(b) && a < e && b > s;
};

export function smokePayload(runId: string, technicianId: string, startISO: string, endISO: string) {
  const workDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date(startISO));
  const p = buildDayPayload({ id: `smoke-${runId}`, title: SMOKE_SUBJECT, address: null } as any,
    { technicianId, workDate, startAt: startISO, endAt: endISO, operationKey: smokeTxId(runId) } as any, smokeTxId(runId)) as Record<string, any>;
  return { ...p, showAs: "free", isReminderOn: false, categories: ["MCS", "MCS systemtest"],
    body: { contentType: "HTML", content: `<p>Automatisk systemtest fra MCS Hub. Slettes automatisk. Ingen jobb, ingen invitasjon.</p><!-- MCS_SMOKE_TEST:${runId} -->` } };
}

export async function runSmokeTest(graph: DailyGraph, x: { runId: string; mailbox: string; technicianId: string; companyId: string; start: string; end: string; onStep?: (s: SmokeStep) => Promise<void> }): Promise<SmokeResult> {
  const steps: SmokeStep[] = [];
  const tx = smokeTxId(x.runId);
  let id: string | null = null, changeKey: string | null = null, created = false;
  const push = async (s: SmokeStep) => { steps.push(s); await x.onStep?.(s); return s.ok; };
  const done = (failed: string | null): SmokeResult => ({ pass: failed === null, failed_step: failed, graph_event_id: id, transaction_id: tx, stranded: created && failed !== null && !steps.some(s => s.step === "verify_deleted" && s.ok), steps });
  const scope: DailyScope = { eventId: `smoke-${x.runId}`, technicianId: x.technicianId, companyId: x.companyId, mailbox: x.mailbox, workDate: "", start: x.start, end: x.end, key: tx };
  const payload = smokePayload(x.runId, x.technicianId, x.start, x.end);
  const s = Date.parse(x.start), e = Date.parse(x.end);
  // 1. Slot must be free (only status is kept; no calendar content leaves the server).
  const view = await graph("GET", `/v1.0/users/${encodeURIComponent(x.mailbox)}/calendarView?startDateTime=${new Date(s).toISOString()}&endDateTime=${new Date(e).toISOString()}&$select=start,end,isCancelled&$top=50`);
  const busy = view.status === 200 && Array.isArray(view.data?.value) ? view.data.value.filter((v: any) => overlaps(v, s, e)).length : null;
  if (!await push({ step: "slot_free_get", http: view.status, ok: view.status === 200 && busy === 0, detail: { overlapping: busy } })) return done("slot_free_get");
  // 2. Create via the same collection and payload shape as ordinary assignments.
  let post: { status: number; data: any };
  try { post = await graph("POST", dailyCollection(scope), payload); } catch { post = { status: 0, data: null }; }
  if (post.status === 201 && typeof post.data?.id === "string") { id = post.data.id; changeKey = post.data.changeKey ?? null; created = true; }
  if (!await push({ step: "create_post", http: post.status, ok: created, detail: { graph_event_id: id, transaction_id: tx } })) {
    // Unknown outcome: look it up by transactionId so nothing is left stranded unseen. Never re-POST.
    const find = await graph("GET", `/v1.0/users/${encodeURIComponent(x.mailbox)}/calendarView?startDateTime=${new Date(s).toISOString()}&endDateTime=${new Date(e).toISOString()}&$select=id,transactionId&$top=50`).catch(() => ({ status: 0, data: null }));
    const hit = find.status === 200 ? (find.data?.value ?? []).find((v: any) => v.transactionId === tx) : null;
    if (hit) { id = hit.id; created = true; }
    await push({ step: "create_reconcile_get", http: find.status, ok: !!hit, detail: { found: !!hit, graph_event_id: id } });
    return done("create_post");
  }
  // 3. Exact readback with the ordinary verifier (identity via Graph id/transactionId, not HTML markers).
  const g1 = await graph("GET", dailyGet(scope, id!));
  const v1 = g1.status === 200 ? dailyVerification(g1.data, scope, { graphId: id, payload }) : null;
  if (g1.status === 200) changeKey = g1.data?.changeKey ?? changeKey;
  if (!await push({ step: "verify_get", http: g1.status, ok: !!v1?.ok, detail: { checks: v1?.checks ?? null } })) return cleanup("verify_get");
  // 4. Update exactly this event (If-Match).
  const newSubject = `${SMOKE_SUBJECT} (endret)`;
  const pa = await graph("PATCH", `${dailyCollection(scope)}/${encodeURIComponent(id!)}`, { subject: newSubject }, changeKey ?? undefined);
  if (pa.status === 200) changeKey = pa.data?.changeKey ?? changeKey;
  if (!await push({ step: "update_patch", http: pa.status, ok: pa.status === 200 })) return cleanup("update_patch");
  const g2 = await graph("GET", dailyGet(scope, id!));
  if (g2.status === 200) changeKey = g2.data?.changeKey ?? changeKey;
  if (!await push({ step: "verify_update_get", http: g2.status, ok: g2.status === 200 && g2.data?.subject === newSubject && g2.data?.transactionId === tx })) return cleanup("verify_update_get");
  return cleanup(null);

  async function cleanup(failed: string | null): Promise<SmokeResult> {
    const d = await graph("DELETE", `${dailyCollection(scope)}/${encodeURIComponent(id!)}`, undefined, changeKey ?? undefined).catch(() => ({ status: 0, data: null }));
    const delOk = d.status === 204 || d.status === 200;
    await push({ step: "delete", http: d.status, ok: delOk });
    const g3 = await graph("GET", dailyGet(scope, id!)).catch(() => ({ status: 0, data: null }));
    const gone = await push({ step: "verify_deleted", http: g3.status, ok: g3.status === 404 });
    return done(failed ?? (delOk && gone ? null : delOk ? "verify_deleted" : "delete"));
  }
}

/** Explicit cleanup of a stranded smoke event: only the exact stored id whose transactionId and subject match. */
export async function cleanupSmokeEvent(graph: DailyGraph, x: { runId: string; mailbox: string; graphEventId: string }) {
  const scope = { mailbox: x.mailbox } as DailyScope;
  const g = await graph("GET", dailyGet(scope, x.graphEventId));
  if (g.status === 404) return { ok: true, already_gone: true, http: 404 };
  if (g.status !== 200 || g.data?.transactionId !== smokeTxId(x.runId) || !String(g.data?.subject ?? "").startsWith(SMOKE_SUBJECT)) return { ok: false, reason: "not_own_smoke_event", http: g.status };
  const d = await graph("DELETE", `${dailyCollection(scope)}/${encodeURIComponent(x.graphEventId)}`, undefined, g.data?.changeKey);
  const g2 = await graph("GET", dailyGet(scope, x.graphEventId));
  return { ok: (d.status === 204 || d.status === 200) && g2.status === 404, http: d.status, verify_http: g2.status };
}
