// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildDayPayload } from "../../supabase/functions/_shared/job-outlook-app-days";
import { dailyVerification } from "../../supabase/functions/_shared/central-calendar-lifecycle";
import { buildWorkDayBlocks } from "@/lib/work-days";

const job: any = { id: "e1", title: "Montasje", address: null, start_at: "2026-11-25T11:00:00.000Z", end_at: "2026-11-25T15:00:00.000Z" };

describe("central calendar: different times per workday, no live writes", () => {
  const blocks = buildWorkDayBlocks({ companyId: "c", eventId: "e1", title: "Montasje", techIds: ["m"], matchReason: "x",
    days: [{ date: "2026-11-25", start: "12:00", end: "16:00" }, { date: "2026-11-26", start: "08:00", end: "16:00" }] });
  it("each day gets its own payload window from its own block", () => {
    const p = blocks.map((b, i) => buildDayPayload(job, { technicianId: "m", workDate: ["2026-11-25", "2026-11-26"][i], startAt: b.start_at, endAt: b.end_at, operationKey: `k${i}` } as any, `k${i}`) as any);
    expect(p.map(x => [x.start.dateTime, x.end.dateTime])).toEqual([
      ["2026-11-25T11:00:00.000Z", "2026-11-25T15:00:00.000Z"], ["2026-11-26T07:00:00.000Z", "2026-11-26T15:00:00.000Z"]]);
  });
  it("auto-create verifies via Graph id even when Exchange strips the HTML markers", () => {
    const b = blocks[1];
    const payload: any = { ...buildDayPayload(job, { technicianId: "m", workDate: "2026-11-26", startAt: b.start_at, endAt: b.end_at, operationKey: "k" } as any, "k"), transactionId: "tx1", showAs: "busy" };
    const graphEvent = { id: "G1", changeKey: "ck", transactionId: "tx1", type: "singleInstance", isCancelled: false, isAllDay: false, attendees: [],
      start: { dateTime: "2026-11-26T07:00:00.0000000", timeZone: "UTC" }, end: { dateTime: "2026-11-26T15:00:00.0000000", timeZone: "UTC" },
      subject: payload.subject, showAs: "busy", body: { content: "<html>stripped</html>" } };
    const scope = { eventId: "e1", technicianId: "m", companyId: "c", mailbox: "m@x", workDate: "2026-11-26", start: b.start_at, end: b.end_at, key: "k" };
    expect(dailyVerification(graphEvent, scope, { graphId: "G1", payload }).ok).toBe(true);
    // A wrong day's time must fail verification.
    expect(dailyVerification({ ...graphEvent, start: { dateTime: "2026-11-26T11:00:00", timeZone: "UTC" } }, scope, { graphId: "G1", payload }).ok).toBe(false);
  });
});
