import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useCompetenceTypes, useCompetences, useComplianceEmployees, useRegulations, useOrgRoles, useComplianceAudits } from "@/hooks/useCompliance";
import { useRequirementStatus } from "@/hooks/useComplianceRequirements";
import { useLogInspectionEvent, type Finding, type FindingEvidence, type InspectionAction } from "@/hooks/useInspections";
import type { ComplianceTone } from "@/lib/compliance";
import { sourceLabelFor, type AttachmentCandidate, type ManifestEntry, type PackageFindingDraft } from "@/lib/response-package";

const sb = supabase as any;

function useCid() {
  const { activeCompanyId } = useCompanyContext();
  return activeCompanyId;
}

/* ---------------- Lagrede utsendelser ---------------- */

export interface ResponsePackage {
  id: string;
  inspection_id: string;
  package_number: number;
  status: string;
  subject: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  cc_emails: string[];
  intro_text: string | null;
  closing_text: string | null;
  manifest: ManifestEntry[];
  email_body_snapshot: string | null;
  exported_at: string | null;
  sent_at: string | null;
  sent_by: string | null;
  send_error: string | null;
  created_at: string;
  created_by: string | null;
}

export interface ResponsePackageFinding {
  id: string;
  package_id: string;
  finding_id: string | null;
  finding_number: number | null;
  finding_type: string | null;
  finding_title: string | null;
  original_text_snapshot: string | null;
  response_text_snapshot: string | null;
  actions_snapshot: { title: string; status: string }[];
  sort_order: number;
}

export interface ResponsePackageAttachment {
  id: string;
  package_id: string;
  finding_id: string | null;
  document_id: string | null;
  export_name: string;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  storage_bucket: string | null;
  file_path: string | null;
  source_kind: string | null;
  source_label: string | null;
  document_created_at: string | null;
  sort_order: number;
}

export function useResponsePackages(inspectionId?: string) {
  const cid = useCid();
  return useQuery<{ packages: ResponsePackage[]; findings: ResponsePackageFinding[]; attachments: ResponsePackageAttachment[] }>({
    queryKey: ["response-packages", cid, inspectionId],
    enabled: !!cid && !!inspectionId,
    queryFn: async () => {
      const { data: packages, error } = await sb
        .from("compliance_response_packages")
        .select("*")
        .eq("inspection_id", inspectionId)
        .order("package_number", { ascending: false });
      if (error) throw error;
      const ids = (packages ?? []).map((p: any) => p.id);
      if (!ids.length) return { packages: [], findings: [], attachments: [] };
      const [f, a] = await Promise.all([
        sb.from("compliance_response_package_findings").select("*").in("package_id", ids).order("sort_order"),
        sb.from("compliance_response_package_attachments").select("*").in("package_id", ids).order("sort_order"),
      ]);
      if (f.error) throw f.error;
      if (a.error) throw a.error;
      return { packages: packages ?? [], findings: f.data ?? [], attachments: a.data ?? [] };
    },
  });
}

/* ---------------- Vedleggskandidater ---------------- */

/** Dokumentrader for et sett av id-er (brukes for både bevis og kompetansebevis) */
function useDocumentsByIds(ids: string[]) {
  const cid = useCid();
  const key = [...new Set(ids)].sort().join(",");
  return useQuery<Record<string, any>>({
    queryKey: ["response-package-documents", cid, key],
    enabled: !!cid && !!key,
    queryFn: async () => {
      const { data, error } = await sb
        .from("documents")
        .select("id, file_name, file_path, mime_type, file_size, storage_bucket, category, created_at, entity_type")
        .in("id", key.split(","))
        .is("deleted_at", null);
      if (error) throw error;
      const map: Record<string, any> = {};
      for (const d of data ?? []) map[d.id] = d;
      return map;
    },
  });
}

