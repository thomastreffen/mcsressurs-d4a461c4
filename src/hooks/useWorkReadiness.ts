import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import {
  evaluateReadiness,
  type ChemicalLite,
  type CompetenceLite,
  type HandbookAckLite,
  type OverrideLite,
  type ReadinessResult,
  type SectionLite,
} from "@/lib/hms/workReadiness";

const sb = supabase as any;

export interface TechIdentity {
  /** Auth-bruker-id (montør-id i Ressursplan). */
  user_id?: string | null;
  person_id?: string | null;
  email?: string | null;
  full_name?: string | null;
  phone?: string | null;
}

/* ───────────── Risikotagger på oppdrag ───────────── */

export function useEventRiskTags(eventId?: string) {
  return useQuery<string[]>({
    queryKey: ["event-risk-tags", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await sb.from("events").select("risk_tags").eq("id", eventId).maybeSingle();
      if (error) throw error;
      return (data?.risk_tags ?? []) as string[];
    },
  });
}

export function useSetEventRiskTags() {
  const qc = useQueryClient();
  const { activeCompanyId } = useCompanyContext();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ eventId, tags }: { eventId: string; tags: string[] }) => {
      const { error } = await sb.from("events").update({ risk_tags: tags }).eq("id", eventId);
      if (error) throw error;
      await sb.from("hms_audit_log").insert({
        company_id: activeCompanyId,
        entity_type: "work_readiness",
        entity_id: eventId,
        action: "readiness.tags_updated",
        performed_by: user?.id ?? null,
        payload: { risk_tags: tags },
      });
      return tags;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["event-risk-tags", vars.eventId] });
      qc.invalidateQueries({ queryKey: ["readiness-upcoming"] });
    },
  });
}

/* ───────────── Overstyring / vurdering ───────────── */

export interface ReadinessOverrideRow {
  id: string;
  event_id: string;
  person_id: string | null;
  user_id: string | null;
  technician_name: string | null;
  requirement_key: string;
  requirement_label: string | null;
  decision: string;
  comment: string | null;
  created_by: string | null;
  created_at: string;
}

export function useReadinessOverrides(eventId?: string) {
  const { activeCompanyId: cid } = useCompanyContext();
  return useQuery<ReadinessOverrideRow[]>({
    queryKey: ["readiness-overrides", cid, eventId ?? "all"],
    enabled: !!cid,
    queryFn: async () => {
      let q = sb
        .from("hms_readiness_overrides")
        .select("id, event_id, person_id, user_id, technician_name, requirement_key, requirement_label, decision, comment, created_by, created_at")
        .eq("company_id", cid)
        .order("created_at", { ascending: false })
        .limit(500);
      if (eventId) q = q.eq("event_id", eventId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ReadinessOverrideRow[];
    },
  });
}

export function useAddReadinessOverride() {
  const qc = useQueryClient();
  const { activeCompanyId: cid } = useCompanyContext();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      event_id: string;
      tech: TechIdentity;
      requirement_key: string;
      requirement_label?: string | null;
      risk_tags: string[];
      comment: string;
    }) => {
      const { error } = await sb.from("hms_readiness_overrides").insert({
        company_id: cid,
        event_id: input.event_id,
        person_id: input.tech.person_id ?? null,
        user_id: input.tech.user_id ?? null,
        technician_name: input.tech.full_name ?? null,
        requirement_key: input.requirement_key,
        requirement_label: input.requirement_label ?? null,
        risk_tags: input.risk_tags,
        decision: "accepted",
        comment: input.comment,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      await sb.from("hms_audit_log").insert({
        company_id: cid,
        entity_type: "work_readiness",
        entity_id: input.event_id,
        action: "readiness.override",
        performed_by: user?.id ?? null,
        payload: {
          requirement_key: input.requirement_key,
          requirement_label: input.requirement_label,
          risk_tags: input.risk_tags,
          technician: input.tech.full_name,
          comment: input.comment,
        },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["readiness-overrides"] }),
  });
}

/** Logger at planlegger sendte informasjon/purring fra Ressursplan. */
export async function logReadinessAction(
  companyId: string | null | undefined,
  eventId: string | null | undefined,
  action: string,
  payload: Record<string, unknown>
) {
  if (!companyId) return;
  const { data: u } = await supabase.auth.getUser();
  await sb.from("hms_audit_log").insert({
    company_id: companyId,
    entity_type: "work_readiness",
    entity_id: eventId ?? null,
    action,
    performed_by: u.user?.id ?? null,
    payload,
  });
}

/* ───────────── Grunnlagsdata for kravmotoren ───────────── */

