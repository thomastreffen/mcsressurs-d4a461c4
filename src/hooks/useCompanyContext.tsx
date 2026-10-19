import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMountLog } from "@/lib/debugMount";

interface Company {
  id: string;
  name: string;
  org_number: string | null;
}

interface CompanyContextType {
  companies: Company[];
  /** null means "Alle selskaper" (cross-company aggregate) */
  activeCompanyId: string | null;
  activeCompany: Company | null;
  setActiveCompanyId: (id: string | null) => void;
  loading: boolean;
  userMemberships: { company_id: string; department_id: string | null; role_id: string | null }[];
  /** True when user explicitly chose "all companies" */
  isAllCompanies: boolean;
  /** Company IDs the user actually has membership in */
  allowedCompanyIds: string[];
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: ReactNode }) {
  useMountLog("COMPANY CONTEXT INIT");
  const { user, isSuperAdmin } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null);
  const [isAllCompanies, setIsAllCompanies] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userMemberships, setUserMemberships] = useState<{ company_id: string; department_id: string | null; role_id: string | null }[]>([]);
  // Which person the current company list belongs to. A background re-check for
  // the same person must keep the existing company and UI on screen.
  const loadedForUser = useRef<string | null>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      loadedForUser.current = null;
      setCompanies([]);
      setActiveCompanyIdState(null);
      setIsAllCompanies(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function fetch() {
      if (!userId) return;
      if (loadedForUser.current !== userId) setLoading(true);
      // Get user memberships
      const { data: memberships } = await supabase
        .from("user_memberships")
        .select("company_id, department_id, role_id")
        .eq("user_id", userId)
        .eq("is_active", true);

      if (cancelled) return;
      setUserMemberships(
        (memberships || []).map((m: any) => ({
          company_id: m.company_id,
          department_id: m.department_id,
          role_id: m.role_id,
        }))
      );

      const { data: access, error } = await supabase.rpc("my_company_module_access");
      if (cancelled) return;
      const companyList: Company[] = error ? [] : [...new Map((access ?? []).map(row => [row.company_id, { id: row.company_id, name: row.company_name, org_number: row.org_number }])).values()];

      setCompanies(companyList);

      // Restore from localStorage or pick first
      const stored = localStorage.getItem("mcs_active_company");
      if (stored === "__all__") {
        setActiveCompanyIdState(null);
        setIsAllCompanies(true);
      } else if (stored && companyList.some((c) => c.id === stored)) {
        setActiveCompanyIdState(stored);
        setIsAllCompanies(false);
      } else if (companyList.length > 0) {
        setActiveCompanyIdState(companyList[0].id);
        setIsAllCompanies(false);
      } else {
        setActiveCompanyIdState(null);
        setIsAllCompanies(false);
      }

      loadedForUser.current = userId;
      setLoading(false);
    }

    fetch();
    return () => { cancelled = true; };
  }, [userId, isSuperAdmin]);

  const setActiveCompanyId = useCallback((id: string | null) => {
    if (id && !companies.some(company => company.id === id)) return;
    if (id === null) {
      setActiveCompanyIdState(null);
      setIsAllCompanies(true);
      localStorage.setItem("mcs_active_company", "__all__");
    } else {
      setActiveCompanyIdState(id);
      setIsAllCompanies(false);
      localStorage.setItem("mcs_active_company", id);
    }
  }, [companies]);

  const activeCompany = useMemo(() => companies.find((c) => c.id === activeCompanyId) || null, [companies, activeCompanyId]);
  const allowedCompanyIds = useMemo(() => companies.map((c) => c.id), [companies]);
  const value = useMemo(
    () => ({ companies, activeCompanyId, activeCompany, setActiveCompanyId, loading, userMemberships, isAllCompanies, allowedCompanyIds }),
    [companies, activeCompanyId, activeCompany, setActiveCompanyId, loading, userMemberships, isAllCompanies, allowedCompanyIds]
  );

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompanyContext() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompanyContext must be used within CompanyProvider");
  return ctx;
}
