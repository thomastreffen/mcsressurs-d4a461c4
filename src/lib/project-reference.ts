/**
 * TPX-F4.1 – visible project reference.
 *
 * The Tripletex project number on a financial_project is the primary VISIBLE
 * business reference for that project and every Hub child job under it.
 * It is resolved for display only: never a unique job identity, never copied
 * into job titles, never invented for legacy/unlinked jobs.
 */
import { supabase } from "@/integrations/supabase/client";

export interface ProjectRefEvent {
  id?: string;
  entity_type?: string | null;
  project_number?: string | null;
  parent_project_id?: string | null;
  company_id?: string | null;
  /** True only when an active Tripletex project-link exists in the same company. */
  has_active_link?: boolean;
}

function clean(v?: string | null) {
  const t = (v ?? "").trim();
  return t || null;
}

/** Returns the financial project number to display, or null (keep legacy fallback). */
export function resolveFinancialProjectNumber(
  event: ProjectRefEvent | null | undefined,
  parent?: ProjectRefEvent | null,
): string | null {
  if (!event) return null;
  if (event.entity_type === "financial_project") {
    return event.has_active_link ? clean(event.project_number) : null;
  }
  if (event.parent_project_id && parent && parent.id === event.parent_project_id
      && parent.entity_type === "financial_project" && parent.has_active_link
      && (!event.company_id || !parent.company_id || event.company_id === parent.company_id)) {
    return clean(parent.project_number);
  }
  return null;
}

/** "<nr> · <title>"; avoids duplication when the title already starts with the number. */
export function formatProjectLabel(projectNumber: string | null | undefined, title: string): string {
  const nr = clean(projectNumber);
  if (!nr) return title;
  const t = title.trim();
  if (t === nr || t.startsWith(`${nr} `) || t.startsWith(`${nr}·`) || t.startsWith(`${nr} -`)) return t;
  return `${nr} · ${t}`;
}

/** Formats an internal Hub job code as a secondary reference. */
export function formatHubId(internalNumber?: string | null, jobNumber?: string | null): string | null {
  const num = clean(internalNumber) ?? clean(jobNumber);
  if (!num) return null;
  return num.startsWith("JOB-") ? num : `JOB-${num}`;
}

/**
 * Batch-resolves display project numbers via the DB resolver
 * `get_visible_project_numbers` (events RLS for the caller; active, same-company
 * Tripletex project-link checked server-side — no direct tripletex_links access).
 */
export async function fetchFinancialProjectNumbers(eventIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = Array.from(new Set(eventIds.filter(Boolean)));
  if (ids.length === 0) return out;
  const { data, error } = await (supabase as any).rpc("get_visible_project_numbers", { _event_ids: ids });
  if (error) return out;
  for (const r of data ?? []) if (r.event_id && r.project_number) out.set(r.event_id, r.project_number);
  return out;
}
