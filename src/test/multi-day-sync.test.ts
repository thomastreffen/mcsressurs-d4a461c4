import { describe, it, expect } from "vitest";
import {
  buildPerDayPlan, diffDayPlan, dayDeliveryState, aggregateDayCoverage,
  osloDayKey, dayOperationKey, formatPlannedDays,
  type DayLinkRow,
} from "../../supabase/functions/_shared/multi-day-calendar";
import { syncTechnicianDays, type DayStore, type DayGraph } from "../../supabase/functions/_shared/multi-day-sync";

const EVENT = "evt-1";
const EMIL = "tech-emil";
const MATS = "tech-mats";

// Nov 2026: Oslo = UTC+1. 07:00Z = 08:00 Oslo, 15:00Z = 16:00 Oslo.
const block = (tech: string, day: string, start = "07:00", end = "15:00") => ({
  technician_id: tech,
  start_at: `${day}T${start}:00.000Z`,
  end_at: `${day}T${end}:00.000Z`,
});

function memStore(initial: DayLinkRow[] = []) {
  const rows: (DayLinkRow & { idempotency_key: string })[] = initial.map((l) => ({
    ...l, idempotency_key: dayOperationKey(EVENT, l.technician_id, l.work_date),
  }));
  const store: DayStore = {
    async listLinks(eventId, technicianId) {
      return rows.filter((r) => r.technician_id === technicianId);
    },
    async claimCreate(eventId, item) {
      const existing = rows.find((r) => r.idempotency_key === item.operationKey);
      if (!existing) {
        rows.push({
          technician_id: item.technicianId, work_date: item.workDate,
          start_at: item.startAt, end_at: item.endAt,
          outlook_event_id: null, status: "pending", idempotency_key: item.operationKey,
        });
        return "claimed";
      }
      if (existing.outlook_event_id) return "exists";
      if (existing.status === "pending") return "in_progress";
      existing.status = "pending";
      return "claimed";
    },
    async markSynced(eventId, item, outlookEventId) {
      const r = rows.find((x) => x.idempotency_key === item.operationKey)!;
      r.outlook_event_id = outlookEventId; r.status = "synced";
      r.start_at = item.startAt; r.end_at = item.endAt;
    },
    async markFailed(eventId, item, error) {
      const r = rows.find((x) => x.idempotency_key === item.operationKey)!;
      r.status = "failed"; r.last_error = error;
    },
    async releaseClaim(eventId, item) {
      const i = rows.findIndex((x) => x.idempotency_key === item.operationKey && !x.outlook_event_id);
      if (i >= 0) rows.splice(i, 1);
    },
    async removeLink(eventId, link) {
      const i = rows.findIndex((x) => x.technician_id === link.technician_id && x.work_date === link.work_date);
      if (i >= 0) rows.splice(i, 1);
    },
  };
  return { store, rows };
}

function memGraph(failOn: string[] = []) {
  const calls: { op: string; email: string; id?: string; body?: any }[] = [];
  let seq = 0;
  const graph: DayGraph = {
    async createEvent(email, body: any) {
      calls.push({ op: "create", email, body });
      const date = body?.start?.dateTime?.slice(0, 10) ?? "";
      if (failOn.includes(date)) throw { status: 500 };
      return { id: `graph-${++seq}` };
    },
    async updateEvent(email, id, body) {
      calls.push({ op: "update", email, id, body });
    },
    async deleteEvent(email, id) {
      calls.push({ op: "delete", email, id });
    },
  };
  return { graph, calls };
}

const buildBody = (item: { workDate: string; startAt: string; endAt: string }) => ({
  subject: "Jobb",
  start: { dateTime: item.startAt, timeZone: "Europe/Oslo" },
  end: { dateTime: item.endAt, timeZone: "Europe/Oslo" },
});

describe("multi-day calendar core", () => {
  it("builds one plan item per technician × Oslo day, sorted", () => {
    const plan = buildPerDayPlan(EVENT, [
      block(MATS, "2026-11-20"), block(EMIL, "2026-11-19"),
      block(EMIL, "2026-11-20"), block(MATS, "2026-11-19"),
    ]);
    expect(plan).toHaveLength(4);
    expect(plan.map((p) => `${p.technicianId}@${p.workDate}`)).toEqual([
      `${EMIL}@2026-11-19`, `${EMIL}@2026-11-20`, `${MATS}@2026-11-19`, `${MATS}@2026-11-20`,
    ]);
  });

  it("derives Oslo day correctly across DST (summer UTC+2 vs winter UTC+1)", () => {
    // 2026-07-01T22:30Z = 00:30 Oslo 2. juli (sommertid)
    expect(osloDayKey("2026-07-01T22:30:00.000Z")).toBe("2026-07-02");
    // 2026-11-19T23:30Z = 00:30 Oslo 20. nov (vintertid)
    expect(osloDayKey("2026-11-19T23:30:00.000Z")).toBe("2026-11-20");
    expect(osloDayKey("2026-11-19T07:00:00.000Z")).toBe("2026-11-19");
  });

  it("idempotency key is deterministic per job+technician+day", () => {
    expect(dayOperationKey(EVENT, EMIL, "2026-11-19")).toBe(dayOperationKey(EVENT, EMIL, "2026-11-19"));
    expect(dayOperationKey(EVENT, EMIL, "2026-11-19")).not.toBe(dayOperationKey(EVENT, EMIL, "2026-11-20"));
  });

  it("formats all planned days for the technician e-mail", () => {
    const days = formatPlannedDays([block(EMIL, "2026-11-19"), block(MATS, "2026-11-19"), block(EMIL, "2026-11-20")]);
    expect(days).toHaveLength(2);
    expect(days[0]).toContain("19. nov");
    expect(days[0]).toContain("08:00–16:00");
    expect(days[1]).toContain("20. nov");
  });
});

