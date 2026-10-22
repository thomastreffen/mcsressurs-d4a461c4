import { supabase } from "@/integrations/supabase/client";
import type { ExternalType } from "@/lib/planning-external";

export const EXTERNAL_PORTAL_KEY = "planning-external:portal";
export const externalProjectKey = (id: string) => `planning-external:${id}`;
export interface ExternalPortalView {
  person: { name: string; email: string };
  projects: { id: string; name: string; project_number: string | null; status: string; participant_type: ExternalType; company_name: string }[];
}
export function externalLandingPath(projects: { id: string }[]) {
  return projects.length === 1 ? `/planlegging/ekstern/${projects[0].id}` : "/ekstern";
}
export function clearExternalStorage() {
  Object.keys(sessionStorage).filter(key => key.startsWith("planning-external:")).forEach(key => sessionStorage.removeItem(key));
}
export async function upgradeExternalSession(projectToken: string) {
  const { data, error } = await supabase.rpc("planning_external_portal_upgrade", { _token: projectToken });
  if (error) throw error;
  const result = data as { portal_token: string };
  sessionStorage.setItem(EXTERNAL_PORTAL_KEY, result.portal_token);
  return result.portal_token;
}