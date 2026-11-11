// Pure core for multi-day calendar sync: one Outlook event per (job, technician, workday).
// No Deno/DOM/network – imported by edge functions, frontend and tests.

export interface DayPlanItem {
  technicianId: string;
  /** yyyy-mm-dd in Europe/Oslo */
  workDate: string;
  startAt: string; // ISO instant
  endAt: string;   // ISO instant
  operationKey: string;
}

export interface DayLinkRow {
  technician_id: string;
  work_date: string;
  start_at: string;
  end_at: string;
  outlook_event_id: string | null;
  status: string; // pending | synced | failed
  last_error?: string | null;
}

export type DayDeliveryState = "i_hub" | "venter" | "synket" | "feilet";
export type DayCoverage = "full" | "delvis" | "mangler" | "ingen_dager";

const OSLO_FMT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Oslo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** yyyy-mm-dd for the instant in Europe/Oslo (DST-safe). */
export function osloDayKey(iso: string): string {
  return OSLO_FMT.format(new Date(iso));
}

/** Deterministic idempotency key for one (job, technician, workday) calendar event. */
export function dayOperationKey(eventId: string, technicianId: string, workDate: string): string {
  return `calday:${eventId}:${technicianId}:${workDate}`;
}

/**
 * Build the desired per-day plan from schedule blocks.
 * One item per (technician × Oslo-day); same-day blocks collapse to earliest start / latest end.
 * Sorted by technician, then date, for deterministic output.
 */
export function buildPerDayPlan(
  eventId: string,
  blocks: { technician_id: string; start_at: string; end_at: string }[],
): DayPlanItem[] {
  const byKey = new Map<string, DayPlanItem>();
  for (const b of blocks) {
    if (!b.technician_id || !b.start_at || !b.end_at) continue;
    const workDate = osloDayKey(b.start_at);
    const key = `${b.technician_id}|${workDate}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        technicianId: b.technician_id,
        workDate,
        startAt: b.start_at,
        endAt: b.end_at,
        operationKey: dayOperationKey(eventId, b.technician_id, workDate),
      });
    } else {
      if (new Date(b.start_at) < new Date(existing.startAt)) existing.startAt = b.start_at;
      if (new Date(b.end_at) > new Date(existing.endAt)) existing.endAt = b.end_at;
    }
  }
  return Array.from(byKey.values()).sort((a, b) =>
    a.technicianId === b.technicianId
      ? a.workDate.localeCompare(b.workDate)
      : a.technicianId.localeCompare(b.technicianId),
  );
}

export interface DaySyncActions {
  /** Days needing a new Outlook event. */
  creates: DayPlanItem[];
  /** Days with an existing link whose time changed → PATCH. */
  updates: { item: DayPlanItem; link: DayLinkRow }[];
  /** Links for days/technicians no longer planned → DELETE. */
  deletes: DayLinkRow[];
  /** Days already in sync (same time, has Outlook event). */
  unchanged: { item: DayPlanItem; link: DayLinkRow }[];
}

const timesEqual = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();

/**
 * Diff desired plan against stored links. Pure: decides creates/updates/deletes
 * for date changes, technician removal and replays (identical plan → all unchanged).
 * A link without an Outlook event id (earlier failure) is retried as a create.
 */
export function diffDayPlan(desired: DayPlanItem[], links: DayLinkRow[]): DaySyncActions {
  const linkByKey = new Map(links.map((l) => [`${l.technician_id}|${l.work_date}`, l]));
  const desiredKeys = new Set(desired.map((d) => `${d.technicianId}|${d.workDate}`));

  const actions: DaySyncActions = { creates: [], updates: [], deletes: [], unchanged: [] };

  for (const item of desired) {
    const link = linkByKey.get(`${item.technicianId}|${item.workDate}`);
    if (!link || !link.outlook_event_id) {
      actions.creates.push(item);
    } else if (!timesEqual(link.start_at, item.startAt) || !timesEqual(link.end_at, item.endAt)) {
      actions.updates.push({ item, link });
    } else {
      actions.unchanged.push({ item, link });
    }
  }

  for (const link of links) {
    if (!desiredKeys.has(`${link.technician_id}|${link.work_date}`)) {
      actions.deletes.push(link);
    }
  }
  return actions;
}

/** Per-day delivery state for UI: Hub truth first, Outlook status on top. */
export function dayDeliveryState(item: DayPlanItem, link: DayLinkRow | undefined): DayDeliveryState {
  if (!link) return "i_hub"; // planned in Hub, Outlook not attempted
  if (link.status === "synced" && link.outlook_event_id) return "synket";
  if (link.status === "failed") return "feilet";
  return "venter"; // pending claim / in progress
}

export function aggregateDayCoverage(states: DayDeliveryState[]): DayCoverage {
  if (states.length === 0) return "ingen_dager";
  if (states.every((s) => s === "synket")) return "full";
  if (states.some((s) => s === "synket" || s === "venter")) return "delvis";
  return "mangler";
}

export const DAY_STATE_LABELS: Record<DayDeliveryState, string> = {
  i_hub: "I Hub",
  venter: "Venter på Outlook",
  synket: "Synket",
  feilet: "Feilet",
};

export const DAY_COVERAGE_LABELS: Record<DayCoverage, string> = {
  full: "Outlook oppdatert for alle dager",
  delvis: "Outlook dekker ikke alle dager",
  mangler: "Outlook mangler for planlagte dager",
  ingen_dager: "Ingen planlagte dager",
};

const DAY_DATE_FMT = new Intl.DateTimeFormat("nb-NO", {
  timeZone: "Europe/Oslo", weekday: "short", day: "numeric", month: "short",
});
const DAY_TIME_FMT = new Intl.DateTimeFormat("nb-NO", {
  timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit", hour12: false,
});

/**
 * Human-readable planned days for e-mail/UI, e.g. "tor. 19. nov 08:00–16:00".
 * One line per Oslo day across all blocks (technician-agnostic), sorted by date.
 */
export function formatPlannedDays(
  blocks: { start_at: string; end_at: string }[],
): string[] {
  const byDay = new Map<string, { start: string; end: string }>();
  for (const b of blocks) {
    if (!b.start_at || !b.end_at) continue;
    const day = osloDayKey(b.start_at);
    const cur = byDay.get(day);
    if (!cur) byDay.set(day, { start: b.start_at, end: b.end_at });
    else {
      if (new Date(b.start_at) < new Date(cur.start)) cur.start = b.start_at;
      if (new Date(b.end_at) > new Date(cur.end)) cur.end = b.end_at;
    }
  }
  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => {
      const s = new Date(v.start);
      const e = new Date(v.end);
      return `${DAY_DATE_FMT.format(s)} ${DAY_TIME_FMT.format(s)}–${DAY_TIME_FMT.format(e)}`;
    });
}
