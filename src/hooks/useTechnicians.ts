import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TechnicianInfo {
  id: string;
  name: string;
  email: string;
  company_id?: string;
  company_name?: string;
  department_id?: string | null;
  department_name?: string | null;
  color?: string;
  avatar_id?: string | null;
}

/**
 * Fetches plannable technicians.
 * Uses employment_profiles.is_plannable_resource as the per-company source of truth.
 * If companyId is provided, returns only technicians plannable in that company.
 * If companyId is null/undefined, returns technicians plannable in any of the allowedCompanyIds.
 * allowedCompanyIds restricts results to only companies the user has access to.
 */
export function useTechnicians(companyId?: string | null, allowedCompanyIds?: string[]) {
  const [technicians, setTechnicians] = useState<TechnicianInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const prevKey = useRef<string>("");

  useEffect(() => {
    const key = companyId || (allowedCompanyIds?.join(",") || "none");
    if (key === prevKey.current && technicians.length > 0) return;
    prevKey.current = key;
    setLoading(true);

    async function fetch() {
      const ids = companyId ? [companyId] : allowedCompanyIds ?? [];
      const { data, error } = await supabase.rpc("resource_plan_personnel", { _company_ids: ids });
      if (error) console.warn("[ResourcePlan] Personnel unavailable:", error.message);
      setTechnicians(error ? [] : [...new Map((data ?? []).map(row => [row.id, { ...row, email: "" }])).values()]);
      setLoading(false);
    }

    fetch();
  }, [companyId, allowedCompanyIds?.join(",")]);

  return { technicians, loading };
}
