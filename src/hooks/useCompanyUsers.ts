import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";

const sb = supabase as any;

export interface CompanyUser {
  id: string;
  name: string;
}

/** Brukere i aktiv virksomhet som kan settes som ansvarlig for tiltak */
export function useAssignableUsers() {
  const { activeCompanyId } = useCompanyContext();
  return useQuery<CompanyUser[]>({
    queryKey: ["assignable-users", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("user_memberships")
        .select("user_id, user:user_accounts!user_memberships_user_id_fkey(auth_user_id, person:people!user_accounts_person_id_fkey(full_name, email))")
        .eq("company_id", activeCompanyId)
        .eq("is_active", true);
      if (error) throw error;
      const seen = new Set<string>();
      const out: CompanyUser[] = [];
      for (const r of data ?? []) {
        const uid = r.user_id || r.user?.auth_user_id;
        if (!uid || seen.has(uid)) continue;
        seen.add(uid);
        out.push({ id: uid, name: r.user?.person?.full_name || r.user?.person?.email || uid.slice(0, 8) });
      }
      return out.sort((a, b) => a.name.localeCompare(b.name, "nb"));
    },
  });
}