export interface CompetenceCoverageDetail {
  competence_type_id: string;
  competence_type_name: string;
  total: number;
  ok: number;
  warn: number;
  gaps: number;
  people: {
    person_id: string;
    name: string;
    status: string;
    expires_at: string | null;
    has_document: boolean;
    document_id: string | null;
  }[];
}

/**
 * Kravmotoren avgjør hvem kravet gjelder for, hvem som er komplett og hvilke
 * dokumenter som finnes. Ansatte uten krav tas ikke med.
 */
export function useCompetenceCoverageDetails() {
  const statuses = useRequirementStatus();
  const employees = useComplianceEmployees();
  const competences = useCompetences();
  const types = useCompetenceTypes();

  const detailFor = (competenceTypeId: string | null): CompetenceCoverageDetail | null => {
    if (!competenceTypeId) return null;
    const nameByPerson = new Map((employees.data ?? []).map((e) => [e.person_id, e.full_name]));
    const compById = new Map((competences.data ?? []).map((c) => [c.id, c]));
    const rows = (statuses.data ?? []).filter((r) => r.competence_type_id === competenceTypeId && r.required);
    const people = rows.map((r) => ({
      person_id: r.person_id,
      name: nameByPerson.get(r.person_id) ?? "Ukjent ansatt",
      status: r.status,
      expires_at: r.expires_at,
      has_document: r.has_document,
      document_id: (compById.get(r.competence_id ?? "") as any)?.document_id ?? null,
    }));
    return {
      competence_type_id: competenceTypeId,
      competence_type_name: types.data?.find((t) => t.id === competenceTypeId)?.name ?? "Kompetanse",
      total: rows.length,
      ok: rows.filter((r) => r.status === "fulfilled").length,
      warn: rows.filter((r) => r.status === "expiring_soon").length,
      gaps: rows.filter((r) => ["missing", "missing_document", "expired"].includes(r.status)).length,
      people: people.sort((a, b) => a.name.localeCompare(b.name, "nb")),
    };
  };

  return {
    loading: statuses.isLoading || employees.isLoading || competences.isLoading,
    detailFor,
  };
}

const COMPETENCE_STATUS_TEXT: Record<string, { label: string; tone: ComplianceTone }> = {
  fulfilled: { label: "Gyldig", tone: "ok" },
  expiring_soon: { label: "Utløper snart", tone: "warn" },
  expired: { label: "Utløpt", tone: "alert" },
  missing: { label: "Mangler kompetanse", tone: "alert" },
  missing_document: { label: "Mangler dokumentasjon", tone: "alert" },
  not_required: { label: "Ikke påkrevd", tone: "neutral" },
};

/**
 * Bygger valgbare vedlegg per funn ut fra eksisterende bevis/referanser.
 * Ingenting kopieres – alt peker på documents eller på en referanse i systemet.
 */
