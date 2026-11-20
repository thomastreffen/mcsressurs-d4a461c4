import { describe, it, expect } from "vitest";
import { buildWorkDayBlocks, validateWorkDays, osloToUtcISO, blocksOverlap, workDayWindow, NEW_DAY_DEFAULT } from "@/lib/work-days";

const thomasCase = [
  { date: "2026-11-25", start: "12:00", end: "16:00" },
  { date: "2026-11-26", start: "08:00", end: "16:00" },
];

describe("per-day working times", () => {
  it("Thomas: ons 25.11 12–16 and tor 26.11 08–16 become two different day blocks per technician", () => {
    const rows = buildWorkDayBlocks({ companyId: "c", eventId: "e", title: "T", techIds: ["thomas", "rune"], days: thomasCase, matchReason: "x" });
    expect(rows).toHaveLength(4);
    for (const tech of ["thomas", "rune"]) {
      const mine = rows.filter((r) => r.technician_id === tech).sort((a, b) => a.start_at.localeCompare(b.start_at));
      expect(mine.map((r) => [r.start_at, r.end_at])).toEqual([
        ["2026-11-25T11:00:00.000Z", "2026-11-25T15:00:00.000Z"],
        ["2026-11-26T07:00:00.000Z", "2026-11-26T15:00:00.000Z"],
      ]);
    }
    expect(new Set(rows.map((r) => r.project_id))).toEqual(new Set(["e"]));
    expect(blocksOverlap(rows)).toBe(false);
  });
  it("Europe/Oslo summer time uses UTC+2, winter UTC+1", () => {
    expect(osloToUtcISO("2026-07-01", "08:00")).toBe("2026-07-01T06:00:00.000Z");
    expect(osloToUtcISO("2026-11-26", "08:00")).toBe("2026-11-26T07:00:00.000Z");
    expect(osloToUtcISO("2026-03-30", "08:00")).toBe("2026-03-30T06:00:00.000Z");
  });
  it("new day defaults to 08–16", () => {
    expect(NEW_DAY_DEFAULT).toEqual({ start: "08:00", end: "16:00" });
  });
  it("rejects end before start, duplicate dates and invalid dates", () => {
    expect(validateWorkDays([{ date: "2026-11-25", start: "12:00", end: "16:00" }, { date: "2026-11-26", start: "16:00", end: "08:00" }])[0].message).toBe("Slutt må være etter start");
    expect(validateWorkDays([...thomasCase, thomasCase[0]]).some((e) => e.message.includes("to ganger"))).toBe(true);
    expect(validateWorkDays([{ date: "2026-02-30", start: "08:00", end: "16:00" }])[0].message).toBe("Ugyldig dato");
    expect(validateWorkDays(thomasCase)).toEqual([]);
  });
  it("editing one day's time changes only that day", () => {
    const edited = thomasCase.map((d) => d.date === "2026-11-26" ? { ...d, start: "07:00", end: "15:00" } : d);
    expect(workDayWindow(edited[0]).startISO).toBe("2026-11-25T11:00:00.000Z");
    expect(workDayWindow(edited[1]).startISO).toBe("2026-11-26T06:00:00.000Z");
  });
  it("primary day may still run past midnight", () => {
    expect(validateWorkDays([{ date: "2026-11-25", start: "22:00", end: "02:00" }], { allowOvernightFirst: true })).toEqual([]);
  });
});
