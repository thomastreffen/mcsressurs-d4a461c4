/**
 * Systemstøttet internrevisjon – datakilder og fullføring.
 * Gjenbruker eksisterende registre (kravmotor, organisasjon, regelverk,
 * HMS-avvik/tiltak, documents). Ingen parallelle tabeller.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  useComplianceAudits, useComplianceEmployees, useCompetenceTypes, useOpenHmsCounts,
  useOrgRoles, useRegulations,
} from "@/hooks/useCompliance";
import { useRequirementStatus } from "@/hooks/useComplianceRequirements";
import { auditSystemReview, buildAuditReport, type AuditCheckpoint, type AuditReportInput, type AuditSystemFact } from "@/lib/internal-control";

const sb = supabase as any;

function useCid() {
  const { activeCompanyId } = useCompanyContext();
  return activeCompanyId;
}

/** Antall dokumenter koblet til compliance-objekter (kompetanse/tilsyn/internkontroll) */
export function useComplianceDocumentCount() {
  const cid = useCid();
  return useQuery<number>({
    queryKey: ["compliance-document-count", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { count, error } = await sb
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("company_id", cid)
        .is("deleted_at", null)
        .in("entity_type", ["compliance_competence", "compliance_audit", "compliance_inspection"]);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/** Systemfakta for en internrevisjon – alltid beregnet fra faktiske data */
export function useAuditSystemReview(currentAuditId?: string | null) {
  const orgRoles = useOrgRoles();
  const employees = useComplianceEmployees();
  const requirements = useRequirementStatus();
  const competenceTypes = useCompetenceTypes();
  const regulations = useRegulations();
  const audits = useComplianceAudits();
  const openHms = useOpenHmsCounts();
  const docs = useComplianceDocumentCount();

  const facts = useMemo<AuditSystemFact[]>(() => {
    if (!orgRoles.data || !employees.data || !requirements.data || !regulations.data || !audits.data || !openHms.data) return [];
    return auditSystemReview({
      orgRoles: orgRoles.data.map((r) => ({
        id: r.id, title: r.title, role_type: r.role_type, person_id: r.person_id,
        deputy_person_id: r.deputy_person_id, valid_from: r.valid_from, valid_to: r.valid_to,
      })),
      employees: employees.data.map((e) => ({
        person_id: e.person_id, full_name: e.full_name, department_id: e.department_id, relationship_type: e.relationship_type,
      })),
      requirementRows: requirements.data.map((r) => ({
        person_id: r.person_id, competence_type_id: r.competence_type_id, required: r.required, status: r.status,
      })),
      competenceTypes: (competenceTypes.data ?? []).map((c) => ({ id: c.id, key: c.key, name: c.name })),
      regulations: regulations.data.map((r) => ({
        id: r.id, name: r.name, short_name: r.short_name, next_review_at: r.next_review_at, status: r.status,
      })),
      audits: audits.data.map((a) => ({ id: a.id, title: a.title, performed_at: a.performed_at, status: a.status })),
      openHms: openHms.data,
      procedureDocuments: docs.data,
      currentAuditId: currentAuditId ?? null,
    });
  }, [orgRoles.data, employees.data, requirements.data, competenceTypes.data, regulations.data, audits.data, openHms.data, docs.data, currentAuditId]);

  const loading =
    orgRoles.isLoading || employees.isLoading || requirements.isLoading || regulations.isLoading ||
    audits.isLoading || openHms.isLoading;

  return { facts, loading };
}

/** Tiltak knyttet til en internrevisjon (gjenbruk av hms_action_items) */
export function useAuditActionRows(auditId?: string | null) {
  const cid = useCid();
  return useQuery<{ id: string; title: string; status: string; due_date: string | null }[]>({
    queryKey: ["compliance-audit-actions", cid, auditId ?? "none"],
    enabled: !!cid && !!auditId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("hms_action_items")
        .select("id, title, status, due_date")
        .eq("company_id", cid)
        .eq("compliance_audit_id", auditId)
        .is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Fullfører en internrevisjon: genererer referat fra faktiske data, lagrer det
 * som dokument og setter status «Gjennomført». Kalles kun ved eksplisitt
 * brukerhandling – AI kan aldri fullføre en revisjon.
 */
export function useCompleteAudit() {
  const cid = useCid();
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      auditId: string;
      report: AuditReportInput;
      checkpoints: AuditCheckpoint[];
      facts: AuditSystemFact[];
    }) => {
      const markdown = buildAuditReport(input.report);
      const performed = input.report.performed_at ?? new Date().toISOString().slice(0, 10);

      const fileName = `Revisjonsreferat_${performed}.md`;
      const path = `compliance/${cid}/audits/${input.auditId}/${Date.now()}_${fileName}`;
      const blob = new Blob([markdown], { type: "text/markdown" });
      const { error: upErr } = await supabase.storage.from("job-attachments").upload(path, blob, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("job-attachments").getPublicUrl(path);

      const { data: doc, error: docErr } = await sb
        .from("documents")
        .insert({
          entity_type: "compliance_audit",
          entity_id: input.auditId,
          company_id: cid,
          category: "internkontroll",
          source_type: "system",
          storage_bucket: "job-attachments",
          file_path: path,
          file_name: fileName,
          file_size: blob.size,
          mime_type: "text/markdown",
          public_url: pub?.publicUrl ?? null,
          uploaded_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (docErr) throw docErr;

      const { error } = await sb
        .from("compliance_audits")
        .update({
          status: "completed",
          performed_at: performed,
          checkpoints: input.checkpoints,
          system_snapshot: { generated_at: new Date().toISOString(), facts: input.facts },
          report_markdown: markdown,
          report_document_id: doc.id,
          completed_at: new Date().toISOString(),
          completed_by: user?.id ?? null,
        })
        .eq("id", input.auditId);
      if (error) throw error;
      return { documentId: doc.id as string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance-audits"] });
      qc.invalidateQueries({ queryKey: ["compliance-overview"] });
      qc.invalidateQueries({ queryKey: ["finding-audits"] });
      toast.success("Internrevisjon fullført og referat lagret");
    },
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke fullføre internrevisjonen"),
  });
}

export interface FindingAudit {
  id: string;
  title: string;
  status: string;
  performed_at: string | null;
  completed_at: string | null;
  report_document_id: string | null;
  openActions: number;
}

/** Internrevisjoner som er startet fra et tilsynsfunn */
export function useFindingAudits(findingId?: string) {
  const cid = useCid();
  return useQuery<FindingAudit[]>({
    queryKey: ["finding-audits", cid, findingId ?? "none"],
    enabled: !!cid && !!findingId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("compliance_audits")
        .select("id, title, status, performed_at, completed_at, report_document_id")
        .eq("company_id", cid)
        .eq("source_finding_id", findingId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      if (!rows.length) return [];
      const { data: actions } = await sb
        .from("hms_action_items")
        .select("id, status, compliance_audit_id")
        .eq("company_id", cid)
        .in("compliance_audit_id", rows.map((r: any) => r.id))
        .is("deleted_at", null);
      return rows.map((r: any) => ({
        ...r,
        openActions: (actions ?? []).filter(
          (a: any) => a.compliance_audit_id === r.id && ["open", "in_progress"].includes(a.status),
        ).length,
      }));
    },
  });
}