describe("multi-day sync orchestration (mocked Graph)", () => {
  const twoDays = [block(EMIL, "2026-11-19"), block(EMIL, "2026-11-20")];

  it("creates one Outlook event per workday", async () => {
    const { store } = memStore();
    const { graph, calls } = memGraph();
    const res = await syncTechnicianDays({
      eventId: EVENT, technicianId: EMIL, email: "emil@mcs.no", blocks: twoDays,
      action: "create", store, graph, buildBody,
    });
    expect(calls.filter((c) => c.op === "create")).toHaveLength(2);
    expect(res.map((r) => r.state)).toEqual(["synket", "synket"]);
    expect(res[0].workDate).toBe("2026-11-19");
    expect(res[1].workDate).toBe("2026-11-20");
  });

  it("replay with unchanged plan performs no Graph writes (idempotent)", async () => {
    const { store } = memStore();
    const { graph, calls } = memGraph();
    const args = {
      eventId: EVENT, technicianId: EMIL, email: "emil@mcs.no", blocks: twoDays,
      action: "create" as const, store, graph, buildBody,
    };
    await syncTechnicianDays(args);
    const afterFirst = calls.length;
    const res = await syncTechnicianDays({ ...args, action: "update" });
    expect(calls.length).toBe(afterFirst);
    expect(res.every((r) => r.state === "synket")).toBe(true);
  });

  it("double-click: a live pending claim yields 'venter' and no duplicate Graph event", async () => {
    const pending: DayLinkRow = {
      technician_id: EMIL, work_date: "2026-11-19",
      start_at: twoDays[0].start_at, end_at: twoDays[0].end_at,
      outlook_event_id: null, status: "pending",
    };
    const { store } = memStore([pending]);
    const { graph, calls } = memGraph();
    const res = await syncTechnicianDays({
      eventId: EVENT, technicianId: EMIL, email: "emil@mcs.no", blocks: [twoDays[0]],
      action: "create", store, graph, buildBody,
    });
    expect(calls).toHaveLength(0);
    expect(res[0].state).toBe("venter");
  });

  it("date change deletes the old day and creates the new one", async () => {
    const { store } = memStore();
    const { graph, calls } = memGraph();
    await syncTechnicianDays({
      eventId: EVENT, technicianId: EMIL, email: "emil@mcs.no", blocks: twoDays,
      action: "create", store, graph, buildBody,
    });
    // Move day 2 from 20. nov to 21. nov
    const res = await syncTechnicianDays({
      eventId: EVENT, technicianId: EMIL, email: "emil@mcs.no",
      blocks: [twoDays[0], block(EMIL, "2026-11-21")],
      action: "update", store, graph, buildBody,
    });
    expect(calls.filter((c) => c.op === "delete")).toHaveLength(1);
    expect(calls.filter((c) => c.op === "create")).toHaveLength(3); // 2 initial + 1 new day
    expect(res.find((r) => r.workDate === "2026-11-21")?.state).toBe("synket");
  });

  it("time change on same day PATCHes the existing event, no duplicate", async () => {
    const { store } = memStore();
    const { graph, calls } = memGraph();
    await syncTechnicianDays({
      eventId: EVENT, technicianId: EMIL, email: "emil@mcs.no", blocks: twoDays,
      action: "create", store, graph, buildBody,
    });
    const res = await syncTechnicianDays({
      eventId: EVENT, technicianId: EMIL, email: "emil@mcs.no",
      blocks: [twoDays[0], block(EMIL, "2026-11-20", "08:00", "16:00")],
      action: "update", store, graph, buildBody,
    });
    expect(calls.filter((c) => c.op === "update")).toHaveLength(1);
    expect(calls.filter((c) => c.op === "create")).toHaveLength(2); // unchanged from initial
    expect(res.every((r) => r.state === "synket")).toBe(true);
  });

  it("technician removal deletes only that technician's day events", async () => {
    const { store, rows } = memStore();
    const { graph, calls } = memGraph();
    for (const tech of [EMIL, MATS]) {
      await syncTechnicianDays({
        eventId: EVENT, technicianId: tech, email: `${tech}@mcs.no`, blocks: twoDays.map((b) => ({ ...b, technician_id: tech })),
        action: "create", store, graph, buildBody,
      });
    }
    // Mats is removed from the plan: his blocks are gone
    const res = await syncTechnicianDays({
      eventId: EVENT, technicianId: MATS, email: `${MATS}@mcs.no`, blocks: [],
      action: "update", store, graph, buildBody,
    });
    expect(calls.filter((c) => c.op === "delete" && c.email === `${MATS}@mcs.no`)).toHaveLength(2);
    expect(rows.filter((r) => r.technician_id === MATS)).toHaveLength(0);
    expect(rows.filter((r) => r.technician_id === EMIL)).toHaveLength(2);
    expect(res).toHaveLength(0);
  });

  it("partial failure: one failing day is 'feilet', the other still syncs", async () => {
    const { store } = memStore();
    const { graph } = memGraph(["2026-11-20"]); // day 2 fails
    const res = await syncTechnicianDays({
      eventId: EVENT, technicianId: EMIL, email: "emil@mcs.no", blocks: twoDays,
      action: "create", store, graph, buildBody,
    });
    expect(res.find((r) => r.workDate === "2026-11-19")?.state).toBe("synket");
    expect(res.find((r) => r.workDate === "2026-11-20")?.state).toBe("feilet");
    expect(aggregateDayCoverage(res.map((r) => r.state))).toBe("delvis");
  });

  it("failed day is retried on next run (claim released)", async () => {
    const { store } = memStore();
    const { graph, calls } = memGraph(["2026-11-20"]);
    await syncTechnicianDays({
      eventId: EVENT, technicianId: EMIL, email: "emil@mcs.no", blocks: twoDays,
      action: "create", store, graph, buildBody,
    });
    const okGraph = memGraph();
    const res = await syncTechnicianDays({
      eventId: EVENT, technicianId: EMIL, email: "emil@mcs.no", blocks: twoDays,
      action: "update", store, graph: okGraph.graph, buildBody,
    });
    expect(okGraph.calls.filter((c) => c.op === "create")).toHaveLength(1); // only the failed day
    expect(res.every((r) => r.state === "synket")).toBe(true);
    expect(calls.filter((c) => c.op === "create")).toHaveLength(2); // no extra writes on first mock
  });

  it("updateOnly never creates new Outlook events", async () => {
    const { store } = memStore();
    const { graph, calls } = memGraph();
    const res = await syncTechnicianDays({
      eventId: EVENT, technicianId: EMIL, email: "emil@mcs.no", blocks: twoDays,
      action: "update", updateOnly: true, store, graph, buildBody,
    });
    expect(calls).toHaveLength(0);
    expect(res.every((r) => r.state === "venter")).toBe(true);
  });

  it("delete removes every day event for the technician", async () => {
    const { store, rows } = memStore();
    const { graph, calls } = memGraph();
    await syncTechnicianDays({
      eventId: EVENT, technicianId: EMIL, email: "emil@mcs.no", blocks: twoDays,
      action: "create", store, graph, buildBody,
    });
    await syncTechnicianDays({
      eventId: EVENT, technicianId: EMIL, email: "emil@mcs.no", blocks: twoDays,
      action: "delete", store, graph, buildBody,
    });
    expect(calls.filter((c) => c.op === "delete")).toHaveLength(2);
    expect(rows).toHaveLength(0);
  });
});

