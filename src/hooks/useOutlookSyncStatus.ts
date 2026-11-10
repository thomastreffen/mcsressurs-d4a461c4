import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type OutlookSyncStatus = "ok" | "access_missing" | "error" | "unknown";

/** Company-scoped, read-only Outlook import status per technician (server filters by resource_plan view access). */
export function useOutlookSyncStatus(companyIds: string[]) {
  const ids = [...new Set(companyIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: ["outlook-sync-status", ids],
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("resource_plan_outlook_sync_status", { _company_ids: ids });
      if (error) throw error;
      const map = new Map<string, OutlookSyncStatus>();
      for (const r of data ?? []) map.set(r.technician_id as string, r.status as OutlookSyncStatus);
      return map;
    },
  });
}

export function outlookStatusLabel(s?: OutlookSyncStatus): string | null {
  if (s === "access_missing") return "Outlook-tilgang mangler";
  if (s === "error") return "Outlook-synk feiler";
  return null;
}
