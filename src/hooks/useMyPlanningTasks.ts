import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface MyPlanningTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  due_date: string | null;
  planning_project_id: string;
  project_name: string;
  work_package_name: string | null;
  company_name: string | null;
  department_name: string | null;
  can_open_project: boolean;
  updated_at: string;
}

/** Innlogget brukers egne planleggingsoppgaver – samme rader som i prosjektet, aldri kopiert. */
export function useMyPlanningTasks() {
  const { user } = useAuth();
  return useQuery<MyPlanningTask[]>({
    queryKey: ["my-planning-tasks", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("my_planning_tasks");
      if (error) throw error;
      return (data ?? []) as MyPlanningTask[];
    },
    staleTime: 60_000,
  });
}

export interface DirectoryEntry {
  person_id: string;
  full_name: string;
  company_id: string;
  company_name: string;
  department_id: string | null;
  department_name: string | null;
  is_primary: boolean;
  can_notify: boolean;
}

export interface DirectoryPerson {
  id: string;
  name: string;
  canNotify: boolean;
  employments: DirectoryEntry[];
}

export function groupDirectory(rows: DirectoryEntry[]): DirectoryPerson[] {
  const map = new Map<string, DirectoryPerson>();
  for (const r of rows) {
    const p = map.get(r.person_id) ?? { id: r.person_id, name: r.full_name, canNotify: r.can_notify, employments: [] };
    p.employments.push(r);
    map.set(r.person_id, p);
  }
  for (const p of map.values()) p.employments.sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "nb"));
}

/** Foreslått ansvarslinje: primær aktiv ansettelse, ellers første. */
export function suggestedEmployment(p: DirectoryPerson): DirectoryEntry | null {
  return p.employments.find((e) => e.is_primary) ?? p.employments[0] ?? null;
}

export function usePersonDirectory() {
  return useQuery<DirectoryPerson[]>({
    queryKey: ["planning-person-directory"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("planning_person_directory");
      if (error) throw error;
      return groupDirectory((data ?? []) as DirectoryEntry[]);
    },
    staleTime: 5 * 60_000,
  });
}