export function useAttachmentCandidates(findings: Finding[], evidence: FindingEvidence[], actions: InspectionAction[]) {
  const { detailFor, loading: coverageLoading } = useCompetenceCoverageDetails();
  const competences = useCompetences();
  const types = useCompetenceTypes();
  const employees = useComplianceEmployees();
  const regulations = useRegulations();
  const orgRoles = useOrgRoles();
  const audits = useComplianceAudits();

  // Alle dokument-id-er vi kan trenge: direkte bevis + kompetansebevis
  const docIds = useMemo(() => {
    const ids: string[] = [];
    for (const e of evidence) if (e.document_id) ids.push(e.document_id);
    for (const c of competences.data ?? []) if (c.document_id) ids.push(c.document_id);
    return ids;
  }, [evidence, competences.data]);
  const documents = useDocumentsByIds(docIds);

  const candidates = useMemo<AttachmentCandidate[]>(() => {
    const docs = documents.data ?? {};
    const nameByPerson = new Map((employees.data ?? []).map((e) => [e.person_id, e.full_name]));
    const out: AttachmentCandidate[] = [];

    const pushDocument = (opts: {
      key: string; finding_id: string | null; evidence_id: string | null; documentId: string;
      title: string; source_kind: string; source_label: string; status?: { label: string; tone: ComplianceTone };
    }) => {
      const d = docs[opts.documentId];
      if (!d) return;
      out.push({
        key: opts.key,
        finding_id: opts.finding_id,
        kind: "document",
        evidence_id: opts.evidence_id,
        document_id: opts.documentId,
        file_name: d.file_name,
        mime_type: d.mime_type,
        file_size: d.file_size,
        storage_bucket: d.storage_bucket,
        file_path: d.file_path,
        source_kind: opts.source_kind,
        source_label: opts.source_label,
        date: d.created_at,
        status_label: opts.status?.label ?? "Tilgjengelig",
        status_tone: opts.status?.tone ?? "ok",
        title: opts.title,
      });
    };

    for (const f of findings) {
      const list = evidence.filter((e) => e.finding_id === f.id);
      for (const e of list) {
        const srcLabel = sourceLabelFor(e.source_kind);

        if (e.source_kind === "document" && e.document_id) {
          pushDocument({
            key: `ev:${e.id}`, finding_id: f.id, evidence_id: e.id, documentId: e.document_id,
            title: e.label ?? docs[e.document_id]?.file_name ?? "Dokument",
            source_kind: e.source_kind, source_label: srcLabel,
          });
          continue;
        }

        if (e.source_kind === "competence" && e.ref_id) {
          const c = (competences.data ?? []).find((x) => x.id === e.ref_id);
          const typeName = types.data?.find((t) => t.id === c?.competence_type_id)?.name ?? "Kompetanse";
          const person = nameByPerson.get(c?.person_id ?? "") ?? "Ansatt";
          if (c?.document_id) {
            pushDocument({
              key: `comp:${c.id}`, finding_id: f.id, evidence_id: e.id, documentId: c.document_id,
              title: `${typeName} – ${person}`, source_kind: e.source_kind, source_label: srcLabel,
              status: c.expires_at && new Date(c.expires_at) < new Date()
                ? { label: "Utløpt", tone: "alert" }
                : { label: "Gyldig", tone: "ok" },
            });
          } else {
            out.push({
              key: `compref:${e.id}`, finding_id: f.id, kind: "reference", evidence_id: e.id, document_id: null,
              file_name: "", mime_type: null, file_size: null, storage_bucket: null, file_path: null,
              source_kind: e.source_kind, source_label: srcLabel, date: c?.issued_at ?? null,
              status_label: "Mangler dokumentasjon", status_tone: "alert",
              title: `${typeName} – ${person}`, reference_note: "Bevis er registrert uten dokument",
            });
          }
          continue;
        }

        if (e.source_kind === "competence_requirement" && e.competence_type_id) {
          const detail = detailFor(e.competence_type_id);
          if (!detail) continue;
          // Systemgenerert oversikt over hvem kravet gjelder for
          out.push({
            key: `cov:${e.id}`,
            finding_id: f.id,
            kind: "generated",
            evidence_id: e.id,
            document_id: null,
            file_name: `${detail.competence_type_name} kompetanseoversikt`,
            mime_type: "text/csv",
            file_size: null,
            storage_bucket: null,
            file_path: null,
            source_kind: e.source_kind,
            source_label: srcLabel,
            date: new Date().toISOString(),
            status_label: detail.gaps > 0 ? `${detail.gaps} mangler` : detail.warn > 0 ? `${detail.warn} utløper snart` : `${detail.ok} av ${detail.total} komplett`,
            status_tone: detail.gaps > 0 ? "alert" : detail.warn > 0 ? "warn" : "ok",
            title: `${detail.competence_type_name} kompetanseoversikt`,
            generated: {
              type: "competence_overview",
              competence_type_id: e.competence_type_id,
              rows: [
                ["Ansatt", "Status", "Gyldig til", "Dokumentasjon"],
                ...detail.people.map((p) => [
                  p.name,
                  COMPETENCE_STATUS_TEXT[p.status]?.label ?? p.status,
                  p.expires_at ?? "",
                  p.has_document ? "Ja" : "Nei",
                ]),
              ],
            },
          });
          // Ett bevis per ansatt kravet gjelder for
          for (const p of detail.people) {
            if (p.document_id) {
              pushDocument({
                key: `covdoc:${e.id}:${p.person_id}`, finding_id: f.id, evidence_id: e.id, documentId: p.document_id,
                title: `${detail.competence_type_name} – ${p.name}`, source_kind: "competence", source_label: "Ansatt → Kompetanse",
                status: COMPETENCE_STATUS_TEXT[p.status],
              });
            }
          }
          continue;
        }

        // Referanser uten fil (regelverk, roller, internkontroll, tiltak, annet)
        const refTitle =
          e.label ??
          (e.source_kind === "regulation" ? regulations.data?.find((r) => r.id === e.ref_id)?.name
            : e.source_kind === "org_role" ? orgRoles.data?.find((r) => r.id === e.ref_id)?.title
            : e.source_kind === "internal_audit" ? audits.data?.find((a) => a.id === e.ref_id)?.title
            : e.source_kind === "action_item" ? actions.find((a) => a.id === e.ref_id)?.title
            : null) ??
          sourceLabelFor(e.source_kind);
        out.push({
          key: `ref:${e.id}`, finding_id: f.id, kind: "reference", evidence_id: e.id, document_id: null,
          file_name: "", mime_type: null, file_size: null, storage_bucket: null, file_path: null,
          source_kind: e.source_kind, source_label: srcLabel, date: e.created_at,
          status_label: "Referanse", status_tone: "neutral",
          title: refTitle, reference_note: e.note,
        });
      }
    }
    return out;
  }, [findings, evidence, documents.data, competences.data, types.data, employees.data, regulations.data, orgRoles.data, audits.data, actions, detailFor]);

  return { candidates, loading: coverageLoading || documents.isLoading };
}

