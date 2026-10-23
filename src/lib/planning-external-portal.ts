import { supabase } from "@/integrations/supabase/client";
import type { ExternalAccessMode, ExternalType } from "@/lib/planning-external";

export const EXTERNAL_PORTAL_KEY = "planning-external:portal";
export const externalProjectKey = (id: string) => `planning-external:${id}`;
export interface ExternalPortalView {
  person: { name: string; email: string };
  projects: { id: string; name: string; project_number: string | null; status: string; access_mode: ExternalAccessMode; participant_type: ExternalType; company_name: string }[];
}
export function externalLandingPath(projects: { id: string; access_mode?: ExternalAccessMode }[]) {
  const open = projects.filter(p => p.access_mode !== "none");
  return open.length === 1 && projects.length === 1 ? `/planlegging/ekstern/${open[0].id}` : "/ekstern";
}
export function clearExternalStorage() {
  Object.keys(sessionStorage).filter(key => key.startsWith("planning-external:")).forEach(key => sessionStorage.removeItem(key));
}
export async function upgradeExternalSession(projectToken: string) {
  const { data, error } = await supabase.rpc("planning_external_portal_upgrade", { _token: projectToken });
  if (error) throw error;
  const result = data as { portal_token: string };
  sessionStorage.setItem(EXTERNAL_PORTAL_KEY, result.portal_token);
  Object.keys(sessionStorage).filter(key => key.startsWith("planning-external:") && key !== EXTERNAL_PORTAL_KEY).forEach(key => sessionStorage.removeItem(key));
  return result.portal_token;
}