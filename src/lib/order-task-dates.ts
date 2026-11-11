// Pure helpers for "Legg til flere datoer" when creating a Resource Plan task
// from an order. One event (one job, one order link) + one schedule_block per
// (technician × date), mirroring EventDrawer's multi-date creation.
import { format } from "date-fns";

export function orderPlanningDates(primary: Date | undefined, extras: Date[]): string[] {
  const set = new Set<string>();
  if (primary) set.add(format(primary, "yyyy-MM-dd"));
  for (const d of extras) set.add(format(d, "yyyy-MM-dd"));
  return Array.from(set).sort();
}

function localIso(day: string, time: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return new Date(y, m - 1, d, h, mi, 0, 0);
}

/** Start/end instants for one working day; end before start rolls to next day. */
export function dayWindow(day: string, startTime: string, endTime: string) {
  const start = localIso(day, startTime);
  const end = localIso(day, endTime);
  if (end <= start) end.setDate(end.getDate() + 1);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

export function buildOrderScheduleBlocks(input: {
  companyId: string; eventId: string; title: string; techIds: string[];
  dates: string[]; startTime: string; endTime: string;
}) {
  const map = new Map<string, any>();
  for (const tid of input.techIds) {
    for (const ds of input.dates) {
      const { startISO, endISO } = dayWindow(ds, input.startTime, input.endTime);
      const key = `${tid}|${startISO}|${endISO}`;
      if (map.has(key)) continue;
      map.set(key, {
        company_id: input.companyId, technician_id: tid, project_id: input.eventId,
        source: "manual", start_at: startISO, end_at: endISO,
        title: input.title || "Oppgave", match_state: "manual", match_confidence: 100,
        match_reason: "Planlagt over flere dager fra bestilling",
      });
    }
  }
  return Array.from(map.values());
}
