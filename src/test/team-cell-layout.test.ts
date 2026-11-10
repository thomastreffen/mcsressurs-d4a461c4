import { describe, it, expect } from "vitest";
import { cellKind, orderCellBlocks, overlappingIds, formatBlockTime, appointmentTypeLabel, matchesKindFilter } from "@/lib/team-cell-layout";

const d = (h: number, m = 0) => new Date(2026, 10, 10, h, m);
const appt = (id: string, s: Date, e: Date, extra = {}) => ({ id, source: "outlook", start_at: s, end_at: e, ...extra });
const job = (id: string, s: Date, e: Date) => ({ id, source: "manual", job_id: "j" + id, start_at: s, end_at: e });

describe("team cell layout", () => {
  it("Outlook block without link is an appointment, never a job", () => {
    expect(cellKind(appt("a", d(9), d(10)))).toBe("appointment");
    expect(cellKind(job("b", d(9), d(10)))).toBe("job");
  });
  it("jobs come first, then appointments, each chronological", () => {
    const out = orderCellBlocks([appt("a1", d(8), d(9)), job("j2", d(12), d(14)), job("j1", d(7), d(11)), appt("a2", d(7), d(8))]);
    expect(out.map((b) => b.id)).toEqual(["j1", "j2", "a2", "a1"]);
  });
  it("two different appointments with equal times are both kept and flagged as overlap", () => {
    const blocks = [appt("x", d(13), d(13, 30)), appt("y", d(13), d(13, 30))];
    expect(orderCellBlocks(blocks)).toHaveLength(2);
    expect([...overlappingIds(blocks)].sort()).toEqual(["x", "y"]);
  });
  it("short meeting shows minutes instead of 13–13", () => {
    expect(formatBlockTime({ start_at: d(13), end_at: d(13, 30) })).toBe("13:00–13:30");
    expect(formatBlockTime({ start_at: d(13), end_at: d(13), is_all_day: false })).toBe("13:00");
    expect(formatBlockTime({ start_at: d(0), end_at: d(23), is_all_day: true })).toBe("Hele dagen");
  });
  it("private shows only Opptatt; unanswered invite is not confirmed", () => {
    expect(appointmentTypeLabel(appt("p", d(9), d(10), { is_private: true }))).toBe("Opptatt");
    expect(appointmentTypeLabel(appt("q", d(9), d(10), { outlook_response_status: "notResponded" }))).toBe("Avtale · ikke bekreftet");
  });
  it("filter Jobber hides appointments, Alle shows everything", () => {
    expect(matchesKindFilter(appt("a", d(9), d(10)), "jobs")).toBe(false);
    expect(matchesKindFilter(appt("a", d(9), d(10)), "all")).toBe(true);
    expect(matchesKindFilter(job("b", d(9), d(10)), "appointments")).toBe(false);
  });
});
