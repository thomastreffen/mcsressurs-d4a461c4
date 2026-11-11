import { describe, it, expect } from "vitest";
import {
  dayOperationKey, aggregateTechDayDelivery, missingDayItems, buildPerDayPlan,
  type DayLinkRow,
} from "../../supabase/functions/_shared/multi-day-calendar";
import { syncTechnicianDays, type DayStore, type DayGraph } from "../../supabase/functions/_shared/multi-day-sync";
import { calendarResultToDelivery } from "../../supabase/functions/_shared/recipient-delivery";
import { buildMissingDaysReceipt } from "@/lib/day-calendar-receipt";
import { queueLine, deliveryLabel } from "@/components/RecipientDeliveryStatus";

// Mock of job 60570's shape – no production data, no network.
const EVENT = "evt-mock";
const EMIL = "tech-emil";
const block = (tech: string, day: string, start = "07:00", end = "15:00") => ({
  technician_id: tech, start_at: `${day}T${start}:00.000Z`, end_at: `${day}T${end}:00.000Z`,
});
const blocks = [block(EMIL, "2026-11-19"), block(EMIL, "2026-11-20")];
const day19Synced: DayLinkRow = {
  technician_id: EMIL, work_date: "2026-11-19",
  start_at: "2026-11-19T07:00:00.000Z", end_at: "2026-11-19T15:00:00.000Z",
  outlook_event_id: "legacy-adopted", status: "synced",
};

function memStore(initial: DayLinkRow[]) {
  const rows = initial.map((l) => ({ ...l, idempotency_key: dayOperationKey(EVENT, l.technician_id, l.work_date) }));
  const store: DayStore = {
    async listLinks(_e, t) { return rows.filter((r) => r.technician_id === t); },
    async claimCreate(_e, item) {
      const ex = rows.find((r) => r.idempotency_key === item.operationKey);
      if (!ex) { rows.push({ technician_id: item.technicianId, work_date: item.workDate, start_at: item.startAt, end_at: item.endAt, outlook_event_id: null, status: "pending", idempotency_key: item.operationKey }); return "claimed"; }
      if (ex.outlook_event_id) return "exists";
      if (ex.status === "pending") return "in_progress";
      ex.status = "pending"; return "claimed";
    },
    async markSynced(_e, item, id) { const r = rows.find((x) => x.idempotency_key === item.operationKey)!; r.outlook_event_id = id; r.status = "synced"; },
    async markFailed(_e, item, err) { const r = rows.find((x) => x.idempotency_key === item.operationKey)!; r.status = "failed"; r.last_error = err; },
    async releaseClaim() {},
    async removeLink(_e, link) { const i = rows.findIndex((x) => x.work_date === link.work_date && x.technician_id === link.technician_id); if (i >= 0) rows.splice(i, 1); },
  };
  return { store, rows };
}
function memGraph(failOn: string[] = []) {
  const calls: { op: string; date?: string }[] = [];
  const graph: DayGraph = {
    async createEvent(_e, body: any) {
      const date = body?.start?.dateTime?.slice(0, 10);
      calls.push({ op: "create", date });
      if (failOn.includes(date)) throw { status: 500 };
      return { id: `graph-${date}` };
    },
    async updateEvent() { calls.push({ op: "update" }); },
    async deleteEvent() { calls.push({ op: "delete" }); },
  };
  return { graph, calls };
}
const buildBody = (item: any) => ({ start: { dateTime: item.startAt } });
const run = (store: DayStore, graph: DayGraph, extra: object, b = blocks) =>
  syncTechnicianDays({ eventId: EVENT, technicianId: EMIL, email: "emil@x", blocks: b, action: "update", store, graph, buildBody, ...extra });

describe("60570 diagnosis: Oppdater Outlook (update_only) can never create day 2", () => {
  it("update_only leaves 20 Nov as venter and makes zero Graph calls", async () => {
    const { store, rows } = memStore([day19Synced]);
    const { graph, calls } = memGraph();
    const res = await run(store, graph, { updateOnly: true });
    expect(calls).toHaveLength(0);
    expect(res.find((r) => r.workDate === "2026-11-20")?.state).toBe("venter");
    expect(rows).toHaveLength(1);
  });
});

