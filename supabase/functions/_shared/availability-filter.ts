// Pure helpers for availability conflict checks: parse Graph UTC dateTimes,
// filter out the job's OWN Outlook copies, and format slots in Europe/Oslo.
// No Deno/DOM/network – imported by edge functions, frontend and tests.

import { osloDayKey } from "./multi-day-calendar";

export interface BusySlot {
  status?: string;
  subject?: string | null;
  start?: string;
  end?: string;
  is_private?: boolean;
}

/** A time window where the job's own Outlook copy exists for one technician. */
export interface OwnWindow {
  startAt: string; // ISO instant
  endAt: string;   // ISO instant
}

/** Own events are created with exactly the planned block times; allow small drift. */
export const OWN_SLOT_TOLERANCE_MS = 2 * 60 * 1000;

/**
 * Graph returns dateTime WITHOUT a timezone designator when the request used
 * Prefer: outlook.timezone="UTC" (e.g. "2026-11-19T07:00:00.0000000").
 * new Date() would parse that as LOCAL time – always treat it as UTC.
 */
export function parseGraphUtcDateTime(dt: string): Date {
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(dt)) return new Date(dt);
  return new Date(dt + "Z");
}

/** True when a busy slot matches one of the job's own windows (start AND end within tolerance). */
export function isOwnJobSlot(
  slot: Pick<BusySlot, "start" | "end">,
  ownWindows: OwnWindow[],
  toleranceMs: number = OWN_SLOT_TOLERANCE_MS,
): boolean {
  if (!slot.start || !slot.end) return false;
  const s = parseGraphUtcDateTime(slot.start).getTime();
  const e = parseGraphUtcDateTime(slot.end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return false;
  return ownWindows.some((w) => {
    const ws = new Date(w.startAt).getTime();
    const we = new Date(w.endAt).getTime();
    return Math.abs(s - ws) <= toleranceMs && Math.abs(e - we) <= toleranceMs;
  });
}

/** Split busy slots into real external conflicts and the job's own copies. */
export function filterOwnBusySlots<T extends Pick<BusySlot, "start" | "end">>(
  slots: T[],
  ownWindows: OwnWindow[],
): { kept: T[]; removedOwn: T[] } {
  const kept: T[] = [];
  const removedOwn: T[] = [];
  for (const slot of slots) {
    if (isOwnJobSlot(slot, ownWindows)) removedOwn.push(slot);
    else kept.push(slot);
  }
  return { kept, removedOwn };
}

/** Europe/Oslo day key (yyyy-mm-dd) for a slot, or null when unparseable. */
export function slotOsloDayKey(slot: Pick<BusySlot, "start">): string | null {
  if (!slot.start) return null;
  const d = parseGraphUtcDateTime(slot.start);
  if (Number.isNaN(d.getTime())) return null;
  return osloDayKey(d.toISOString());
}

const OSLO_TIME_FMT = new Intl.DateTimeFormat("nb-NO", {
  timeZone: "Europe/Oslo",
  hour: "2-digit",
  minute: "2-digit",
});

const OSLO_DAY_FMT = new Intl.DateTimeFormat("nb-NO", {
  timeZone: "Europe/Oslo",
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** "ons. 19. nov 08:00–16:00" – always Europe/Oslo, DST-safe, with date. */
export function formatSlotOslo(start: string, end: string): string {
  const s = parseGraphUtcDateTime(start);
  const e = parseGraphUtcDateTime(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "Ukjent tidspunkt";
  const day = OSLO_DAY_FMT.format(s);
  const endDay = OSLO_DAY_FMT.format(e);
  const timeRange = `${OSLO_TIME_FMT.format(s)}–${OSLO_TIME_FMT.format(e)}`;
  return endDay !== day ? `${day} ${timeRange} (til ${endDay})` : `${day} ${timeRange}`;
}
