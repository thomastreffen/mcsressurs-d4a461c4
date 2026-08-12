import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { RequirementStatus } from "@/lib/compliance";

const sb = supabase as any;

export type RequirementScope = "company" | "department" | "role" | "person";

export interface CompetenceRequirement {
  id: string;
  company_id: string;
  competence_type_id: string;
  scope_type: RequirementScope;
  scope_id: string | null;
  required: boolean;
  document_required: boolean;
  validity_months: number | null;
  warning_days: number | null;
  description: string | null;
  reason: string | null;
  active: boolean;
  valid_from: string | null;
  valid_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobRole {
  id: string;
  name: string;
  description: string | null;
  is_field_role: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface RequirementStatusRow {
  person_id: string;
  competence_type_id: string;
  requirement_id: string;
  required: boolean;
  document_required: boolean;
  validity_months: number | null;
  warning_days: number | null;
  reason: string | null;
  source_scope: RequirementScope;
  source_label: string | null;
  competence_id: string | null;
  expires_at: string | null;
  has_document: boolean;
  days_until: number | null;
  status: RequirementStatus;
}

function useCid() {
  const { activeCompanyId } = useCompanyContext();
  return activeCompanyId;
}

/* ---------- Stillinger / roller ---------- */

export function useJobRoles(includeInactive = false) {
  const cid = useCid();
  return useQuery<JobRole[]>({
    queryKey: ["compliance-job-roles", cid, includeInactive],
    enabled: !!cid,
    queryFn: async () => {
      let q = sb.from("compliance_job_roles").select("*").eq("company_id", cid);
      if (!includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q.order("sort_order").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useJobRoleMutations() {
  const cid = useCid();
  const { user } = useAuth();
  const qc = useQueryClient();
  const done = (msg: string) => {
    qc.invalidateQueries({ queryKey: ["compliance-job-roles"] });
    qc.invalidateQueries({ queryKey: ["compliance-requirement-status"] });
    toast.success(msg);
  };

  const save = useMutation({
    mutationFn: async (payload: Partial<JobRole>) => {
      if (payload.id) {
        const { error } = await sb.from("compliance_job_roles").update(payload).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await sb
          .from("compliance_job_roles")
          .insert({ ...payload, company_id: cid, created_by: user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => done("Stilling lagret"),
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke lagre stilling"),
  });

  return { save };
}

/** Stilling på ansattkortet (employment_profiles er master) */
export function usePersonJobRole(personId?: string) {
  const cid = useCid();
  return useQuery<{ profile_id: string; job_role_id: string | null; department_id: string | null } | null>({
    queryKey: ["person-job-role", cid, personId],
    enabled: !!cid && !!personId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("employment_profiles")
        .select("id, job_role_id, department_id")
        .eq("company_id", cid)
        .eq("person_id", personId)
        .is("archived_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ? { profile_id: data.id, job_role_id: data.job_role_id, department_id: data.department_id } : null;
    },
  });
}

export function useSetPersonJobRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ profileId, jobRoleId }: { profileId: string; jobRoleId: string | null }) => {
      const { error } = await sb.from("employment_profiles").update({ job_role_id: jobRoleId }).eq("id", profileId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["person-job-role"] });
      qc.invalidateQueries({ queryKey: ["compliance-requirement-status"] });
      qc.invalidateQueries({ queryKey: ["compliance-employees"] });
      toast.success("Stilling oppdatert");
    },
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke oppdatere stilling"),
  });
}

/* ---------- Kompetansekrav ---------- */

export function useCompetenceRequirements(includeInactive = true) {
  const cid = useCid();
  return useQuery<CompetenceRequirement[]>({
    queryKey: ["compliance-requirements", cid, includeInactive],
    enabled: !!cid,
    queryFn: async () => {
      let q = sb.from("compliance_competence_requirements").select("*").eq("company_id", cid);
      if (!includeInactive) q = q.eq("active", true);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRequirementImpact() {
  const cid = useCid();
  return useQuery<Record<string, number>>({
    queryKey: ["compliance-requirement-impact", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await sb.rpc("compliance_requirement_impact", { _company_id: cid });
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of data ?? []) map[r.requirement_id] = r.affected_people;
      return map;
    },
  });
}

export function useRequirementMutations() {
  const cid = useCid();
  const { user } = useAuth();
  const qc = useQueryClient();
  const invalidate = (msg: string) => {
    qc.invalidateQueries({ queryKey: ["compliance-requirements"] });
    qc.invalidateQueries({ queryKey: ["compliance-requirement-impact"] });
    qc.invalidateQueries({ queryKey: ["compliance-requirement-status"] });
    qc.invalidateQueries({ queryKey: ["compliance-overview"] });
    toast.success(msg);
  };

  const save = useMutation({
    mutationFn: async (payload: Partial<CompetenceRequirement>) => {
      const body: any = { ...payload };
      if (body.scope_type === "company") body.scope_id = null;
      if (body.id) {
        const { id, ...rest } = body;
        const { error } = await sb.from("compliance_competence_requirements").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await sb
          .from("compliance_competence_requirements")
          .insert({ ...body, company_id: cid, created_by: user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => invalidate("Kravet er lagret"),
    onError: (e: any) =>
      toast.error(
        e.message?.includes("unique")
          ? "Det finnes allerede et krav for denne kompetansen på samme nivå"
          : e.message ?? "Kunne ikke lagre kravet",
      ),
  });

  const setActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await sb.from("compliance_competence_requirements").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidate(v.active ? "Kravet er aktivert" : "Kravet er deaktivert"),
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke endre kravet"),
  });

  return { save, setActive };
}

/* ---------- Beregnet kravstatus (kravmotoren) ---------- */

export function useRequirementStatus(personId?: string) {
  const cid = useCid();
  return useQuery<RequirementStatusRow[]>({
    queryKey: ["compliance-requirement-status", cid, personId ?? "all"],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await sb.rpc("compliance_requirement_status", {
        _company_id: cid,
        _person_id: personId ?? null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}
