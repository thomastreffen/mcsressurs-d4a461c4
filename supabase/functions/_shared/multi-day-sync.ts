// Orchestration for multi-day calendar sync with injected store + graph client.
// Fully testable with mocks; index.ts wires the real Supabase/Graph implementations.
import {
  buildPerDayPlan, diffDayPlan, dayDeliveryState,
  type DayPlanItem, type DayLinkRow, type DayDeliveryState,
} from "./multi-day-calendar.ts";

export interface DayStore {
  listLinks(eventId: string, technicianId: string): Promise<DayLinkRow[]>;
  /** Atomically claim a create slot. "claimed" = caller must POST to Graph. */
  claimCreate(eventId: string, item: DayPlanItem): Promise<"claimed" | "exists" | "in_progress">;
  markSynced(eventId: string, item: DayPlanItem, outlookEventId: string): Promise<void>;
  markFailed(eventId: string, item: DayPlanItem, error: string): Promise<void>;
  releaseClaim(eventId: string, item: DayPlanItem): Promise<void>;
  removeLink(eventId: string, link: DayLinkRow): Promise<void>;
}

export interface DayGraph {
  createEvent(email: string, body: unknown): Promise<{ id: string }>;
  updateEvent(email: string, outlookEventId: string, body: unknown): Promise<void>;
  deleteEvent(email: string, outlookEventId: string): Promise<void>;
}

export interface DayResult {
  technicianId: string;
  workDate: string;
  state: DayDeliveryState;
  outlookEventId?: string | null;
  error?: string;
}

/**
 * Sync one technician's planned days to Outlook: one event per workday.
 * Idempotent: a replay with an unchanged plan performs no Graph writes.
 * Partial failure is per day – one failing day never blocks the others.
 */
export async function syncTechnicianDays(args: {
  eventId: string;
  technicianId: string;
  email: string;
  blocks: { technician_id: string; start_at: string; end_at: string }[];
  action: "create" | "update" | "delete";
  /** Explicit "Oppdater Outlook": only PATCH existing links, never create new events. */
  updateOnly?: boolean;
  store: DayStore;
  graph: DayGraph;
  buildBody: (item: DayPlanItem) => unknown;
}): Promise<DayResult[]> {
  const { eventId, technicianId, email, blocks, action, store, graph, buildBody } = args;
  const plan = buildPerDayPlan(eventId, blocks.filter((b) => b.technician_id === technicianId));
  const links = await store.listLinks(eventId, technicianId);

  if (action === "delete") {
    const results: DayResult[] = [];
    for (const link of links) {
      if (link.outlook_event_id) {
        try {
          await graph.deleteEvent(email, link.outlook_event_id);
        } catch (e: any) {
          // 404 = already gone; still remove the link. Other errors keep the link for retry.
          if (e?.status !== 404) {
            results.push({ technicianId, workDate: link.work_date, state: "feilet", error: String(e?.status ?? e) });
            continue;
          }
        }
      }
      await store.removeLink(eventId, link);
      results.push({ technicianId, workDate: link.work_date, state: "i_hub" });
    }
    return results;
  }

  const diff = diffDayPlan(plan, links);
  const results: DayResult[] = [];

  for (const { item, link } of diff.unchanged) {
    results.push({ technicianId, workDate: item.workDate, state: dayDeliveryState(item, link), outlookEventId: link.outlook_event_id });
  }

  for (const item of diff.creates) {
    if (args.updateOnly) {
      // No link → never auto-create from an explicit update (no duplicates).
      results.push({ technicianId, workDate: item.workDate, state: "venter" });
      continue;
    }
    const claim = await store.claimCreate(eventId, item);
    if (claim === "exists") {
      results.push({ technicianId, workDate: item.workDate, state: "synket" });
      continue;
    }
    if (claim === "in_progress") {
      results.push({ technicianId, workDate: item.workDate, state: "venter" });
      continue;
    }
    try {
      const created = await graph.createEvent(email, buildBody(item));
      await store.markSynced(eventId, item, created.id);
      results.push({ technicianId, workDate: item.workDate, state: "synket", outlookEventId: created.id });
    } catch (e: any) {
      await store.releaseClaim(eventId, item);
      await store.markFailed(eventId, item, String(e?.status ?? e?.message ?? e));
      results.push({ technicianId, workDate: item.workDate, state: "feilet", error: String(e?.status ?? e) });
    }
  }

  for (const { item, link } of diff.updates) {
    try {
      await graph.updateEvent(email, link.outlook_event_id!, buildBody(item));
      await store.markSynced(eventId, item, link.outlook_event_id!);
      results.push({ technicianId, workDate: item.workDate, state: "synket", outlookEventId: link.outlook_event_id });
    } catch (e: any) {
      await store.markFailed(eventId, item, String(e?.status ?? e?.message ?? e));
      results.push({ technicianId, workDate: item.workDate, state: "feilet", error: String(e?.status ?? e) });
    }
  }

  for (const link of diff.deletes) {
    if (link.outlook_event_id) {
      try {
        await graph.deleteEvent(email, link.outlook_event_id);
      } catch (e: any) {
        if (e?.status !== 404) {
          results.push({ technicianId, workDate: link.work_date, state: "feilet", error: String(e?.status ?? e) });
          continue;
        }
      }
    }
    await store.removeLink(eventId, link);
  }

  return results.sort((a, b) => a.workDate.localeCompare(b.workDate));
}
