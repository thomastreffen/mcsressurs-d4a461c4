import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type HubOutlookLinkStatus = {
  link_id: string;
  task_id: string;
  task_title: string;
  mailbox: string;
  state: string;
  conflict_reason: string | null;
  last_error: string | null;
  updated_at: string;
};

export type HubOutlookSyncSettings = {
  enabled: boolean;
  dry_run: boolean;
  inbound_enabled: boolean;
  pilot_mailboxes: string[];
  updated_at: string;
};

/** Company-scoped Hub<->Outlook appointment link status (server filters by resource_plan view access). */
export function useHubOutlookLinks(companyIds: string[]) {
  const ids = [...new Set(companyIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: ["hub-outlook-links", ids],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("hub_outlook_link_status", { _company_ids: ids });
      if (error) throw error;
      return (data ?? []) as HubOutlookLinkStatus[];
    },
  });
}

export function useResolveHubOutlookConflict() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ linkId, resolution }: { linkId: string; resolution: "keep_hub" | "keep_outlook" }) => {
      const { data, error } = await supabase.rpc("resolve_hub_outlook_conflict", { p_link_id: linkId, p_resolution: resolution });
      if (error) throw error;
      if (!(data as { ok?: boolean })?.ok) throw new Error((data as { error?: string })?.error ?? "resolve_failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hub-outlook-links"] }),
  });
}

/** Superadmin-only pilot settings (RLS: only superadmin can read the row). */
export function useHubOutlookSyncSettings(enabled: boolean) {
  return useQuery({
    queryKey: ["hub-outlook-sync-settings"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("hub_outlook_sync_settings").select("enabled,dry_run,inbound_enabled,pilot_mailboxes,updated_at").eq("id", true).maybeSingle();
      if (error) throw error;
      return data as HubOutlookSyncSettings | null;
    },
  });
}

export function useSetHubOutlookSyncSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: { enabled: boolean; dry_run: boolean; inbound_enabled: boolean; pilot_mailboxes: string[] }) => {
      const { data, error } = await supabase.rpc("set_hub_outlook_sync_settings", {
        p_enabled: s.enabled, p_dry_run: s.dry_run, p_inbound_enabled: s.inbound_enabled, p_pilot_mailboxes: s.pilot_mailboxes,
      });
      if (error) throw error;
      if (!(data as { ok?: boolean })?.ok) throw new Error((data as { error?: string })?.error ?? "save_failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hub-outlook-sync-settings"] }),
  });
}

export function conflictReasonLabel(reason: string | null): string {
  switch (reason) {
    case "both_sides_changed": return "Endret både i Hub og Outlook";
    case "cancelled_in_outlook": return "Avlyst i Outlook";
    case "edited_in_outlook": return "Endret i Outlook";
    case "recurring_unsupported": return "Gjentakende avtale støttes ikke ennå";
    case "all_day_unsupported": return "Heldagsavtale støttes ikke ennå";
    case "invalid_time":
    case "invalid_range": return "Ugyldig tidspunkt i Outlook";
    case "missing_change_key": return "Mangler endringsnøkkel fra Outlook";
    default: return reason ?? "Krever avklaring";
  }
}

export function linkStateLabel(state: string): string {
  switch (state) {
    case "synced": return "I synk";
    case "conflict": return "Krever avklaring";
    case "failed": return "Feilet";
    case "pending": return "Venter på utsending";
    case "deleted": return "Slettet i Outlook";
    case "dry_run": return "Testkjøring";
    default: return state;
  }
}
