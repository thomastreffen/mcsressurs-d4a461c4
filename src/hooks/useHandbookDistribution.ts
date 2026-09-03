import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { ChemicalInclusionMode, HandbookResourceLink } from "@/lib/hms/handbookPackage";
import { fetchHmsEmployeeBasis } from "@/lib/hms/employeeBasis";

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
  included_resources: HandbookResourceLink[];
  chemical_snapshot: Array<{
    id: string;
    product_name: string;
    sds_version: string | null;
    sds_revision_date: string | null;
    has_sds: boolean;
  }>;
}

export interface HandbookSectionResourceRow {
  id: string;
  heading: string;
  ordering: number;
  is_mandatory: boolean;
  resource_links: HandbookResourceLink[];
  chemical_ids: string[];
  coverage_areas: string[];
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
  included_resources: HandbookResourceLink[] | null;
  chemical_ids: string[] | null;
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
  is_shared_resource: boolean;
  other_company_names: string[];
}

/** Aktive ansatte i valgt firma som kan motta HMS-utsending (felles HMS-grunnlag). */
export function useSendableEmployees() {
  const { activeCompanyId: cid, allowedCompanyIds } = useCompanyContext();
  const scopeOk = !!cid && (!allowedCompanyIds?.length || allowedCompanyIds.includes(cid));
  return useQuery<SendableEmployee[]>({
    queryKey: ["handbook-sendable-employees", cid],
    enabled: scopeOk,
    queryFn: async () => {
      const rows = await fetchHmsEmployeeBasis(cid!);
      return rows.map((r) => ({
        person_id: r.person_id,
        user_id: r.user_id,
        full_name: r.full_name,
        email: r.email,
        phone: r.phone,
        is_shared_resource: r.is_shared_resource,
        other_company_names: r.other_company_names,
      }));
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
        .select("id, handbook_id, version_id, version_number, section_ids, section_titles, scope, channels, subject, message, kind, recipient_count, sent_by, sent_at, included_resources, chemical_ids")
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
        .select("id, distribution_id, handbook_id, version_id, person_id, user_id, full_name, email, phone, share_token, section_ids, section_titles, channel, delivery_status, delivery_error, sent_at, first_opened_at, last_opened_at, open_count, acknowledged_at, ack_method, reminder_count, included_resources, chemical_snapshot")
        .eq("company_id", cid)
        .order("sent_at", { ascending: false })
        .limit(1000);
      if (handbookId) q = q.eq("handbook_id", handbookId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        ...row,
        included_resources: Array.isArray(row.included_resources) ? row.included_resources : [],
        chemical_snapshot: Array.isArray(row.chemical_snapshot) ? row.chemical_snapshot : [],
      })) as HandbookRecipientRow[];
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


/** Kapitler med koblede ressurser, kjemikalier og dekningsområder for en utgave. */
export function useHandbookSectionResources(versionId?: string | null) {
  return useQuery<HandbookSectionResourceRow[]>({
    queryKey: ["handbook-section-resources", versionId ?? "none"],
    enabled: !!versionId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("hms_handbook_sections")
        .select("id, heading, ordering, is_mandatory, resource_links, chemical_ids, coverage_areas")
        .eq("version_id", versionId)
        .order("ordering", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((s: any) => ({
        ...s,
        resource_links: Array.isArray(s.resource_links) ? s.resource_links : [],
        chemical_ids: s.chemical_ids ?? [],
        coverage_areas: s.coverage_areas ?? [],
      })) as HandbookSectionResourceRow[];
    },
  });
}

export function useSaveSectionResources() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      section_id: string;
      version_id: string;
      resource_links?: HandbookResourceLink[];
      chemical_ids?: string[];
      coverage_areas?: string[];
    }) => {
      const patch: Record<string, unknown> = {};
      if (input.resource_links) patch.resource_links = input.resource_links;
      if (input.chemical_ids) patch.chemical_ids = input.chemical_ids;
      if (input.coverage_areas) patch.coverage_areas = input.coverage_areas;
      const { error } = await sb.from("hms_handbook_sections").update(patch).eq("id", input.section_id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["handbook-section-resources", v.version_id] });
    },
  });
}
