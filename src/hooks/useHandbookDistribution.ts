import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";

const sb = supabase as any;

export interface HandbookRecipientRow {
  id: string;
  distribution_id: string;
  handbook_id: string;
  version_id: string;
  person_id: string | null;
  user_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  share_token: string;
  section_ids: string[];
  section_titles: string[];
  channel: string;
  delivery_status: string;
  delivery_error: string | null;
  sent_at: string | null;
  first_opened_at: string | null;
  last_opened_at: string | null;
  open_count: number;
  acknowledged_at: string | null;
  ack_method: string | null;
  reminder_count: number;
}

export interface HandbookDistributionRow {
  id: string;
  handbook_id: string;
  version_id: string;
  version_number: number | null;
  section_ids: string[];
  section_titles: string[];
  scope: string;
  channels: string[];
  subject: string | null;
  message: string | null;
  kind: string;
  recipient_count: number;
  sent_by: string | null;
  sent_at: string;
}

export interface SendableEmployee {
  person_id: string;
  user_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
}

/** Aktive ansatte som kan motta HMS-utsending (fra employment_profiles). */
export function useSendableEmployees() {
  const { activeCompanyId: cid } = useCompanyContext();
  return useQuery<SendableEmployee[]>({
    queryKey: ["handbook-sendable-employees", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await sb
        .from("employment_profiles")
        .select("person_id, archived_at, people(full_name, email, phone, is_active)")
        .eq("company_id", cid);
      if (error) throw error;

      const rows = (data ?? []).filter((r: any) => !r.archived_at && r.people?.is_active !== false);
      const personIds = [...new Set(rows.map((r: any) => r.person_id).filter(Boolean))] as string[];
      let userMap = new Map<string, string>();
      if (personIds.length > 0) {
        const { data: accounts } = await sb
          .from("user_accounts")
          .select("person_id, auth_user_id")
          .eq("company_id", cid)
          .in("person_id", personIds);
        userMap = new Map((accounts ?? []).map((a: any) => [a.person_id, a.auth_user_id]));
      }

      const seen = new Set<string>();
      const out: SendableEmployee[] = [];
      for (const r of rows as any[]) {
        if (!r.person_id || seen.has(r.person_id)) continue;
        seen.add(r.person_id);
        out.push({
          person_id: r.person_id,
          user_id: userMap.get(r.person_id) ?? null,
          full_name: r.people?.full_name ?? "Ukjent",
          email: r.people?.email ?? null,
          phone: r.people?.phone ?? null,
        });
      }
      return out.sort((a, b) => a.full_name.localeCompare(b.full_name, "nb"));
    },
  });
}

export function useHandbookDistributions(handbookId?: string) {
  const { activeCompanyId: cid } = useCompanyContext();
  return useQuery<HandbookDistributionRow[]>({
    queryKey: ["handbook-distributions", cid, handbookId ?? "all"],
    enabled: !!cid,
    queryFn: async () => {
      let q = sb
        .from("hms_handbook_distributions")
        .select("id, handbook_id, version_id, version_number, section_ids, section_titles, scope, channels, subject, message, kind, recipient_count, sent_by, sent_at")
        .eq("company_id", cid)
        .order("sent_at", { ascending: false })
        .limit(200);
      if (handbookId) q = q.eq("handbook_id", handbookId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as HandbookDistributionRow[];
    },
  });
}

export function useHandbookRecipients(handbookId?: string) {
  const { activeCompanyId: cid } = useCompanyContext();
  return useQuery<HandbookRecipientRow[]>({
    queryKey: ["handbook-recipients", cid, handbookId ?? "all"],
    enabled: !!cid,
    queryFn: async () => {
      let q = sb
        .from("hms_handbook_recipients")
        .select("id, distribution_id, handbook_id, version_id, person_id, user_id, full_name, email, phone, share_token, section_ids, section_titles, channel, delivery_status, delivery_error, sent_at, first_opened_at, last_opened_at, open_count, acknowledged_at, ack_method, reminder_count")
        .eq("company_id", cid)
        .order("sent_at", { ascending: false })
        .limit(1000);
      if (handbookId) q = q.eq("handbook_id", handbookId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as HandbookRecipientRow[];
    },
  });
}

export interface SendPayload {
  handbook_id: string;
  version_id: string;
  section_ids?: string[];
  channels: string[];
  subject?: string;
  message?: string;
  kind?: "distribution" | "reminder";
  chemical_mode?: ChemicalInclusionMode;
  chemical_ids?: string[];
  audience_tags?: string[];
  extra_resources?: HandbookResourceLink[];
  recipients: { person_id?: string | null; user_id?: string | null; full_name?: string | null; email?: string | null; phone?: string | null }[];
}


export interface SendResultRecipient {
  id: string; full_name: string | null; email: string | null; phone: string | null;
  link: string; status: string; error: string | null; sms_text: string | null;
}

export function useSendHandbook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SendPayload) => {
      const { data, error } = await sb.functions.invoke("hms-handbook-send", {
        body: { ...payload, base_url: window.location.origin },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { distribution_id: string; recipients: SendResultRecipient[] };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["handbook-distributions"] });
      qc.invalidateQueries({ queryKey: ["handbook-recipients"] });
      qc.invalidateQueries({ queryKey: ["handbook-ack-status"] });
    },
  });
}

export type RecipientState = "acknowledged" | "opened" | "sent" | "failed";

export function recipientState(r: HandbookRecipientRow): RecipientState {
  if (r.acknowledged_at) return "acknowledged";
  if (r.delivery_status === "failed") return "failed";
  if (r.first_opened_at) return "opened";
  return "sent";
}

export const RECIPIENT_STATE_LABEL: Record<RecipientState, string> = {
  acknowledged: "Bekreftet",
  opened: "Åpnet",
  sent: "Sendt",
  failed: "Ikke levert",
};
