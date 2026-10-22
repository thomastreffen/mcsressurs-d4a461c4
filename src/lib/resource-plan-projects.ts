import { supabase } from "@/integrations/supabase/client";
import type { HubLinkedProject } from "@/lib/project-picker";
import { format } from "date-fns";

export type TripletexPlanningContext = { economic_project_master: boolean; test_search_enabled: boolean };

export async function fetchTripletexPlanningContext(companyId: string): Promise<TripletexPlanningContext> {
  const { data, error } = await supabase.rpc("resource_plan_tripletex_context", { _company_id: companyId });
  const context = data?.[0];
  if (error || !context) throw new Error("Kunne ikke bekrefte prosjektopprettelse for valgt selskap");
  return context;
}

export async function searchHubPlanningProjects(companyId: string, query: string): Promise<HubLinkedProject[]> {
  const { data, error } = await supabase.rpc("search_resource_plan_projects", { _company_id: companyId, _q: query });
  if (error) throw error;
  return data ?? [];
}

export function canCreateHubRoot(context: TripletexPlanningContext | null): boolean {
  return context?.economic_project_master === false;
}

/** Existing mode must never silently fall through to root creation. */
export function requiresPlanningParent(isEditing: boolean, mode: "new" | "existing", parentId: string | null): boolean {
  return !isEditing && mode === "existing" && !parentId;
}

/** Mirrors the work-visit RPC default using the authorized parent, never a search label. */
export function resolvePlanningVisitTitle(title: string, parentTitle: string): string {
  return title.trim() || parentTitle;
}

/** Normalize the controlled form once; validation and creation consume this same snapshot. */
export function preparePlanningCreation(input: {
  title: string; date: string; techIds: string[]; repeatEnabled: boolean; repeatDates: Date[];
}, requireTitle: boolean, requireTechnicians: boolean) {
  const title = input.title.trim();
  const date = input.date;
  const techIds = [...new Set(input.techIds)];
  const dates = [...new Set([date, ...(input.repeatEnabled ? input.repeatDates.map(d => format(d, "yyyy-MM-dd")) : [])])];
  const missingField = requireTitle && !title ? "title" : !date ? "date" : requireTechnicians && techIds.length === 0 ? "technicians" : null;
  return { title, date, techIds, dates, missingField };
}