import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyModuleAccess } from "@/hooks/useCompanyModuleAccess";
import { useAuth } from "@/hooks/useAuth";
import { inheritProjectRelevance, type RelevantProject } from "@/lib/mobile-project-relevance";

const roleLabels: Record<string, string> = { owner: "Eier", manager: "Prosjektleder", member: "Deltaker", follower: "Følger" };

/** Reads only already-visible project IDs. Auth UID, technician ID and person ID stay distinct. */
export function useMobileProjectRelevance(projects: RelevantProject[], enabled: boolean) {
  const { user } = useAuth();
  const access = useCompanyModuleAccess();
  const canReadPlanning = access.can("planning");
  const scope = projects.map(p => `${p.id}:${p.companyId}:${p.parentId}`).sort().join("|");
  return useQuery({
    queryKey: ["mobile-project-relevance", user?.id, scope, canReadPlanning],
    enabled: enabled && !!user && projects.length > 0,
    queryFn: async () => {
      if (!user) return new Map<string, string[]>();
      const [{ data: accounts, error: accountError }, { data: techs, error: techError }] = await Promise.all([
        supabase.from("user_accounts").select("id,person_id").eq("auth_user_id", user.id).eq("is_active", true),
        supabase.from("technicians").select("id").eq("user_id", user.id),
      ]);
      if (accountError || techError) throw accountError ?? techError;
      const personIds = Array.from(new Set((accounts ?? []).map(a => a.person_id)));
      const techIds = (techs ?? []).map(t => t.id);
      const direct = new Map<string, string[]>();
      const add = (id: string | null, label: string) => {
        if (id) direct.set(id, [...(direct.get(id) ?? []), label]);
      };
      for (let offset = 0; offset < projects.length; offset += 150) {
        const ids = projects.slice(offset, offset + 150).map(p => p.id);
        const [members, assignments, blocks, jobTasks, tasks, planning] = await Promise.all([
          supabase.from("project_members").select("project_id,role,user_accounts!inner(auth_user_id)").in("project_id", ids).eq("user_accounts.auth_user_id", user.id),
          techIds.length ? supabase.from("event_technicians").select("event_id").in("event_id", ids).in("technician_id", techIds) : Promise.resolve({ data: [], error: null }),
          techIds.length ? supabase.from("schedule_blocks").select("project_id,job_id").in("project_id", ids).in("technician_id", techIds).is("deleted_at", null) : Promise.resolve({ data: [], error: null }),
          techIds.length ? supabase.from("job_tasks").select("job_id,assigned_technician_ids").in("job_id", ids).overlaps("assigned_technician_ids", techIds) : Promise.resolve({ data: [], error: null }),
          supabase.from("tasks").select("linked_project_id,owner_user_id,assigned_user_id,task_assignees(user_id)").in("linked_project_id", ids),
          canReadPlanning ? supabase.from("planning_projects").select("id,linked_event_id,owner_user_id,planning_work_packages(responsible_person_id,linked_event_id),planning_tasks(assignee_person_id)").in("linked_event_id", ids).is("deleted_at", null) : Promise.resolve({ data: [], error: null }),
        ]);
        for (const response of [members, assignments, blocks, jobTasks, tasks, planning]) {
          if (response.error) throw response.error;
        }
        for (const row of members.data ?? []) add(row.project_id, roleLabels[row.role] ?? "Deltaker");
        for (const row of assignments.data ?? []) add(row.event_id, "Ressursbooket");
        for (const row of blocks.data ?? []) { add(row.project_id, "Ressursbooket"); add(row.job_id, "Ressursbooket"); }
        for (const row of jobTasks.data ?? []) add(row.job_id, "Tildelt oppgave");
        for (const row of tasks.data ?? []) {
          if (row.owner_user_id === user.id || row.assigned_user_id === user.id || row.task_assignees.some(a => a.user_id === user.id)) add(row.linked_project_id, "Tildelt oppgave");
        }
        for (const row of planning.data ?? []) {
          if (row.owner_user_id === user.id) add(row.linked_event_id, "Prosjektansvarlig");
          for (const wp of row.planning_work_packages) {
            if (wp.responsible_person_id && personIds.includes(wp.responsible_person_id)) {
              add(row.linked_event_id, "Ansvarlig arbeidspakke"); add(wp.linked_event_id, "Ansvarlig arbeidspakke");
            }
          }
          if (row.planning_tasks.some(t => t.assignee_person_id && personIds.includes(t.assignee_person_id))) add(row.linked_event_id, "Tildelt planoppgave");
        }
      }
      return inheritProjectRelevance(projects, direct);
    },
    staleTime: 30_000,
  });
}