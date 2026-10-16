import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { permitsModule, type CompanyModule, type AccessLevel, type CompanyModuleGrant } from '@/lib/company-module-access';

export function useCompanyModuleAccess() {
  const { user } = useAuth();
  const company = useCompanyContext();
  const query = useQuery({
    queryKey: ['company-module-access', user?.id],
    enabled: !!user?.id,
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_company_module_access');
      if (error) throw error;
      return (data ?? []) as CompanyModuleGrant[];
    },
  });
  const rows = query.data ?? [];
  return {
    rows,
    loading: company.loading || query.isLoading,
    error: query.error,
    refetch: query.refetch,
    can: (module: CompanyModule, level: AccessLevel = 'view') => !query.error && permitsModule(rows, company.activeCompanyId, module, level),
    companyIds: (module: CompanyModule, level: AccessLevel = 'view') => [...new Set(rows.filter(row => row.module === module && row[`can_${level}`]).map(row => row.company_id))],
    limited: !!company.activeCompanyId && rows.some(row => row.company_id === company.activeCompanyId && !row.is_home),
  };
}