interface ReadinessData {
  chemicals: ChemicalLite[];
  sections: SectionLite[];
  chemAcks: { chemical_id: string; person_id: string | null; user_id: string | null; acknowledged_at: string | null; sds_revision_date: string | null }[];
  handbookAcks: (HandbookAckLite & { person_id: string | null; user_id: string | null; email: string | null })[];
  competences: (CompetenceLite & { person_id: string })[];
  employees: { person_id: string; user_id: string | null; email: string | null; full_name: string; phone: string | null }[];
}

export function useReadinessData() {
  const { activeCompanyId: cid } = useCompanyContext();
  return useQuery<ReadinessData>({
    queryKey: ["readiness-data", cid],
    enabled: !!cid,
    staleTime: 30_000,
    queryFn: async () => {
      const [chemRes, bookRes, ackRes, recRes, compRes, typeRes, empRes, accRes] = await Promise.all([
        sb.from("hms_chemicals")
          .select("id, product_name, category, usage_area, hms_areas, status, requires_acknowledgement, requires_sja, requires_special_ppe, sds_path, sds_revision_date, sds_version, ppe_requirements")
          .eq("company_id", cid).is("deleted_at", null),
        sb.from("hms_handbooks").select("id, title, current_version_id").eq("company_id", cid).is("deleted_at", null),
        sb.from("hms_chemical_acknowledgements")
          .select("chemical_id, person_id, user_id, acknowledged_at, sds_revision_date").eq("company_id", cid),
        sb.from("hms_handbook_recipients")
          .select("person_id, user_id, email, section_ids, section_titles, acknowledged_at, sent_at").eq("company_id", cid),
        sb.from("compliance_competences")
          .select("person_id, type_label, competence_type_id, expires_at, verified_at").eq("company_id", cid).is("deleted_at", null),
        sb.from("compliance_competence_types").select("id, name").eq("company_id", cid),
        sb.from("employment_profiles").select("person_id, archived_at, people(full_name, email, phone, is_active)").eq("company_id", cid),
        sb.from("user_accounts").select("person_id, auth_user_id").eq("company_id", cid),
      ]);

      const versionIds = (bookRes.data ?? []).filter((b: any) => b.current_version_id);
      let sections: SectionLite[] = [];
      if (versionIds.length > 0) {
        const { data: secs } = await sb
          .from("hms_handbook_sections")
          .select("id, heading, ordering, version_id")
          .in("version_id", versionIds.map((v: any) => v.current_version_id))
          .order("ordering");
        const bookByVersion = new Map(versionIds.map((v: any) => [v.current_version_id, v]));
        sections = (secs ?? []).map((s: any) => ({
          id: s.id,
          heading: s.heading,
          handbook_title: (bookByVersion.get(s.version_id) as any)?.title ?? null,
          handbook_id: (bookByVersion.get(s.version_id) as any)?.id ?? null,
          version_id: s.version_id,
        }));
      }

      const typeName = new Map((typeRes.data ?? []).map((t: any) => [t.id, t.name]));
      const userByPerson = new Map((accRes.data ?? []).map((a: any) => [a.person_id, a.auth_user_id]));

      const employees = (empRes.data ?? [])
        .filter((r: any) => !r.archived_at && r.people?.is_active !== false && r.person_id)
        .map((r: any) => ({
          person_id: r.person_id as string,
          user_id: (userByPerson.get(r.person_id) as string) ?? null,
          email: r.people?.email ?? null,
          full_name: r.people?.full_name ?? "Ukjent",
          phone: r.people?.phone ?? null,
        }));

      return {
        chemicals: (chemRes.data ?? []) as ChemicalLite[],
        sections,
        chemAcks: (ackRes.data ?? []) as ReadinessData["chemAcks"],
        handbookAcks: (recRes.data ?? []) as ReadinessData["handbookAcks"],
        competences: (compRes.data ?? []).map((c: any) => ({
          person_id: c.person_id,
          label: c.type_label ?? typeName.get(c.competence_type_id) ?? "",
          expires_at: c.expires_at,
          verified_at: c.verified_at,
        })),
        employees,
      };
    },
  });
}

/**
 * Kravmotor: gir en evaluate()-funksjon som kan brukes på alle planlagte montører.
 * Overstyringer hentes for hele selskapet, og filtreres per oppdrag/montør.
 */
