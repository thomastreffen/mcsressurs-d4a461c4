/**
 * Elsikkerhet & Compliance – felles statuslogikk og etiketter.
 * Statuser beregnes alltid fra faktiske datoer/dokumenter, aldri manuelt satt.
 */

export const COMPLIANCE_THRESHOLDS = [90, 60, 30] as const;

export type ComplianceStatus = "valid" | "expiring_soon" | "expired" | "missing_document";
export type ComplianceTone = "ok" | "warn" | "alert" | "neutral";

export const COMPETENCE_STATUS_META: Record<ComplianceStatus, { label: string; tone: ComplianceTone }> = {
  valid: { label: "Gyldig", tone: "ok" },
  expiring_soon: { label: "Utløper snart", tone: "warn" },
  expired: { label: "Utløpt", tone: "alert" },
  missing_document: { label: "Mangler dokumentasjon", tone: "alert" },
};

export const TONE_CLASS: Record<ComplianceTone, string> = {
  ok: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  warn: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  alert: "bg-destructive/10 text-destructive border-destructive/20",
  neutral: "bg-muted text-muted-foreground border-border",
};

export const TONE_DOT: Record<ComplianceTone, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  alert: "bg-destructive",
  neutral: "bg-muted-foreground/40",
};

export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function competenceStatus(opts: {
  expires_at?: string | null;
  has_document?: boolean;
  requires_document?: boolean;
}): ComplianceStatus {
  const requires = opts.requires_document ?? true;
  if (requires && !opts.has_document) return "missing_document";
  const d = daysUntil(opts.expires_at);
  if (d === null) return "valid";
  if (d < 0) return "expired";
  if (d <= 90) return "expiring_soon";
  return "valid";
}

/** Verste status vinner når en ansatt/rad aggregeres */
const SEVERITY: Record<ComplianceStatus | "missing", number> = {
  valid: 0,
  expiring_soon: 1,
  missing_document: 2,
  expired: 3,
  missing: 2,
};

export function worstStatus(list: ComplianceStatus[]): ComplianceStatus | null {
  if (!list.length) return null;
  return list.reduce((a, b) => (SEVERITY[b] > SEVERITY[a] ? b : a));
}

export const COMPETENCE_CATEGORIES: { value: string; label: string }[] = [
  { value: "fagbrev", label: "Fagbrev" },
  { value: "fse", label: "FSE" },
  { value: "forstehjelp", label: "Førstehjelp" },
  { value: "kurs", label: "Kurs / sertifikat" },
  { value: "kort", label: "Kort / bevis" },
  { value: "annet", label: "Annet" },
];

export const REGULATION_TYPES: { value: string; label: string }[] = [
  { value: "lov", label: "Lov" },
  { value: "forskrift", label: "Forskrift" },
  { value: "norm", label: "Norm" },
  { value: "standard", label: "Standard" },
  { value: "internt", label: "Internt kravreferanse" },
];

export const REGULATION_STATUSES: { value: string; label: string; tone: ComplianceTone }[] = [
  { value: "active", label: "Aktiv", tone: "ok" },
  { value: "under_review", label: "Under gjennomgang", tone: "warn" },
  { value: "action_needed", label: "Krever tiltak", tone: "alert" },
  { value: "archived", label: "Arkivert", tone: "neutral" },
];

export const ORG_ROLE_TYPES: { value: string; label: string }[] = [
  { value: "leadership", label: "Ledelse" },
  { value: "hms", label: "HMS-ansvar" },
  { value: "ks", label: "KS-ansvar" },
  { value: "elektrofaglig", label: "Elektrofaglig ansvar" },
  { value: "verneombud", label: "Verneombud" },
  { value: "other", label: "Annet" },
];

export const AUDIT_STATUSES: { value: string; label: string; tone: ComplianceTone }[] = [
  { value: "planned", label: "Planlagt", tone: "neutral" },
  { value: "in_progress", label: "Pågår", tone: "warn" },
  { value: "completed", label: "Gjennomført", tone: "ok" },
  { value: "follow_up", label: "Oppfølging", tone: "warn" },
];

export function regulationReviewTone(next_review_at: string | null | undefined): ComplianceTone {
  const d = daysUntil(next_review_at);
  if (d === null) return "neutral";
  if (d < 0) return "alert";
  if (d <= 60) return "warn";
  return "ok";
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return "–";
  return new Date(d).toLocaleDateString("nb-NO", { day: "2-digit", month: "short", year: "numeric" });
}
