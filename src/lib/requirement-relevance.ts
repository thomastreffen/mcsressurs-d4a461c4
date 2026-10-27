import type { RequirementStatus } from "@/lib/compliance";

export interface RelevanceMetadata {
  assessment_id?: string | null;
  assessment_reason?: string | null;
  assessor_name?: string | null;
  assessed_by?: string | null;
  assessed_at?: string | null;
  assessment_valid_until?: string | null;
}

export function isRequirementGap(status: string) {
  return ["missing", "missing_document", "expired"].includes(status);
}
export function needsCompetenceNotification(status: string) {
  return isRequirementGap(status) || status === "expiring_soon";
}
export function summarizeRequirements(rows: { status: string }[]) {
  const applicable = rows.filter(r => r.status !== "not_relevant" && r.status !== "not_required");
  return { total: applicable.length, ok: applicable.filter(r => r.status === "fulfilled").length,
    gaps: applicable.filter(r => isRequirementGap(r.status)).length,
    warn: applicable.filter(r => r.status === "expiring_soon").length,
    notRelevant: rows.filter(r => r.status === "not_relevant").length };
}
export function relevanceDocumentation(row: RelevanceMetadata & { status: string }) {
  if (row.status !== "not_relevant") return "";
  return [`Ikke relevant – individuell vurdering, ikke dokumentasjon på opplæring`,
    `Begrunnelse: ${row.assessment_reason ?? "Ikke tilgjengelig"}`,
    `Vurdert av: ${row.assessor_name ?? row.assessed_by ?? "Ikke tilgjengelig"}`,
    `Tidspunkt: ${row.assessed_at ?? "Ikke tilgjengelig"}`,
    `Gyldig til / revurdering: ${row.assessment_valid_until ?? "Ingen fast dato"}`].join("\n");
}
export function competenceOverviewRows(people: ({ name: string; status: string; expires_at: string | null; has_document: boolean } & RelevanceMetadata)[], label: (status: string) => string) {
  return [["Ansatt", "Status", "Gyldig til (kompetanse)", "Dokumentasjon", "Begrunnelse for vurdering", "Vurdert av", "Vurdert tidspunkt", "Revurdering"],
    ...people.map(p => [p.name, label(p.status), p.status === "not_relevant" ? "" : p.expires_at ?? "",
      p.status === "not_relevant" ? "Individuell vurdering – ikke kursbevis" : p.has_document ? "Ja" : "Nei",
      p.assessment_reason ?? "", p.assessor_name ?? p.assessed_by ?? "", p.assessed_at ?? "", p.assessment_valid_until ?? ""])];
}

/** Mirrors the server lifecycle for isolated tests; the server remains authoritative. */
export function assessmentStatus(base: RequirementStatus, assessment: { reason: string; valid_until: string | null; revoked: boolean; contextMatches: boolean } | null, today: string): RequirementStatus {
  return base !== "not_required" && assessment && assessment.reason.trim() && !assessment.revoked && assessment.contextMatches && (!assessment.valid_until || assessment.valid_until >= today) ? "not_relevant" : base;
}