export function useReadinessEvaluator() {
  const { data, isLoading } = useReadinessData();
  const { data: overrides = [] } = useReadinessOverrides();

  const resolve = useCallback(
    (tech: TechIdentity): TechIdentity => {
      const emps = data?.employees ?? [];
      const hit =
        (tech.person_id && emps.find((e) => e.person_id === tech.person_id)) ||
        (tech.user_id && emps.find((e) => e.user_id === tech.user_id)) ||
        (tech.email && emps.find((e) => (e.email ?? "").toLowerCase() === tech.email!.toLowerCase())) ||
        (tech.full_name && emps.find((e) => e.full_name === tech.full_name)) ||
        null;
      return hit ? { ...tech, person_id: hit.person_id, user_id: hit.user_id ?? tech.user_id, email: hit.email ?? tech.email, full_name: hit.full_name, phone: hit.phone } : tech;
    },
    [data]
  );

  const evaluate = useCallback(
    (tags: string[], techInput: TechIdentity, eventId?: string | null): { readiness: ReadinessResult; tech: TechIdentity } => {
      const tech = resolve(techInput);
      const empty: ReadinessResult = evaluateReadiness({
        tags,
        chemicals: data?.chemicals ?? [],
        chemicalAcks: new Map(),
        sections: data?.sections ?? [],
        handbookAcks: [],
        competences: [],
        overrides: [],
      });
      if (!data) return { readiness: empty, tech };

      const matchesTech = (r: { person_id?: string | null; user_id?: string | null; email?: string | null }) =>
        (!!tech.person_id && r.person_id === tech.person_id) ||
        (!!tech.user_id && r.user_id === tech.user_id) ||
        (!!tech.email && !!r.email && r.email.toLowerCase() === tech.email.toLowerCase());

      const chemicalAcks = new Map<string, { acknowledged_at: string | null; sds_revision_date: string | null }>();
      for (const a of data.chemAcks) {
        if (!matchesTech(a)) continue;
        const prev = chemicalAcks.get(a.chemical_id);
        if (!prev || (a.acknowledged_at ?? "") > (prev.acknowledged_at ?? "")) {
          chemicalAcks.set(a.chemical_id, { acknowledged_at: a.acknowledged_at, sds_revision_date: a.sds_revision_date });
        }
      }

      const handbookAcks = data.handbookAcks.filter(matchesTech);

      const competences: CompetenceLite[] = tech.person_id
        ? data.competences.filter((c) => c.person_id === tech.person_id)
        : [];

      const relevantOverrides: OverrideLite[] = overrides
        .filter((o) => (!eventId || o.event_id === eventId) && matchesTech(o))
        .map((o) => ({ requirement_key: o.requirement_key, comment: o.comment, created_at: o.created_at, created_by_name: o.technician_name }));

      const readiness = evaluateReadiness({
        tags,
        chemicals: data.chemicals,
        chemicalAcks,
        sections: data.sections,
        handbookAcks,
        competences,
        overrides: relevantOverrides,
      });
      return { readiness, tech };
    },
    [data, overrides, resolve]
  );

  return { evaluate, resolve, data, isLoading };
}

/* ───────────── Planlagte risikojobber ───────────── */

export interface UpcomingRiskJob {
  id: string;
  title: string;
  description: string | null;
  project_number: string | null;
  start_time: string | null;
  end_time: string | null;
  risk_tags: string[];
  technician_ids: string[];
}

export function useUpcomingRiskJobs(days = 14) {
  const { activeCompanyId: cid } = useCompanyContext();
  return useQuery<UpcomingRiskJob[]>({
    queryKey: ["readiness-upcoming", cid, days],
    enabled: !!cid,
    queryFn: async () => {
      const from = new Date();
      const to = new Date(Date.now() + days * 86400000);
      const { data, error } = await sb
        .from("events")
        .select("id, title, description, project_number, start_time, end_time, risk_tags, technician_id, event_technicians(technician_id)")
        .eq("company_id", cid)
        .is("deleted_at", null)
        .gte("start_time", from.toISOString())
        .lte("start_time", to.toISOString())
        .order("start_time");
      if (error) throw error;
      return (data ?? [])
        .filter((e: any) => (e.risk_tags ?? []).length > 0)
        .map((e: any) => ({
          id: e.id,
          title: e.title,
          description: e.description,
          project_number: e.project_number,
          start_time: e.start_time,
          end_time: e.end_time,
          risk_tags: e.risk_tags ?? [],
          technician_ids: [
            ...new Set([...(e.event_technicians ?? []).map((t: any) => t.technician_id), e.technician_id].filter(Boolean)),
          ] as string[],
        }));
    },
  });
}

/** Mine kommende risikojobber (innlogget montør). */
export function useMyRiskJobs(days = 21) {
  const { user } = useAuth();
  const { data: jobs = [], isLoading } = useUpcomingRiskJobs(days);
  const mine = useMemo(
    () => (user ? jobs.filter((j) => j.technician_ids.includes(user.id)) : []),
    [jobs, user]
  );
  return { jobs: mine, isLoading };
}
