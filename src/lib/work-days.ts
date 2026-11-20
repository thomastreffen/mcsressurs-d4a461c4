// Per-day working windows when creating one job over several specific dates.
// Each day carries its own start/end; the schedule_block per (technician × day)
// is the source of truth for planning, collisions and both calendar engines.
// Wall-clock times are interpreted explicitly in Europe/Oslo (DST-aware).

export type WorkDay = { date: string; start: string; end: string };
export const NEW_DAY_DEFAULT = { start: "08:00", end: "16:00" } as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function osloOffsetMinutes(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Oslo", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return Math.round((asUtc - utcMs) / 60000);
}

/** Oslo wall-clock (yyyy-MM-dd + HH:mm) → UTC ISO instant. */
export function osloToUtcISO(day: string, time: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, h, mi);
  let ts = naive - osloOffsetMinutes(naive) * 60000;
  ts = naive - osloOffsetMinutes(ts) * 60000; // settle across DST boundary
  return new Date(ts).toISOString();
}

function validDate(s: string) {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export type WorkDayError = { date: string; message: string };

/** Validate rows; `allowOvernightFirst` keeps the existing over-midnight rule for the primary day. */
export function validateWorkDays(days: WorkDay[], opts: { allowOvernightFirst?: boolean } = {}): WorkDayError[] {
  const errors: WorkDayError[] = [];
  const seen = new Set<string>();
  days.forEach((d, i) => {
    if (!validDate(d.date)) { errors.push({ date: d.date, message: "Ugyldig dato" }); return; }
    if (seen.has(d.date)) errors.push({ date: d.date, message: "Datoen er lagt inn to ganger" });
    seen.add(d.date);
    if (!TIME_RE.test(d.start) || !TIME_RE.test(d.end)) { errors.push({ date: d.date, message: "Ugyldig klokkeslett" }); return; }
    if (d.end <= d.start && !(i === 0 && opts.allowOvernightFirst)) {
      errors.push({ date: d.date, message: "Slutt må være etter start" });
    }
  });
  return errors;
}

export function workDayWindow(day: WorkDay) {
  const startISO = osloToUtcISO(day.date, day.start);
  let endISO = osloToUtcISO(day.date, day.end);
  if (endISO <= startISO) {
    const [y, m, d] = day.date.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    endISO = osloToUtcISO(next, day.end);
  }
  return { startISO, endISO };
}

/** Sorted, deduplicated (first occurrence wins) rows. */
export function normalizeWorkDays(days: WorkDay[]): WorkDay[] {
  const map = new Map<string, WorkDay>();
  for (const d of days) if (!map.has(d.date)) map.set(d.date, d);
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function buildWorkDayBlocks(input: {
  companyId: string; eventId: string; title: string; techIds: string[];
  days: WorkDay[]; matchReason: string;
}) {
  const map = new Map<string, any>();
  for (const tid of input.techIds) {
    for (const day of normalizeWorkDays(input.days)) {
      const { startISO, endISO } = workDayWindow(day);
      const key = `${tid}|${startISO}|${endISO}`;
      if (map.has(key)) continue;
      map.set(key, {
        company_id: input.companyId, technician_id: tid, project_id: input.eventId,
        source: "manual", start_at: startISO, end_at: endISO, title: input.title,
        match_state: "manual", match_confidence: 100, match_reason: input.matchReason,
      });
    }
  }
  return Array.from(map.values());
}

/** Same-technician blocks on this job must never overlap each other. */
export function blocksOverlap(rows: { technician_id: string; start_at: string; end_at: string }[]) {
  const byTech = new Map<string, typeof rows>();
  rows.forEach((r) => byTech.set(r.technician_id, [...(byTech.get(r.technician_id) ?? []), r]));
  for (const list of byTech.values()) {
    const s = [...list].sort((a, b) => a.start_at.localeCompare(b.start_at));
    for (let i = 1; i < s.length; i++) if (s[i].start_at < s[i - 1].end_at) return true;
  }
  return false;
}