/* ---------------- Pre-flight kontroll ---------------- */

export interface PreflightCheck {
  label: string;
  tone: ComplianceTone;
  /** Ansatte som må følges opp – gir direktelenke til ansattkortet */
  people?: { person_id: string; name: string }[];
}

export interface FindingPreflight {
  finding_id: string;
  finding_number: number;
  title: string;
  checks: PreflightCheck[];
  overall: "ready" | "review" | "missing";
}

export function buildPreflight(input: {
  findings: Finding[];
  evidence: FindingEvidence[];
  actions: InspectionAction[];
  candidates: AttachmentCandidate[];
  selectedAttachmentKeys: Set<string>;
  detailFor: (id: string | null) => CompetenceCoverageDetail | null;
}): FindingPreflight[] {
  return input.findings.map((f) => {
    const checks: PreflightCheck[] = [];

    if (f.response_text?.trim()) checks.push({ label: "Svartekst klar", tone: "ok" });
    else checks.push({ label: "Mangler svartekst til tilsynsmyndigheten", tone: "alert" });

    const fActions = input.actions.filter((a) => a.compliance_finding_id === f.id);
    const openActions = fActions.filter((a) => ["open", "in_progress"].includes(a.status));
    if (!fActions.length) checks.push({ label: "Ingen tiltak registrert på funnet", tone: "warn" });
    else if (openActions.length) checks.push({ label: `${openActions.length} av ${fActions.length} tiltak er ikke gjennomført`, tone: "alert" });
    else checks.push({ label: `${fActions.length} tiltak gjennomført`, tone: "ok" });

    const fCandidates = input.candidates.filter((c) => c.finding_id === f.id);
    const chosen = fCandidates.filter((c) => input.selectedAttachmentKeys.has(c.key));
    const chosenFiles = chosen.filter((c) => c.kind !== "reference");
    if (!fCandidates.length) checks.push({ label: "Ingen dokumentasjon koblet til funnet", tone: "alert" });
    else if (!chosen.length) checks.push({ label: "Ingen dokumentasjon valgt for utsendelsen", tone: "alert" });
    else checks.push({ label: `${chosenFiles.length} vedlegg valgt${chosen.length > chosenFiles.length ? ` + ${chosen.length - chosenFiles.length} referanser` : ""}`, tone: "ok" });

    // Kompetansekrav: kravmotoren avgjør hvem kravet gjelder for
    for (const e of input.evidence.filter((x) => x.finding_id === f.id && x.source_kind === "competence_requirement")) {
      const d = input.detailFor(e.competence_type_id);
      if (!d) continue;
      if (d.total === 0) {
        checks.push({ label: `Ingen ansatte har ${d.competence_type_name} som krav – kontroller kompetansekravene`, tone: "warn" });
        continue;
      }
      checks.push({ label: `${d.total} ansatte omfattes av ${d.competence_type_name}-kravet`, tone: "ok" });
      const withDoc = d.people.filter((p) => p.has_document).length;
      if (d.gaps > 0) {
        checks.push({
          label: `${d.gaps} ansatte mangler gyldig ${d.competence_type_name}`,
          tone: "alert",
          people: d.people.filter((p) => ["missing", "missing_document", "expired"].includes(p.status)).map((p) => ({ person_id: p.person_id, name: p.name })),
        });
      } else {
        checks.push({ label: `${d.ok} av ${d.total} har gyldig ${d.competence_type_name}`, tone: d.warn > 0 ? "warn" : "ok" });
      }
      if (d.warn > 0) {
        checks.push({
          label: `${d.warn} ansatte utløper snart`,
          tone: "warn",
          people: d.people.filter((p) => p.status === "expiring_soon").map((p) => ({ person_id: p.person_id, name: p.name })),
        });
      }
      checks.push({
        label: `${withDoc}/${d.total} har dokumentasjon`,
        tone: withDoc === d.total ? "ok" : "alert",
        people: withDoc === d.total ? undefined : d.people.filter((p) => !p.has_document).map((p) => ({ person_id: p.person_id, name: p.name })),
      });
    }

    const overall: FindingPreflight["overall"] = checks.some((c) => c.tone === "alert")
      ? "missing"
      : checks.some((c) => c.tone === "warn")
        ? "review"
        : "ready";

    return { finding_id: f.id, finding_number: f.finding_number, title: f.title, checks, overall };
  });
}

