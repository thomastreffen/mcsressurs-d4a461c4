import { describe, it, expect } from "vitest";
import { ONE_SHOT, ONE_SHOT_60576, PERMITS, oneShotView, oneShotBase, assertOneShotRequest, oneShotGate, inspectOneShotEvents, osloDayWindow } from "../../supabase/functions/_shared/job-calendar-one-shot";
const x = ONE_SHOT_60576;
const ctx = (o: Record<string, unknown> = {}) => ({
  job: { id: x.event_id, company_id: x.company_id, title: "Ullevaal", status: "requested", start_at: x.start, end_at: x.end } as any,
  target: { id: "t", event_id: x.event_id, technician_id: x.technician_id, company_id: x.company_id, mailbox: x.mailbox, work_date: x.work_date, expires_at: "2026-11-25T00:00:00Z", revoked_at: null },
  assigned: true, identityActive: true, mailbox: x.mailbox, approval: "pending",
  blocks: [{ technician_id: x.technician_id, company_id: x.company_id, start_at: x.start, end_at: x.end }],
  probe: { created_at: "2026-11-20T08:00:00Z", result: { http: 200, pass: true, tid_match: true, appid_match: true } },
  settings: { enabled: false, dry_run: true, pilot_mailboxes: [], scope_verified_at: null }, ...o,
});
const now = new Date("2026-11-20T09:00:00Z");
describe("JOB 60576 one-shot permit", () => {
  it("is exactly Mats, 60576, 26.11 08–16 Oslo (07–15 UTC)", () => {
    expect(x).toMatchObject({ event_id: "1be4a135-c18d-43e8-8290-93eda534cca2", technician_id: "b0716dc3-ddf7-4501-92af-2397a5180085", mailbox: "mats.lien.hansen@mcselektrotavler.no", work_date: "2026-11-26", start: "2026-11-26T07:00:00.000Z", end: "2026-11-26T15:00:00.000Z" });
    expect(x.key).not.toBe(ONE_SHOT.key);
    expect(Object.keys(PERMITS).sort()).toEqual(["mats_60570", "mats_60576"]);
  });
  it("reads only the Oslo day of 26.11 and allows only that GET + one POST", () => {
    expect(osloDayWindow("2026-11-26")).toEqual({ start: "2026-11-25T23:00:00Z", end: "2026-11-26T23:00:00Z" });
    expect(() => assertOneShotRequest("GET", oneShotView(x), x)).not.toThrow();
    expect(() => assertOneShotRequest("POST", oneShotBase(x), x)).not.toThrow();
    expect(() => assertOneShotRequest("GET", oneShotView(ONE_SHOT), x)).toThrow();
    expect(() => assertOneShotRequest("PATCH", oneShotBase(x), x)).toThrow();
    expect(() => assertOneShotRequest("DELETE", oneShotBase(x), x)).toThrow();
  });
  it("gate passes only for the exact tuple and stops other person/day/global on/expired/rejected", () => {
    expect(oneShotGate(ctx() as any, now, x)).toBeNull();
    expect(oneShotGate(ctx({ target: { ...ctx().target, technician_id: "emil" } }) as any, now, x)).toBe("exact_scope_mismatch");
    expect(oneShotGate(ctx({ target: { ...ctx().target, work_date: "2026-11-27" } }) as any, now, x)).toBe("exact_scope_mismatch");
    expect(oneShotGate(ctx(), now, ONE_SHOT)).toBe("exact_scope_mismatch");
    expect(oneShotGate(ctx({ settings: { enabled: true, dry_run: true, pilot_mailboxes: [], scope_verified_at: null } }) as any, now, x)).toBe("global_settings_changed");
    expect(oneShotGate(ctx({ approval: "declined" }) as any, now, x)).toBe("individual_response_blocks_pilot");
    expect(oneShotGate(ctx() as any, new Date("2026-11-25T01:00:00Z"), x)).toBe("pilot_expired");
    expect(oneShotGate(ctx({ blocks: [] }) as any, now, x)).toBe("schedule_changed");
  });
  it("a 60570 copy is never recognised as the 60576 copy", () => {
    const copy60570 = { id: "a", transactionId: ONE_SHOT.key, start: { dateTime: x.start, timeZone: "UTC" }, end: { dateTime: x.end, timeZone: "UTC" }, body: { content: `MCS_EVENT_ID:${ONE_SHOT.event_id} MCS_TECHNICIAN_ID:${x.technician_id} MCS_WORK_DATE:${x.work_date}` } };
    expect(inspectOneShotEvents([copy60570], x).own).toBeNull();
    expect(inspectOneShotEvents([copy60570], x).blocked).toBe(true);
  });
});
