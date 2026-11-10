import { format } from "date-fns";

/** Minimal shape needed to lay out one person/day cell in the resource plan. */
export interface CellBlockLike {
  id: string;
  source: string;
  job_id?: string | null;
  project_id?: string | null;
  start_at: Date;
  end_at: Date;
  is_all_day?: boolean;
  is_private?: boolean;
  outlook_response_status?: string | null;
}

export type CellKind = "job" | "appointment";
export type CellKindFilter = "all" | "jobs" | "appointments";

/** Project jobs are only Hub objects linked to a job/project. Outlook blocks without a link are appointments. */
export function cellKind(b: CellBlockLike): CellKind {
  if (b.job_id || b.project_id) return "job";
  return b.source === "outlook" ? "appointment" : "job";
}

export function matchesKindFilter(b: CellBlockLike, f: CellKindFilter): boolean {
  if (f === "all") return true;
  return f === "jobs" ? cellKind(b) === "job" : cellKind(b) === "appointment";
}

/** Jobs first, then appointments; chronological within each group (stable by id). */
export function orderCellBlocks<T extends CellBlockLike>(blocks: T[]): T[] {
  const rank = (b: T) => (cellKind(b) === "job" ? 0 : 1);
  return [...blocks].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.start_at.getTime() - b.start_at.getTime() ||
      a.end_at.getTime() - b.end_at.getTime() ||
      a.id.localeCompare(b.id),
  );
}

/** Ids of blocks that overlap in time with at least one other block in the same cell. */
export function overlappingIds(blocks: CellBlockLike[]): Set<string> {
  const out = new Set<string>();
  const timed = blocks.filter((b) => !b.is_all_day);
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i], c = timed[j];
      if (a.start_at < c.end_at && c.start_at < a.end_at) {
        out.add(a.id);
        out.add(c.id);
      }
    }
  }
  return out;
}

/** Time label with minutes (13:00–13:30), all-day and multi-day aware. */
export function formatBlockTime(b: Pick<CellBlockLike, "start_at" | "end_at" | "is_all_day">): string {
  if (b.is_all_day) return "Hele dagen";
  const s = format(b.start_at, "HH:mm");
  const sameDay = b.start_at.toDateString() === b.end_at.toDateString();
  const e = sameDay ? format(b.end_at, "HH:mm") : `${format(b.end_at, "d.M.")} ${format(b.end_at, "HH:mm")}`;
  return s === e ? s : `${s}–${e}`;
}

/** Quiet type label for a card. Private appointments only ever say "Opptatt". */
export function appointmentTypeLabel(b: CellBlockLike): string {
  if (b.is_private) return "Opptatt";
  const r = b.outlook_response_status;
  const unconfirmed = r === "notResponded" || r === "tentativelyAccepted" || r === "none";
  return unconfirmed ? "Avtale · ikke bekreftet" : "Avtale";
}

export const CELL_VISIBLE_LIMIT = 3;
