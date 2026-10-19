/**
 * Unified financial-project picker (Hub-linked + Tripletex TEST on demand).
 * Pure helpers – the stable Tripletex project ID is the only dedupe key.
 */
export interface HubLinkedProject {
  event_id: string;
  project_number: string | null;
  title: string;
  customer: string | null;
  tripletex_project_id: number | null;
}
export interface TripletexProjectHit {
  id: number;
  number: string;
  name: string;
  isClosed?: boolean | null;
  customer?: { id?: number; name?: string; organizationNumber?: string } | null;
  linked_event_id?: string | null;
}
export type PickerRow =
  | { source: "hub"; key: string; eventId: string; projectNumber: string | null; name: string; customer: string | null }
  | { source: "tripletex"; key: string; tripletexId: number; projectNumber: string; name: string; customer: string | null; status: OpenStatus };

export type OpenStatus = "open" | "closed" | "unknown";

export function openStatus(isClosed: unknown): OpenStatus {
  return isClosed === false ? "open" : isClosed === true ? "closed" : "unknown";
}

/** Only a confirmed-open Tripletex project may parent a NEW child job. */
export function canPlanNewJob(status: OpenStatus | null | undefined): boolean {
  return status === "open";
}

/** Strips a leading project number from a Tripletex name so it is not shown twice. */
export function cleanName(number: string | null | undefined, name: string): string {
  const n = (number ?? "").trim();
  const t = name.trim();
  if (n && t.startsWith(n)) return t.slice(n.length).replace(/^[\s·\-–:]+/, "") || t;
  return t;
}

/**
 * Merges results. A Tripletex hit is dropped when the same stable Tripletex ID
 * is already actively linked to a Hub project (via hub row or linked_event_id).
 * Numbers and names are NEVER used for dedupe or auto-linking.
 */
export function mergeProjectResults(hub: HubLinkedProject[], tt: TripletexProjectHit[]): PickerRow[] {
  const linkedTtIds = new Set(hub.map((h) => h.tripletex_project_id).filter((x): x is number => x != null));
  const hubEventIds = new Set(hub.map((h) => h.event_id));
  const rows: PickerRow[] = hub.map((h) => ({
    source: "hub", key: `hub:${h.event_id}`, eventId: h.event_id,
    projectNumber: h.project_number, name: cleanName(h.project_number, h.title), customer: h.customer,
  }));
  for (const t of tt) {
    if (linkedTtIds.has(t.id)) continue;
    if (t.linked_event_id) {
      // Linked in Hub but not in this hub result list (e.g. other filter) – surface as Hub row.
      if (!hubEventIds.has(t.linked_event_id)) {
        rows.push({ source: "hub", key: `hub:${t.linked_event_id}`, eventId: t.linked_event_id,
          projectNumber: t.number, name: cleanName(t.number, t.name), customer: t.customer?.name ?? null });
        hubEventIds.add(t.linked_event_id);
      }
      continue;
    }
    rows.push({ source: "tripletex", key: `tt:${t.id}`, tripletexId: t.id, projectNumber: t.number,
      name: cleanName(t.number, t.name), customer: t.customer?.name ?? null, status: openStatus(t.isClosed) });
  }
  return rows;
}

/** Chooses the Tripletex search mode from free text. */
export function tripletexSearchBy(q: string): "number" | "name" | "customer" {
  const d = q.replace(/\s/g, "");
  if (/^\d{9}$/.test(d)) return "customer";
  if (/^\d+$/.test(d)) return "number";
  return "name";
}

export function rowLabel(r: { projectNumber: string | null; name: string }): string {
  return r.projectNumber ? `Prosjektnr. ${r.projectNumber} · ${r.name}` : r.name;
}
