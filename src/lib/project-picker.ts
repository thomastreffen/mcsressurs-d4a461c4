/**
 * Unified project picker (all eligible Hub parents + Tripletex TEST on demand).
 * Pure helpers – the stable Tripletex project ID is the only dedupe key.
 */
export interface HubLinkedProject {
  event_id: string;
  project_number: string | null;
  title: string;
  customer: string | null;
  tripletex_project_id: number | null;
  internal_number?: string | null;
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
  | { source: "hub"; key: string; eventId: string; projectNumber: string | null; name: string; customer: string | null; linked: boolean; internalNumber?: string | null; status?: OpenStatus }
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
 * Numbers and names are NEVER used for dedupe or auto-linking. Unlinked Hub
 * projects remain eligible and independent even with matching numbers/names.
 */
export function mergeProjectResults(hub: HubLinkedProject[], tt: TripletexProjectHit[]): PickerRow[] {
  const linkedTtIds = new Set(hub.map((h) => h.tripletex_project_id).filter((x): x is number => x != null));
  const hubEventIds = new Set(hub.map((h) => h.event_id));
  const rows: PickerRow[] = hub.map((h) => ({
    source: "hub", key: `hub:${h.event_id}`, eventId: h.event_id,
    projectNumber: h.project_number, name: h.tripletex_project_id != null ? cleanName(h.project_number, h.title) : h.title, customer: h.customer,
    linked: h.tripletex_project_id != null, internalNumber: h.internal_number,
    status: h.tripletex_project_id != null
      ? openStatus(tt.find((t) => t.id === h.tripletex_project_id)?.isClosed) : undefined,
  }));
  for (const t of tt) {
    if (linkedTtIds.has(t.id)) continue;
    if (t.linked_event_id) {
      // Linked in Hub but not in this hub result list (e.g. other filter) – surface as Hub row.
      if (!hubEventIds.has(t.linked_event_id)) {
        rows.push({ source: "hub", key: `hub:${t.linked_event_id}`, eventId: t.linked_event_id,
          projectNumber: t.number, name: cleanName(t.number, t.name), customer: t.customer?.name ?? null, linked: true, status: openStatus(t.isClosed) });
        hubEventIds.add(t.linked_event_id);
      }
      continue;
    }
    rows.push({ source: "tripletex", key: `tt:${t.id}`, tripletexId: t.id, projectNumber: t.number,
      name: cleanName(t.number, t.name), customer: t.customer?.name ?? null, status: openStatus(t.isClosed) });
    linkedTtIds.add(t.id);
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

export function rowLabel(r: { projectNumber: string | null; name: string; source?: string; linked?: boolean; internalNumber?: string | null }): string {
  if (r.source === "hub" && !r.linked) {
    const reference = r.projectNumber || r.internalNumber;
    return reference ? `${reference} · ${cleanName(reference, r.name)}` : r.name;
  }
  return r.projectNumber ? `Prosjektnr. ${r.projectNumber} · ${cleanName(r.projectNumber, r.name)}` : r.name;
}

export function isEconomicProject(r: PickerRow): boolean {
  return r.source === "tripletex" || r.linked;
}

export function rowStatusLabel(r: PickerRow): string {
  if (isEconomicProject(r) && r.status === "closed") return "Avsluttet i Tripletex";
  if (r.source === "hub") return r.linked ? "Koblet til Tripletex" : "Hub-only · ikke koblet";
  return r.status === "unknown" ? "Tripletex TEST · status ukjent" : "Tripletex TEST · hent inn";
}

/** Normalization is for ranking only; mergeProjectResults alone decides identity. */
export function projectMatchRank(r: PickerRow, query: string): number {
  const term = query.trim().toLocaleLowerCase("nb-NO");
  if (!term) return 5;
  const number = (r.projectNumber ?? "").trim().toLocaleLowerCase("nb-NO");
  const name = cleanName(r.projectNumber, r.name).toLocaleLowerCase("nb-NO");
  if (number === term) return 0;
  if (name === term) return 1;
  if (number.startsWith(term) || name.startsWith(term)) return 2;
  if ((r.customer ?? "").toLocaleLowerCase("nb-NO").includes(term)) return 3;
  return 4; // Includes org matches already selected by the caller-scoped search.
}

export function groupProjectResults(rows: PickerRow[], query: string): { id: string; label: string; rows: PickerRow[] }[] {
  const compare = (a: PickerRow, b: PickerRow) => projectMatchRank(a, query) - projectMatchRank(b, query)
    || (a.projectNumber ?? a.internalNumber ?? "").localeCompare(b.projectNumber ?? b.internalNumber ?? "", "nb", { numeric: true })
    || a.name.localeCompare(b.name, "nb") || a.key.localeCompare(b.key);
  return [
    { id: "economic", label: "Økonomiske prosjekter", rows: rows.filter(isEconomicProject).sort(compare) },
    { id: "hub-only", label: "Andre Hub-prosjekter", rows: rows.filter((r) => !isEconomicProject(r)).sort(compare) },
  ].filter((group) => group.rows.length > 0);
}
