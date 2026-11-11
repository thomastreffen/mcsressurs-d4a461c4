import { describe, it, expect } from "vitest";
import {
  parseGraphUtcDateTime,
  isOwnJobSlot,
  filterOwnBusySlots,
  slotOsloDayKey,
  formatSlotOslo,
  OWN_SLOT_TOLERANCE_MS,
  type OwnWindow,
} from "../../supabase/functions/_shared/availability-filter";

// Jobb 60570-scenario: planlagt 19+20. nov 2026 08:00–16:00 Oslo (= 07:00–15:00 UTC, CET).
const DAY1: OwnWindow = { startAt: "2026-11-19T07:00:00.000Z", endAt: "2026-11-19T15:00:00.000Z" };
const DAY2: OwnWindow = { startAt: "2026-11-20T07:00:00.000Z", endAt: "2026-11-20T15:00:00.000Z" };

// Graph svarer uten "Z" når Prefer: outlook.timezone="UTC" brukes.
const graphUtc = (isoZ: string) => isoZ.replace("Z", "000000");

describe("parseGraphUtcDateTime", () => {
  it("treats designator-less Graph dateTime as UTC, not local time", () => {
    const d = parseGraphUtcDateTime("2026-11-19T07:00:00.0000000");
    expect(d.toISOString()).toBe("2026-11-19T07:00:00.000Z");
  });

  it("keeps explicit Z and offsets as-is", () => {
    expect(parseGraphUtcDateTime("2026-11-19T07:00:00Z").toISOString()).toBe("2026-11-19T07:00:00.000Z");
    expect(parseGraphUtcDateTime("2026-11-19T08:00:00+01:00").toISOString()).toBe("2026-11-19T07:00:00.000Z");
  });
});

describe("formatSlotOslo – UTC → Europe/Oslo med dato", () => {
  it("november (CET): 07:00 UTC vises som 08:00 Oslo med dato", () => {
    expect(formatSlotOslo(graphUtc("2026-11-19T07:00:00.000Z"), graphUtc("2026-11-19T15:00:00.000Z")))
      .toBe("tor. 19. nov. 08:00–16:00");
  });

  it("DST (juli, CEST): 07:00 UTC vises som 09:00 Oslo", () => {
    expect(formatSlotOslo(graphUtc("2026-07-15T07:00:00.000Z"), graphUtc("2026-07-15T15:00:00.000Z")))
      .toBe("ons. 15. juli 09:00–17:00");
  });

  it("Mats' reelle møte: 12:00–12:30 UTC vises som 13:00–13:30 Oslo", () => {
    expect(formatSlotOslo(graphUtc("2026-11-19T12:00:00.000Z"), graphUtc("2026-11-19T12:30:00.000Z")))
      .toBe("tor. 19. nov. 13:00–13:30");
  });
});

describe("filterOwnBusySlots – jobbens egne Outlook-kopier er aldri konflikter", () => {
  it("filtrerer legacy egen-kopi (Emil dag 1, 07:00–15:00 UTC)", () => {
    const slots = [{ start: graphUtc("2026-11-19T07:00:00.000Z"), end: graphUtc("2026-11-19T15:00:00.000Z"), status: "busy" }];
    const { kept, removedOwn } = filterOwnBusySlots(slots, [DAY1, DAY2]);
    expect(kept).toHaveLength(0);
    expect(removedOwn).toHaveLength(1);
  });

  it("filtrerer adopterte flerdags-kopier på begge dager", () => {
    const slots = [
      { start: graphUtc("2026-11-19T07:00:00.000Z"), end: graphUtc("2026-11-19T15:00:00.000Z") },
      { start: graphUtc("2026-11-20T07:00:00.000Z"), end: graphUtc("2026-11-20T15:00:00.000Z") },
    ];
    const { kept } = filterOwnBusySlots(slots, [DAY1, DAY2]);
    expect(kept).toHaveLength(0);
  });

  it("beholder reell ekstern gjentakende avtale (Mats 13:00–13:30 Oslo)", () => {
    const slots = [
      { start: graphUtc("2026-11-19T07:00:00.000Z"), end: graphUtc("2026-11-19T15:00:00.000Z") }, // egen kopi
      { start: graphUtc("2026-11-19T12:00:00.000Z"), end: graphUtc("2026-11-19T12:30:00.000Z"), status: "busy" }, // ekstern
    ];
    const { kept, removedOwn } = filterOwnBusySlots(slots, [DAY1, DAY2]);
    expect(removedOwn).toHaveLength(1);
    expect(kept).toHaveLength(1);
    expect(slotOsloDayKey(kept[0])).toBe("2026-11-19");
  });

  it("flerdagsjobb: ekstern konflikt på dag 2 beholdes og tilordnes riktig dag", () => {
    const slots = [
      { start: graphUtc("2026-11-19T07:00:00.000Z"), end: graphUtc("2026-11-19T15:00:00.000Z") },
      { start: graphUtc("2026-11-20T07:00:00.000Z"), end: graphUtc("2026-11-20T15:00:00.000Z") },
      { start: graphUtc("2026-11-20T10:00:00.000Z"), end: graphUtc("2026-11-20T11:00:00.000Z") },
    ];
    const { kept } = filterOwnBusySlots(slots, [DAY1, DAY2]);
    expect(kept).toHaveLength(1);
    expect(slotOsloDayKey(kept[0])).toBe("2026-11-20");
  });

  it("toleranse: ±1 min drift filtreres, 5 min avvik beholdes", () => {
    const drifted = { start: graphUtc("2026-11-19T07:01:00.000Z"), end: graphUtc("2026-11-19T15:01:00.000Z") };
    expect(isOwnJobSlot(drifted, [DAY1])).toBe(true);
    const off = { start: graphUtc("2026-11-19T07:05:00.000Z"), end: graphUtc("2026-11-19T15:00:00.000Z") };
    expect(isOwnJobSlot(off, [DAY1])).toBe(false);
    expect(OWN_SLOT_TOLERANCE_MS).toBe(2 * 60 * 1000);
  });

  it("samme dager, ulik tekniker: egne vinduer er per tekniker", () => {
    // Emil har egen kopi dag 1; Mats har ingen kopi (no_ms_connection) → hans slot beholdes.
    const emilSlots = [{ start: graphUtc("2026-11-19T07:00:00.000Z"), end: graphUtc("2026-11-19T15:00:00.000Z") }];
    const matsSlots = [{ start: graphUtc("2026-11-19T07:00:00.000Z"), end: graphUtc("2026-11-19T15:00:00.000Z") }];
    expect(filterOwnBusySlots(emilSlots, [DAY1, DAY2]).kept).toHaveLength(0);
    expect(filterOwnBusySlots(matsSlots, []).kept).toHaveLength(1);
  });

  it("slot uten start/end filtreres ikke og gir null dag", () => {
    expect(isOwnJobSlot({}, [DAY1])).toBe(false);
    expect(slotOsloDayKey({})).toBeNull();
  });
});