describe("Opprett manglende kalenderdager (createMissingOnly)", () => {
  it("creates exactly the missing 20 Nov event, never touches 19 Nov", async () => {
    const { store, rows } = memStore([day19Synced]);
    const { graph, calls } = memGraph();
    const res = await syncTechnicianDays({ eventId: EVENT, technicianId: EMIL, email: "emil@x", blocks, action: "create", createMissingOnly: true, store, graph, buildBody });
    expect(calls).toEqual([{ op: "create", date: "2026-11-20" }]);
    expect(res.map((r) => [r.workDate, r.state])).toEqual([["2026-11-19", "synket"], ["2026-11-20", "synket"]]);
    expect(rows.find((r) => r.work_date === "2026-11-20")?.idempotency_key).toBe(`calday:${EVENT}:${EMIL}:2026-11-20`);
  });

  it("replay / double click after success performs no Graph writes", async () => {
    const { store } = memStore([day19Synced]);
    const { graph, calls } = memGraph();
    const args = { eventId: EVENT, technicianId: EMIL, email: "emil@x", blocks, action: "create" as const, createMissingOnly: true, store, graph, buildBody };
    await syncTechnicianDays(args);
    await syncTechnicianDays(args);
    expect(calls.filter((c) => c.op === "create")).toHaveLength(1);
  });

  it("concurrent click with an in-flight claim does not create a duplicate", async () => {
    const pending: DayLinkRow = { ...day19Synced, work_date: "2026-11-20", start_at: "2026-11-20T07:00:00.000Z", end_at: "2026-11-20T15:00:00.000Z", outlook_event_id: null, status: "pending" };
    const { store } = memStore([day19Synced, pending]);
    const { graph, calls } = memGraph();
    const res = await syncTechnicianDays({ eventId: EVENT, technicianId: EMIL, email: "emil@x", blocks, action: "create", createMissingOnly: true, store, graph, buildBody });
    expect(calls).toHaveLength(0);
    expect(res.find((r) => r.workDate === "2026-11-20")?.state).toBe("venter");
  });

  it("does not PATCH a changed existing day or DELETE a stale day", async () => {
    const stale: DayLinkRow = { ...day19Synced, work_date: "2026-11-18", outlook_event_id: "old" };
    const moved = { ...day19Synced, start_at: "2026-11-19T06:00:00.000Z" };
    const { store, rows } = memStore([moved, stale]);
    const { graph, calls } = memGraph();
    await syncTechnicianDays({ eventId: EVENT, technicianId: EMIL, email: "emil@x", blocks, action: "create", createMissingOnly: true, store, graph, buildBody });
    expect(calls.map((c) => c.op)).toEqual(["create"]);
    expect(rows.some((r) => r.work_date === "2026-11-18")).toBe(true);
  });

  it("Graph failure on day 2 is reported as feilet, never synket, and is retryable", async () => {
    const { store } = memStore([day19Synced]);
    const { graph } = memGraph(["2026-11-20"]);
    const args = { eventId: EVENT, technicianId: EMIL, email: "emil@x", blocks, action: "create" as const, createMissingOnly: true, store, graph, buildBody };
    const first = await syncTechnicianDays(args);
    expect(first.find((r) => r.workDate === "2026-11-20")?.state).toBe("feilet");
    const ok = memGraph();
    const second = await syncTechnicianDays({ ...args, graph: ok.graph });
    expect(second.find((r) => r.workDate === "2026-11-20")?.state).toBe("synket");
  });

  it("missingDayItems lists only days without an Outlook event", () => {
    const plan = buildPerDayPlan(EVENT, blocks);
    expect(missingDayItems(plan, [day19Synced]).map((d) => d.workDate)).toEqual(["2026-11-20"]);
  });
});

