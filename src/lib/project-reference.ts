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
  if (event.entity_type === "financial_project") return clean(event.project_number);
  if (event.parent_project_id && parent && parent.id === event.parent_project_id
      && parent.entity_type === "financial_project") {
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

/** Batch-resolves display project numbers for event ids (read-only, RLS-scoped). */
export async function fetchFinancialProjectNumbers(eventIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = Array.from(new Set(eventIds.filter(Boolean)));
  if (ids.length === 0) return out;
  const sb = supabase as any;
  const { data: rows } = await sb
    .from("events").select("id, entity_type, project_number, parent_project_id").in("id", ids);
  const evs: ProjectRefEvent[] = rows ?? [];
  const parentIds = Array.from(new Set(evs.map((e) => e.parent_project_id).filter(Boolean))) as string[];
  const parents = new Map<string, ProjectRefEvent>();
  if (parentIds.length > 0) {
    const { data: prows } = await sb
      .from("events").select("id, entity_type, project_number, parent_project_id").in("id", parentIds);
    for (const p of prows ?? []) parents.set(p.id, p);
  }
  for (const e of evs) {
    const nr = resolveFinancialProjectNumber(e, e.parent_project_id ? parents.get(e.parent_project_id) : null);
    if (nr && e.id) out.set(e.id, nr);
  }
  return out;
}