/* ---------------- Opprett/lagre utsendelse ---------------- */

export interface FinalizePackageInput {
  inspection_id: string;
  mode: "export" | "send";
  subject: string;
  recipient_name: string;
  recipient_email: string;
  cc: string[];
  intro: string;
  closing: string;
  findings: PackageFindingDraft[];
  attachments: (AttachmentCandidate & { export_name: string | null })[];
  manifest: ManifestEntry[];
  email_text: string;
  email_html: string;
}

export function useResponsePackageMutations() {
  const cid = useCid();
  const { user } = useAuth();
  const qc = useQueryClient();
  const log = useLogInspectionEvent();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["response-packages"] });
    qc.invalidateQueries({ queryKey: ["inspection-findings"] });
    qc.invalidateQueries({ queryKey: ["inspection-correspondence"] });
    qc.invalidateQueries({ queryKey: ["inspection-events"] });
    qc.invalidateQueries({ queryKey: ["inspection-summaries"] });
    qc.invalidateQueries({ queryKey: ["inspection"] });
  };

  /** Lagrer utsendelsen med frosne snapshots slik at historikken er etterprøvbar */
  const finalize = useMutation({
    mutationFn: async (input: FinalizePackageInput) => {
      const { data: pkg, error } = await sb
        .from("compliance_response_packages")
        .insert({
          company_id: cid,
          inspection_id: input.inspection_id,
          status: input.mode === "send" ? "sent" : "exported",
          subject: input.subject,
          recipient_name: input.recipient_name || null,
          recipient_email: input.recipient_email || null,
          cc_emails: input.cc,
          intro_text: input.intro,
          closing_text: input.closing,
          manifest: input.manifest,
          email_body_snapshot: input.email_text,
          exported_at: input.mode === "export" ? new Date().toISOString() : null,
          sent_at: input.mode === "send" ? new Date().toISOString() : null,
          sent_by: input.mode === "send" ? user?.id ?? null : null,
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;

      if (input.findings.length) {
        const { error: fErr } = await sb.from("compliance_response_package_findings").insert(
          input.findings.map((f, idx) => ({
            company_id: cid,
            package_id: pkg.id,
            finding_id: f.finding_id,
            finding_number: f.finding_number,
            finding_type: f.finding_type,
            finding_title: f.title,
            original_text_snapshot: f.original_text,
            response_text_snapshot: f.response_text,
            actions_snapshot: f.actions,
            sort_order: idx,
          })),
        );
        if (fErr) throw fErr;
      }

      if (input.attachments.length) {
        const { error: aErr } = await sb.from("compliance_response_package_attachments").insert(
          input.attachments.map((a, idx) => ({
            company_id: cid,
            package_id: pkg.id,
            finding_id: a.finding_id,
            document_id: a.document_id,
            evidence_id: a.evidence_id,
            export_name: a.export_name ?? a.title,
            file_name: a.file_name || null,
            mime_type: a.mime_type,
            file_size: a.file_size,
            storage_bucket: a.storage_bucket,
            file_path: a.file_path,
            source_kind: a.source_kind,
            source_label: a.source_label,
            document_created_at: a.date,
            sort_order: idx,
          })),
        );
        if (aErr) throw aErr;
      }

      if (input.mode === "send") {
        // Funn settes til «Oversendt» – ikke lukket. Lukking skjer først når myndigheten godkjenner.
        const ids = input.findings.map((f) => f.finding_id);
        if (ids.length) {
          await sb.from("compliance_findings").update({ status: "submitted" }).in("id", ids);
        }
        await sb.from("compliance_correspondence").insert({
          company_id: cid,
          inspection_id: input.inspection_id,
          direction: "out",
          occurred_at: new Date().toISOString(),
          contact_name: input.recipient_name || input.recipient_email || null,
          subject: input.subject,
          notes: `Svarpakke ${pkg.package_number} sendt til ${input.recipient_email}. ${input.findings.length} avvik, ${input.attachments.filter((a) => a.export_name).length} vedlegg.`,
          created_by: user?.id ?? null,
        });
        await sb
          .from("compliance_inspections")
          .update({ status: "submitted", submitted_at: new Date().toISOString() })
          .eq("id", input.inspection_id);
        await log({
          inspection_id: input.inspection_id,
          event_type: "response_sent",
          summary: `Svarpakke ${pkg.package_number} sendt til ${input.recipient_email} (${input.findings.map((f) => `avvik ${f.finding_number}`).join(", ")})`,
          payload: { package_id: pkg.id, package_number: pkg.package_number, recipient: input.recipient_email, findings: input.findings.map((f) => f.finding_number) },
        });
      } else {
        await log({
          inspection_id: input.inspection_id,
          event_type: "response_exported",
          summary: `Svarpakke ${pkg.package_number} eksportert (${input.findings.length} avvik, ${input.attachments.filter((a) => a.export_name).length} vedlegg)`,
          payload: { package_id: pkg.id, package_number: pkg.package_number },
        });
      }

      return pkg as ResponsePackage;
    },
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke lagre utsendelsen"),
  });

  const markSendFailed = useMutation({
    mutationFn: async ({ id, error }: { id: string; error: string }) => {
      await sb.from("compliance_response_packages").update({ status: "draft", send_error: error, sent_at: null }).eq("id", id);
    },
    onSuccess: () => invalidate(),
  });

  return { finalize, markSendFailed };
}
