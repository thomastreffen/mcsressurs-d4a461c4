import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";

const sb = supabase as any;

export interface ChemicalRow {
  id: string;
  company_id: string;
  product_name: string;
  supplier: string | null;
  manufacturer: string | null;
  category: string | null;
  usage_area: string | null;
  locations: string[];
  hms_areas: string[];
  pictograms: string[];
  h_statements: string[];
  p_statements: string[];
  ppe_requirements: string | null;
  ventilation_requirements: string | null;
  first_aid: string | null;
  storage_requirements: string | null;
  waste_handling: string | null;
  sds_path: string | null;
  sds_filename: string | null;
  sds_revision_date: string | null;
  sds_version: string | null;
  sds_uploaded_at: string | null;
  status: string;
  is_high_risk: boolean;
  requires_training: boolean;
  requires_acknowledgement: boolean;
  requires_sja: boolean;
  requires_special_ppe: boolean;
  notes: string | null;
  updated_at: string;
}

export interface ChemicalRecipientRow {
  id: string;
  distribution_id: string;
  chemical_id: string;
  person_id: string | null;
  user_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  share_token: string;
  section_titles: string[];
  sds_revision_date: string | null;
  sds_version: string | null;
  channel: string;
  delivery_status: string;
  delivery_error: string | null;
  sent_at: string | null;
  first_opened_at: string | null;
  acknowledged_at: string | null;
  ack_method: string | null;
  reminder_count: number;
}

const CHEMICAL_COLS =
  "id, company_id, product_name, supplier, manufacturer, category, usage_area, locations, hms_areas, " +
  "pictograms, h_statements, p_statements, ppe_requirements, ventilation_requirements, first_aid, " +
  "storage_requirements, waste_handling, sds_path, sds_filename, sds_revision_date, sds_version, " +
  "sds_uploaded_at, status, is_high_risk, requires_training, requires_acknowledgement, requires_sja, " +
  "requires_special_ppe, notes, updated_at";

export function useChemicals() {
  const { activeCompanyId: cid } = useCompanyContext();
  return useQuery<ChemicalRow[]>({
    queryKey: ["hms-chemicals", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await sb
        .from("hms_chemicals")
        .select(CHEMICAL_COLS)
        .eq("company_id", cid)
        .is("deleted_at", null)
        .order("product_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChemicalRow[];
    },
  });
}

export function useChemical(id?: string) {
  return useQuery<ChemicalRow | null>({
    queryKey: ["hms-chemical", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await sb.from("hms_chemicals").select(CHEMICAL_COLS).eq("id", id).maybeSingle();
      if (error) throw error;
      return (data ?? null) as ChemicalRow | null;
    },
  });
}

export function useSaveChemical() {
  const { activeCompanyId: cid } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ChemicalRow> & { id?: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const payload: Record<string, unknown> = { ...input, updated_by: u.user?.id, updated_at: new Date().toISOString() };
      delete (payload as any).id;

      if (input.id) {
        const { error } = await sb.from("hms_chemicals").update(payload).eq("id", input.id);
        if (error) throw error;
        await logChemicalAudit(cid!, input.id, "chemical.updated", { product_name: input.product_name });
        return input.id;
      }
      const { data, error } = await sb
        .from("hms_chemicals")
        .insert({ ...payload, company_id: cid, created_by: u.user?.id })
        .select("id")
        .single();
      if (error) throw error;
      await logChemicalAudit(cid!, data.id, "chemical.created", { product_name: input.product_name });
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hms-chemicals"] });
      qc.invalidateQueries({ queryKey: ["hms-chemical"] });
    },
  });
}

export function useDeleteChemical() {
  const { activeCompanyId: cid } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await sb
        .from("hms_chemicals")
        .update({ deleted_at: new Date().toISOString(), deleted_by: u.user?.id })
        .eq("id", id);
      if (error) throw error;
      await logChemicalAudit(cid!, id, "chemical.deleted", {});
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hms-chemicals"] }),
  });
}

/** HMS-kapitler koblet til kjemikaliet. */
export function useChemicalSections(chemicalId?: string) {
  return useQuery<{ section_id: string; heading: string; handbook_title: string | null }[]>({
    queryKey: ["hms-chemical-sections", chemicalId],
    enabled: !!chemicalId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("hms_chemical_sections")
        .select("section_id, hms_handbook_sections(heading, version_id)")
        .eq("chemical_id", chemicalId);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        section_id: r.section_id,
        heading: r.hms_handbook_sections?.heading ?? "Kapittel",
        handbook_title: null,
      }));
    },
  });
}

export function useSetChemicalSections() {
  const { activeCompanyId: cid } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ chemicalId, sectionIds }: { chemicalId: string; sectionIds: string[] }) => {
      const { error: delErr } = await sb.from("hms_chemical_sections").delete().eq("chemical_id", chemicalId);
      if (delErr) throw delErr;
      if (sectionIds.length > 0) {
        const { error } = await sb
          .from("hms_chemical_sections")
          .insert(sectionIds.map((section_id) => ({ chemical_id: chemicalId, section_id, company_id: cid })));
        if (error) throw error;
      }
      await logChemicalAudit(cid!, chemicalId, "chemical.sections_updated", { section_ids: sectionIds });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hms-chemical-sections"] }),
  });
}

