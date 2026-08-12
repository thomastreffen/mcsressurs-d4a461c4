import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const sb = supabase as any;

export interface CompetenceType {
  id: string;
  key: string;
  name: string;
  category: string;
  description: string | null;
  default_validity_months: number | null;
  requires_document: boolean;
  required_for_all: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface Competence {
  id: string;
  person_id: string;
  competence_type_id: string | null;
  type_label: string | null;
  description: string | null;
  issuer: string | null;
  reference_number: string | null;
  issued_at: string | null;
  valid_from: string | null;
  expires_at: string | null;
  comment: string | null;
  document_id: string | null;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
}

export interface ComplianceEmployee {
  person_id: string;
  full_name: string;
  email: string | null;
  department_id: string | null;
  department_name: string | null;
  relationship_type: string | null;
  trade_certificate_type: string | null;
  hms_card_expires_at: string | null;
}

export interface Regulation {
  id: string;
  name: string;
  short_name: string | null;
  reg_type: string;
  description: string | null;
  relevance: string | null;
  source_url: string | null;
  responsible_person_id: string | null;
  responsible_role: string | null;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  review_interval_months: number | null;
  status: string;
  notes: string | null;
}

export interface OrgRole {
  id: string;
  title: string;
  role_type: string;
  person_id: string | null;
  department_id: string | null;
  deputy_person_id: string | null;
  responsibilities: string | null;
  tasks: string | null;
  authority: string | null;
  valid_from: string | null;
  valid_to: string | null;
  sort_order: number;
}

export interface ComplianceAudit {
  id: string;
  title: string;
  audit_type: string;
  planned_date: string | null;
  performed_at: string | null;
  responsible_person_id: string | null;
  participants: string[];
  areas: string[];
  findings: string | null;
  deviations: string | null;
  improvements: string | null;
  conclusion: string | null;
  status: string;
}

function useCid() {
  const { activeCompanyId } = useCompanyContext();
  return activeCompanyId;
}

export function useCompetenceTypes() {
  const cid = useCid();
  return useQuery<CompetenceType[]>({
    queryKey: ["compliance-competence-types", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await sb
        .from("compliance_competence_types")
        .select("*")
        .eq("company_id", cid)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useComplianceEmployees() {
  const cid = useCid();
  return useQuery<ComplianceEmployee[]>({
    queryKey: ["compliance-employees", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await sb
        .from("employment_profiles")
        .select("person_id, department_id, relationship_type, trade_certificate_type, hms_card_expires_at, people(full_name, email, is_active), departments(name)")
        .eq("company_id", cid)
        .is("archived_at", null)
        .eq("include_in_hms_people", true);
      if (error) throw error;
      return (data ?? [])
        .filter((r: any) => r.people?.is_active !== false)
        .map((r: any) => ({
          person_id: r.person_id,
          full_name: r.people?.full_name ?? "Ukjent",
          email: r.people?.email ?? null,
          department_id: r.department_id,
          department_name: r.departments?.name ?? null,
          relationship_type: r.relationship_type,
          trade_certificate_type: r.trade_certificate_type,
          hms_card_expires_at: r.hms_card_expires_at,
        }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name, "nb"));
    },
  });
}

export function useCompetences(personId?: string) {
  const cid = useCid();
  return useQuery<Competence[]>({
    queryKey: ["compliance-competences", cid, personId ?? "all"],
    enabled: !!cid,
    queryFn: async () => {
      let q = sb
        .from("compliance_competences")
        .select("*")
        .eq("company_id", cid)
        .is("deleted_at", null);
      if (personId) q = q.eq("person_id", personId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCompetenceMutations() {
  const cid = useCid();
  const { user } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["compliance-competences"] });
    qc.invalidateQueries({ queryKey: ["compliance-overview"] });
  };

  const save = useMutation({
    mutationFn: async (payload: Partial<Competence> & { person_id: string; file?: File | null }) => {
      const { file, ...rest } = payload as any;
      let row: any;
      if (rest.id) {
        const { data, error } = await sb
          .from("compliance_competences")
          .update({ ...rest, company_id: cid })
          .eq("id", rest.id)
          .select()
          .single();
        if (error) throw error;
        row = data;
      } else {
        const { data, error } = await sb
          .from("compliance_competences")
          .insert({ ...rest, company_id: cid, created_by: user?.id ?? null })
          .select()
          .single();
        if (error) throw error;
        row = data;
      }

      if (file) {
        const safe = file.name.normalize("NFD").replace(/[^\w.\-]/g, "_");
        const path = `compliance/${cid}/${row.id}/${Date.now()}_${safe}`;
        const { error: upErr } = await supabase.storage.from("job-attachments").upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("job-attachments").getPublicUrl(path);
        const { data: doc, error: docErr } = await sb
          .from("documents")
          .insert({
            entity_type: "compliance_competence",
            entity_id: row.id,
            company_id: cid,
            category: "kompetanse",
            source_type: "upload",
            storage_bucket: "job-attachments",
            file_path: path,
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type || "application/octet-stream",
            public_url: pub?.publicUrl ?? null,
            uploaded_by: user?.id ?? null,
          })
          .select("id")
          .single();
        if (docErr) throw docErr;
        const { error: linkErr } = await sb
          .from("compliance_competences")
          .update({ document_id: doc.id })
          .eq("id", row.id);
        if (linkErr) throw linkErr;
      }
      return row;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Kompetanse lagret");
    },
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke lagre kompetanse"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("compliance_competences")
        .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Kompetanse fjernet");
    },
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke fjerne"),
  });

  const verify = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("compliance_competences")
        .update({ verified_by: user?.id ?? null, verified_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Verifisert");
    },
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke verifisere"),
  });

  return { save, remove, verify };
}

export function useCompetenceDocuments(competenceIds: string[]) {
  const cid = useCid();
  const key = [...competenceIds].sort().join(",");
  return useQuery<Record<string, { id: string; file_name: string; public_url: string | null; file_path: string }>>({
    queryKey: ["compliance-competence-docs", cid, key],
    enabled: !!cid && competenceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await sb
        .from("documents")
        .select("id, entity_id, file_name, public_url, file_path")
        .eq("entity_type", "compliance_competence")
        .in("entity_id", competenceIds)
        .is("deleted_at", null);
      if (error) throw error;
      const map: Record<string, any> = {};
      for (const d of data ?? []) map[d.entity_id] = d;
      return map;
    },
  });
}

/* ---------- Regelverk ---------- */

export function useRegulations() {
  const cid = useCid();
  return useQuery<Regulation[]>({
    queryKey: ["compliance-regulations", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await sb
        .from("compliance_regulations")
        .select("*")
        .eq("company_id", cid)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRegulationMutations() {
  const cid = useCid();
  const { user } = useAuth();
  const qc = useQueryClient();
  const done = (msg: string) => {
    qc.invalidateQueries({ queryKey: ["compliance-regulations"] });
    qc.invalidateQueries({ queryKey: ["compliance-overview"] });
    toast.success(msg);
  };

  const save = useMutation({
    mutationFn: async (payload: Partial<Regulation>) => {
      if (payload.id) {
        const { error } = await sb.from("compliance_regulations").update(payload).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await sb
          .from("compliance_regulations")
          .insert({ ...payload, company_id: cid, created_by: user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => done("Regelverk lagret"),
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke lagre"),
  });

  const markReviewed = useMutation({
    mutationFn: async (reg: Regulation) => {
      const today = new Date();
      const next = new Date(today);
      next.setMonth(next.getMonth() + (reg.review_interval_months ?? 12));
      const { error } = await sb
        .from("compliance_regulations")
        .update({
          last_reviewed_at: today.toISOString().slice(0, 10),
          next_review_at: next.toISOString().slice(0, 10),
          status: "active",
        })
        .eq("id", reg.id);
      if (error) throw error;
    },
    onSuccess: () => done("Gjennomgang registrert"),
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke oppdatere"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("compliance_regulations")
        .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => done("Regelverk fjernet"),
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke fjerne"),
  });

  return { save, markReviewed, remove };
}

/* ---------- Organisasjon og ansvar ---------- */

export function useOrgRoles() {
  const cid = useCid();
  return useQuery<OrgRole[]>({
    queryKey: ["compliance-org-roles", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await sb
        .from("compliance_org_roles")
        .select("*")
        .eq("company_id", cid)
        .is("deleted_at", null)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useOrgRoleMutations() {
  const cid = useCid();
  const { user } = useAuth();
  const qc = useQueryClient();
  const done = (msg: string) => {
    qc.invalidateQueries({ queryKey: ["compliance-org-roles"] });
    qc.invalidateQueries({ queryKey: ["compliance-overview"] });
    toast.success(msg);
  };

  const save = useMutation({
    mutationFn: async (payload: Partial<OrgRole>) => {
      if (payload.id) {
        const { error } = await sb.from("compliance_org_roles").update(payload).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await sb
          .from("compliance_org_roles")
          .insert({ ...payload, company_id: cid, created_by: user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => done("Rolle lagret"),
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke lagre"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("compliance_org_roles")
        .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => done("Rolle fjernet"),
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke fjerne"),
  });

  return { save, remove };
}

/* ---------- Internkontroll ---------- */

export function useComplianceAudits() {
  const cid = useCid();
  return useQuery<ComplianceAudit[]>({
    queryKey: ["compliance-audits", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await sb
        .from("compliance_audits")
        .select("*")
        .eq("company_id", cid)
        .is("deleted_at", null)
        .order("performed_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAuditMutations() {
  const cid = useCid();
  const { user } = useAuth();
  const qc = useQueryClient();
  const done = (msg: string) => {
    qc.invalidateQueries({ queryKey: ["compliance-audits"] });
    qc.invalidateQueries({ queryKey: ["compliance-overview"] });
    toast.success(msg);
  };

  const save = useMutation({
    mutationFn: async (payload: Partial<ComplianceAudit>) => {
      if (payload.id) {
        const { error } = await sb.from("compliance_audits").update(payload).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await sb
          .from("compliance_audits")
          .insert({ ...payload, company_id: cid, created_by: user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => done("Internrevisjon lagret"),
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke lagre"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("compliance_audits")
        .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => done("Internrevisjon fjernet"),
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke fjerne"),
  });

  /** Avvik/tiltak gjenbruker eksisterende HMS-tiltakssystem */
  const createAction = useMutation({
    mutationFn: async (input: { audit_id: string; title: string; description?: string; due_date?: string | null; priority?: string }) => {
      const { error } = await sb.from("hms_action_items").insert({
        company_id: cid,
        compliance_audit_id: input.audit_id,
        title: input.title,
        description: input.description ?? null,
        due_date: input.due_date ?? null,
        priority: input.priority ?? "medium",
        status: "open",
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance-audit-actions"] });
      qc.invalidateQueries({ queryKey: ["compliance-overview"] });
      toast.success("Tiltak opprettet");
    },
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke opprette tiltak"),
  });

  return { save, remove, createAction };
}

export function useAuditActions(auditId?: string) {
  const cid = useCid();
  return useQuery<any[]>({
    queryKey: ["compliance-audit-actions", cid, auditId ?? "all"],
    enabled: !!cid,
    queryFn: async () => {
      let q = sb
        .from("hms_action_items")
        .select("id, title, description, status, priority, due_date, compliance_audit_id")
        .eq("company_id", cid)
        .is("deleted_at", null)
        .not("compliance_audit_id", "is", null);
      if (auditId) q = q.eq("compliance_audit_id", auditId);
      const { data, error } = await q.order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ---------- Åpne HMS-avvik (gjenbruk) ---------- */

export function useOpenHmsCounts() {
  const cid = useCid();
  return useQuery<{ incidents: number; overdueActions: number; openActions: number }>({
    queryKey: ["compliance-overview", "hms-counts", cid],
    enabled: !!cid,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const countOf = async (p: any) => ((await p).count ?? 0);
      const [incidents, overdueActions, openActions] = await Promise.all([
        countOf(sb.from("hms_incidents").select("id", { count: "exact", head: true }).eq("company_id", cid).is("deleted_at", null).not("status", "in", "(closed,rejected)")),
        countOf(sb.from("hms_action_items").select("id", { count: "exact", head: true }).eq("company_id", cid).is("deleted_at", null).in("status", ["open", "in_progress"]).not("due_date", "is", null).lt("due_date", today)),
        countOf(sb.from("hms_action_items").select("id", { count: "exact", head: true }).eq("company_id", cid).is("deleted_at", null).in("status", ["open", "in_progress"])),
      ]);
      return { incidents, overdueActions, openActions };
    },
  });
}