describe("day delivery states", () => {
  const item = buildPerDayPlan(EVENT, [block(EMIL, "2026-11-19")])[0];
  it("no link → I Hub; pending → venter; synced → synket; failed → feilet", () => {
    expect(dayDeliveryState(item, undefined)).toBe("i_hub");
    expect(dayDeliveryState(item, { technician_id: EMIL, work_date: "2026-11-19", start_at: item.startAt, end_at: item.endAt, outlook_event_id: null, status: "pending" })).toBe("venter");
    expect(dayDeliveryState(item, { technician_id: EMIL, work_date: "2026-11-19", start_at: item.startAt, end_at: item.endAt, outlook_event_id: "g1", status: "synced" })).toBe("synket");
    expect(dayDeliveryState(item, { technician_id: EMIL, work_date: "2026-11-19", start_at: item.startAt, end_at: item.endAt, outlook_event_id: null, status: "failed" })).toBe("feilet");
  });
  it("aggregate coverage: full only when every day is synced", () => {
    expect(aggregateDayCoverage(["synket", "synket"])).toBe("full");
    expect(aggregateDayCoverage(["synket", "venter"])).toBe("delvis");
    expect(aggregateDayCoverage(["feilet", "i_hub"])).toBe("mangler");
    expect(aggregateDayCoverage([])).toBe("ingen_dager");
  });
});