/** Alle publiserte/aktuelle HMS-kapitler man kan koble til (nyeste utgave per håndbok). */
export function useHandbookSectionOptions() {
  const { activeCompanyId: cid } = useCompanyContext();
  return useQuery<{ id: string; heading: string; handbook_title: string }[]>({
    queryKey: ["hms-section-options", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data: books } = await sb
        .from("hms_handbooks")
        .select("id, title, current_version_id")
        .eq("company_id", cid)
        .is("deleted_at", null);
      const versions = (books ?? []).filter((b: any) => b.current_version_id);
      if (versions.length === 0) return [];
      const { data: secs, error } = await sb
        .from("hms_handbook_sections")
        .select("id, heading, ordering, version_id")
        .in("version_id", versions.map((v: any) => v.current_version_id))
        .order("ordering", { ascending: true });
      if (error) throw error;
      const titleByVersion = new Map(versions.map((v: any) => [v.current_version_id, v.title]));
      return (secs ?? []).map((s: any) => ({
        id: s.id,
        heading: s.heading,
        handbook_title: titleByVersion.get(s.version_id) ?? "Håndbok",
      }));
    },
  });
}

export function useChemicalRecipients(chemicalId?: string) {
  return useQuery<ChemicalRecipientRow[]>({
    queryKey: ["hms-chemical-recipients", chemicalId],
    enabled: !!chemicalId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("hms_chemical_recipients")
        .select(
          "id, distribution_id, chemical_id, person_id, user_id, full_name, email, phone, share_token, " +
            "section_titles, sds_revision_date, sds_version, channel, delivery_status, delivery_error, " +
            "sent_at, first_opened_at, acknowledged_at, ack_method, reminder_count"
        )
        .eq("chemical_id", chemicalId)
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ChemicalRecipientRow[];
    },
  });
}

/** Alle mottakere i selskapet – brukes til dashboard og risikosjekk i Ressursplan. */
export function useAllChemicalRecipients() {
  const { activeCompanyId: cid } = useCompanyContext();
  return useQuery<ChemicalRecipientRow[]>({
    queryKey: ["hms-chemical-recipients-all", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await sb
        .from("hms_chemical_recipients")
        .select(
          "id, distribution_id, chemical_id, person_id, user_id, full_name, email, phone, share_token, " +
            "section_titles, sds_revision_date, sds_version, channel, delivery_status, delivery_error, " +
            "sent_at, first_opened_at, acknowledged_at, ack_method, reminder_count"
        )
        .eq("company_id", cid);
      if (error) throw error;
      return (data ?? []) as ChemicalRecipientRow[];
    },
  });
}

export interface SendChemicalInput {
  chemical_id: string;
  section_ids?: string[];
  channels: string[];
  subject?: string;
  message?: string;
  kind?: "distribution" | "reminder";
  recipients: { person_id?: string | null; user_id?: string | null; full_name?: string | null; email?: string | null; phone?: string | null }[];
}

export interface SendChemicalResult {
  distribution_id: string;
  recipients: { id: string; full_name: string | null; email: string | null; phone: string | null; link: string; status: string; error: string | null; sms_text: string | null }[];
}

export function useSendChemicalInfo() {
  const qc = useQueryClient();
  return useMutation<SendChemicalResult, Error, SendChemicalInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.functions.invoke("hms-chemical-send", {
        body: { ...input, base_url: window.location.origin },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as SendChemicalResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hms-chemical-recipients"] });
      qc.invalidateQueries({ queryKey: ["hms-chemical-recipients-all"] });
    },
  });
}

/** Signert lenke til sikkerhetsdatablad (innlogget eller via personlig token). */
export async function fetchSdsUrl(args: { chemical_id?: string; token?: string }) {
  const { data, error } = await supabase.functions.invoke("hms-chemical-sds", { body: args });
  if (error) throw new Error(error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { url: string; filename: string | null };
}

async function logChemicalAudit(companyId: string, chemicalId: string, action: string, payload: Record<string, unknown>) {
  const { data: u } = await supabase.auth.getUser();
  await sb.from("hms_audit_log").insert({
    company_id: companyId,
    entity_type: "hms_chemical",
    entity_id: chemicalId,
    action,
    performed_by: u.user?.id ?? null,
    payload,
  });
}

/** Kjemikalier den innloggede ansatte skal kjenne, med egne bekreftelser. */
export function useMyChemicals() {
  const { activeCompanyId: cid } = useCompanyContext();
  return useQuery({
    queryKey: ["hms-my-chemicals", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      const { data: chems } = await sb
        .from("hms_chemicals")
        .select(CHEMICAL_COLS)
        .eq("company_id", cid)
        .is("deleted_at", null)
        .neq("status", "expired")
        .order("product_name");

      let personId: string | null = null;
      if (uid) {
        const { data: acc } = await sb
          .from("user_accounts")
          .select("person_id")
          .eq("auth_user_id", uid)
          .eq("company_id", cid)
          .maybeSingle();
        personId = acc?.person_id ?? null;
      }

      const { data: acks } = await sb
        .from("hms_chemical_acknowledgements")
        .select("chemical_id, acknowledged_at, sds_revision_date")
        .eq("company_id", cid)
        .or([uid ? `user_id.eq.${uid}` : null, personId ? `person_id.eq.${personId}` : null].filter(Boolean).join(",") || "user_id.is.null");

      const ackMap = new Map<string, { acknowledged_at: string; sds_revision_date: string | null }>();
      for (const a of acks ?? []) {
        const prev = ackMap.get(a.chemical_id);
        if (!prev || prev.acknowledged_at < a.acknowledged_at) ackMap.set(a.chemical_id, a);
      }

      return ((chems ?? []) as ChemicalRow[]).map((c) => {
        const ack = ackMap.get(c.id);
        const outdated = !!ack && !!c.sds_revision_date && (ack.sds_revision_date ?? "") < c.sds_revision_date;
        return { chemical: c, acknowledged_at: ack?.acknowledged_at ?? null, needs_new_ack: outdated };
      });
    },
  });
}
