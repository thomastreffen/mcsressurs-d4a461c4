import { useQuery } from "@tanstack/react-query";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { fetchHmsEmployeeBasis, type HmsEmployeeBasisRow } from "@/lib/hms/employeeBasis";

/**
 * Felles kilde for aktive ansatte i valgt firma (HMS/HR).
 * Brukes av bekreftelser, utsending og ansattoversikter så tallene alltid matcher.
 */
export function useHmsEmployees(opts?: { includeArchived?: boolean }) {
  const { activeCompanyId: cid, allowedCompanyIds } = useCompanyContext();
  const scopeOk = !!cid && (!allowedCompanyIds?.length || allowedCompanyIds.includes(cid));
  return useQuery<HmsEmployeeBasisRow[]>({
    queryKey: ["hms-employee-basis", cid, opts?.includeArchived ?? false],
    enabled: scopeOk,
    queryFn: () => fetchHmsEmployeeBasis(cid!, opts),
  });
}
