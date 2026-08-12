/**
 * Tilsyn & revisjoner – felles etiketter og statuslogikk.
 * Gjenbruker tone-systemet fra compliance-modulen.
 */
import type { ComplianceTone } from "@/lib/compliance";

export type InspectionType =
  | "dle"
  | "dsb"
  | "arbeidstilsynet"
  | "customer"
  | "main_contractor"
  | "internal_audit"
  | "other";

export type InspectionStatus =
  | "planned"
  | "ongoing"
  | "awaiting_report"
  | "actions_in_progress"
  | "ready_for_response"
  | "submitted"
  | "closed";

export type FindingType = "deviation" | "remark" | "observation";

export type FindingStatus =
  | "new"
  | "under_review"
  | "actions_in_progress"
  | "documentation_ready"
  | "submitted"
  | "approved"
  | "disputed";

export type DocumentationStatus = "none" | "incomplete" | "complete" | "gaps";

export type EvidenceSourceKind =
  | "competence_requirement"
  | "competence"
  | "regulation"
  | "org_role"
  | "internal_audit"
  | "hms_incident"
  | "action_item"
  | "document"
  | "other";

export const INSPECTION_TYPES: { value: InspectionType; label: string }[] = [
  { value: "dle", label: "DLE" },
  { value: "dsb", label: "DSB" },
  { value: "arbeidstilsynet", label: "Arbeidstilsynet" },
  { value: "customer", label: "Kunde" },
  { value: "main_contractor", label: "Hovedentreprenør" },
  { value: "internal_audit", label: "Intern revisjon" },
  { value: "other", label: "Annet" },
];

export const INSPECTION_STATUSES: { value: InspectionStatus; label: string; tone: ComplianceTone }[] = [
  { value: "planned", label: "Planlagt", tone: "neutral" },
  { value: "ongoing", label: "Pågår", tone: "warn" },
  { value: "awaiting_report", label: "Avventer rapport", tone: "warn" },
  { value: "actions_in_progress", label: "Tiltak pågår", tone: "warn" },
  { value: "ready_for_response", label: "Klar for svar", tone: "ok" },
  { value: "submitted", label: "Oversendt", tone: "ok" },
  { value: "closed", label: "Lukket", tone: "neutral" },
];

export const FINDING_TYPES: { value: FindingType; label: string; tone: ComplianceTone }[] = [
  { value: "deviation", label: "Avvik", tone: "alert" },
  { value: "remark", label: "Merknad", tone: "warn" },
  { value: "observation", label: "Observasjon", tone: "neutral" },
];

/**
 * Statusmodellen er den samme som før – kun etikettene er justert til den
 * operative flyten (ingen konkurrerende statusfelter er innført).
 */
export const FINDING_STATUSES: { value: FindingStatus; label: string; tone: ComplianceTone }[] = [
  { value: "new", label: "Ny", tone: "neutral" },
  { value: "under_review", label: "Under vurdering", tone: "warn" },
  { value: "actions_in_progress", label: "Tiltak pågår", tone: "warn" },
  { value: "documentation_ready", label: "Klar for oversendelse", tone: "ok" },
  { value: "submitted", label: "Oversendt", tone: "ok" },
  { value: "disputed", label: "Avventer myndighet", tone: "warn" },
  { value: "approved", label: "Lukket", tone: "ok" },
];


export const DOCUMENTATION_STATUSES: Record<DocumentationStatus, { label: string; tone: ComplianceTone }> = {
  none: { label: "Ingen dokumentasjon valgt", tone: "neutral" },
  incomplete: { label: "Dokumentasjon ufullstendig", tone: "warn" },
  complete: { label: "Dokumentasjon komplett", tone: "ok" },
  gaps: { label: "Dokumentasjon har mangler", tone: "alert" },
};

export const CORRESPONDENCE_DIRECTIONS: { value: string; label: string }[] = [
  { value: "in", label: "Inn" },
  { value: "out", label: "Ut" },
  { value: "meeting", label: "Møte" },
  { value: "phone", label: "Telefon" },
  { value: "note", label: "Notat" },
];

export const EVIDENCE_SOURCE_KINDS: { value: EvidenceSourceKind; label: string; hint: string }[] = [
  { value: "competence_requirement", label: "Kompetanse (kravmotor)", hint: "Kontrollerer alle ansatte kravet gjelder for" },
  { value: "competence", label: "Enkelt kompetansebevis", hint: "Ett konkret bevis for én ansatt" },
  { value: "regulation", label: "Regelverk", hint: "Referanse til regelverksregisteret" },
  { value: "org_role", label: "Organisasjon & ansvar", hint: "Rolle- og ansvarsbeskrivelse" },
  { value: "internal_audit", label: "Internkontroll", hint: "Gjennomført internrevisjon" },
  { value: "hms_incident", label: "HMS-avvik", hint: "Registrert avvik i HMS" },
  { value: "action_item", label: "Tiltak", hint: "Gjennomført tiltak som bevis" },
  { value: "document", label: "Dokument", hint: "Eksisterende dokument i systemet" },
  { value: "other", label: "Annet / fritekst", hint: "Beskriv bevis som ikke ligger i systemet" },
];

export function inspectionTypeLabel(v: string): string {
  return INSPECTION_TYPES.find((t) => t.value === v)?.label ?? v;
}
export function inspectionStatusMeta(v: string) {
  return INSPECTION_STATUSES.find((s) => s.value === v) ?? { value: v, label: v, tone: "neutral" as ComplianceTone };
}
export function findingTypeMeta(v: string) {
  return FINDING_TYPES.find((s) => s.value === v) ?? { value: v, label: v, tone: "neutral" as ComplianceTone };
}
export function findingStatusMeta(v: string) {
  return FINDING_STATUSES.find((s) => s.value === v) ?? { value: v, label: v, tone: "neutral" as ComplianceTone };
}
export function evidenceKindLabel(v: string): string {
  return EVIDENCE_SOURCE_KINDS.find((s) => s.value === v)?.label ?? v;
}
export function correspondenceLabel(v: string): string {
  return CORRESPONDENCE_DIRECTIONS.find((s) => s.value === v)?.label ?? v;
}

const DOC_SEVERITY: Record<DocumentationStatus, number> = { complete: 0, none: 1, incomplete: 2, gaps: 3 };

/** Samlet dokumentasjonsstatus for et tilsyn beregnes fra funnene */
export function aggregateDocumentationStatus(list: DocumentationStatus[]): DocumentationStatus {
  if (!list.length) return "none";
  return list.reduce((a, b) => (DOC_SEVERITY[b] > DOC_SEVERITY[a] ? b : a));
}

/** Frist-tone: rød ved passert, gul innen 14 dager */
export function deadlineTone(days: number | null): ComplianceTone {
  if (days === null) return "neutral";
  if (days < 0) return "alert";
  if (days <= 14) return "warn";
  return "ok";
}

export function deadlineLabel(days: number | null): string {
  if (days === null) return "Ingen frist";
  if (days < 0) return `${Math.abs(days)} d over frist`;
  if (days === 0) return "Frist i dag";
  return `${days} d til frist`;
}

export const OPEN_ACTION_STATUSES = ["open", "in_progress"];
