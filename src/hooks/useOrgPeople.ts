import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { OrgPerson } from "@/lib/org-overview";

const sb = supabase as any;

/**
 * Alle ansatte i virksomheten (også inaktive/arkiverte) med stilling og avdeling
 * hentet fra employment_profiles. Brukes av Organisasjon og ansvar – det finnes
 * ingen eget personregister i compliance-modulen.
 */
export function useOrgPeople() {
  const { activeCompanyId: cid } = useCompanyContext();
  return useQuery<OrgPerson[]>({
    queryKey: ["org-people", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await sb
        .from("employment_profiles")
        .select(
          "person_id, archived_at, relationship_type, departments(name), compliance_job_roles(name), people(full_name, email, is_active)",
        )
        .eq("company_id", cid);
      if (error) throw error;
      const seen = new Set<string>();
      const out: OrgPerson[] = [];
      for (const r of data ?? []) {
        if (!r.person_id || seen.has(r.person_id)) continue;
        seen.add(r.person_id);
        out.push({
          person_id: r.person_id,
          full_name: r.people?.full_name ?? "Ukjent",
          email: r.people?.email ?? null,
          department_name: r.departments?.name ?? null,
          job_role_name: r.compliance_job_roles?.name ?? null,
          relationship_type: r.relationship_type ?? null,
          is_active: r.people?.is_active !== false && !r.archived_at,
        });
      }
      return out.sort((a, b) => a.full_name.localeCompare(b.full_name, "nb"));
    },
  });
}