describe("technician summary row (one row per event+tech+channel)", () => {
  it("never reports sent while a day is missing – last day must not win", () => {
    expect(aggregateTechDayDelivery(["synket", "venter"])).toMatchObject({ status: "pending", reason: "missing_calendar_days" });
    expect(aggregateTechDayDelivery(["synket", "i_hub"]).status).toBe("pending");
    expect(aggregateTechDayDelivery(["synket", "synket"]).status).toBe("sent");
    expect(aggregateTechDayDelivery(["synket", "feilet"]).status).toBe("failed");
    expect(calendarResultToDelivery("missing_days")).toEqual({ status: "pending", reason: "missing_calendar_days" });
  });
  it("job card label names missing days instead of 'pågår'", () => {
    expect(deliveryLabel({ channel: "calendar", status: "pending", reason_code: "missing_calendar_days" })).toBe("Kalender: Mangler kalenderdager – se Kalenderdekning per dag");
  });
});

describe("receipt and dormant central-app intents", () => {
  it("receipt reports missing Microsoft connection as not created", () => {
    const lines = buildMissingDaysReceipt([
      { techId: EMIL, techName: "Emil", status: "created", dayResults: [{ workDate: "2026-11-19", state: "synket", outcome: "unchanged" }, { workDate: "2026-11-20", state: "synket", outcome: "created" }] },
      { techId: "m", techName: "Mats", status: "no_token" },
      { techId: "s", techName: "Solo", status: "not_applicable" },
    ]);
    expect(lines).toHaveLength(3);
    expect(lines[2]).toMatchObject({ techName: "Mats", workDate: null, tone: "fail" });
    expect(lines[2].text).toContain("ingen kalenderdag opprettet");
  });
  it("untouched queue intent is named and labelled as not activated", () => {
    expect(queueLine({ operation: "create", status: "pending", reason_code: null, attempt_count: 0 }, "Emil Strid"))
      .toBe("Emil Strid · Sentral Microsoft-kalender (opprettelse): ikke aktivert før pilot – ingenting sendes");
  });
});

describe("receipt wording: 'Opprettet' only for an actual Graph POST in this run", () => {
  const args = (store: DayStore, graph: DayGraph) => ({ eventId: EVENT, technicianId: EMIL, email: "emil@x", blocks, action: "create" as const, createMissingOnly: true, store, graph, buildBody });

  it("60570: 19 Nov already synced → 'Allerede synket', 20 Nov → 'Opprettet', exactly one POST", async () => {
    const { store } = memStore([day19Synced]);
    const { graph, calls } = memGraph();
    const res = await syncTechnicianDays(args(store, graph));
    expect(calls).toEqual([{ op: "create", date: "2026-11-20" }]);
    expect(res.map((r) => r.outcome)).toEqual(["unchanged", "created"]);
    const lines = buildMissingDaysReceipt([{ techId: EMIL, techName: "Emil", status: "created", dayResults: res }]);
    expect(lines.map((l) => l.text)).toEqual(["Allerede synket – ingen endring", "Opprettet i Outlook (hendelses-ID mottatt)"]);
  });

  it("second and third click: zero POSTs and no day reported as 'Opprettet'", async () => {
    const { store, rows } = memStore([day19Synced]);
    const { graph, calls } = memGraph();
    await syncTechnicianDays(args(store, graph));
    const r2 = await syncTechnicianDays(args(store, graph));
    const r3 = await syncTechnicianDays(args(store, graph));
    expect(calls).toHaveLength(1);
    expect(rows).toHaveLength(2);
    for (const res of [r2, r3]) {
      const texts = buildMissingDaysReceipt([{ techId: EMIL, techName: "Emil", status: "created", dayResults: res }]).map((l) => l.text);
      expect(texts).toEqual(["Allerede synket – ingen endring", "Allerede synket – ingen endring"]);
    }
  });

  it("result without outcome (older server) never claims 'Opprettet'", () => {
    const lines = buildMissingDaysReceipt([{ techId: EMIL, techName: "Emil", status: "created", dayResults: [{ workDate: "2026-11-19", state: "synket" }] }]);
    expect(lines[0].text).toBe("Allerede synket – ingen endring");
  });
});
