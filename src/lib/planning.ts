/**
 * Planlegging / Prosjektboard – felles statuser, labels og hjelpefunksjoner.
 * Paraplylag over eksisterende MCS-moduler (prosjekter, ressursplan, kunder).
 */

export type PlanningStatus =
  | "early_planning"
  | "probable"
  | "confirmed"
  | "ready_for_resource_plan"
  | "in_progress"
  | "completed"
  | "cancelled";

export const PLANNING_STATUS_ORDER: PlanningStatus[] = [
  "early_planning",
  "probable",
  "confirmed",
  "ready_for_resource_plan",
  "in_progress",
  "completed",
  "cancelled",
];

export const PLANNING_STATUS_LABELS: Record<PlanningStatus, string> = {
  early_planning: "Tidlig planlegging",
  probable: "Sannsynlig",
  confirmed: "Bekreftet",
  ready_for_resource_plan: "Klar for ressursplan",
  in_progress: "Pågår",
  completed: "Fullført",
  cancelled: "Kansellert",
};

/** Enkel indikator på hvor sikkert prosjektet er. */
export function planningCertainty(status: string): { label: string; tone: "muted" | "warning" | "success" } {
  if (status === "early_planning") return { label: "Tidlig", tone: "muted" };
  if (status === "probable") return { label: "Sannsynlig", tone: "warning" };
  if (status === "cancelled") return { label: "Kansellert", tone: "muted" };
  return { label: "Bekreftet", tone: "success" };
}

export const CONTRACT_FORMS = [
  { value: "fixed_price", label: "Fastpris" },
  { value: "hourly", label: "Timepris" },
  { value: "cost_plus", label: "Regningsarbeid" },
  { value: "internal", label: "Internjobb" },
  { value: "unclear", label: "Ikke avklart" },
] as const;

export function contractFormLabel(v: string | null | undefined): string {
  return CONTRACT_FORMS.find((c) => c.value === v)?.label ?? "Ikke avklart";
}

export const WP_STATUSES = [
  { value: "planned", label: "Planlagt" },
  { value: "ready", label: "Klar" },
  { value: "in_progress", label: "Pågår" },
  { value: "done", label: "Fullført" },
  { value: "cancelled", label: "Kansellert" },
] as const;

export function wpStatusLabel(v: string | null | undefined): string {
  return WP_STATUSES.find((c) => c.value === v)?.label ?? "Planlagt";
}

export const ASSIGNMENT_STATES = [
  { value: "not_assigned", label: "Ikke tildelt" },
  { value: "department_assigned", label: "Tildelt avdeling" },
  { value: "people_assigned", label: "Personer valgt" },
  { value: "in_resource_plan", label: "I ressursplan" },
] as const;

export function assignmentStateLabel(v: string | null | undefined): string {
  return ASSIGNMENT_STATES.find((c) => c.value === v)?.label ?? "Ikke tildelt";
}

export const TASK_STATUSES = [
  { value: "open", label: "Åpen" },
  { value: "in_progress", label: "Pågår" },
  { value: "blocked", label: "Blokkert" },
  { value: "done", label: "Ferdig" },
] as const;

export function taskStatusLabel(v: string | null | undefined): string {
  return TASK_STATUSES.find((c) => c.value === v)?.label ?? "Åpen";
}

export const CONTACT_ROLES = [
  "Kunde",
  "Prosjektleder",
  "Site manager",
  "Teknisk kontakt",
  "Fakturakontakt",
  "Leverandør",
  "Underleverandør",
];

export const EXTERNAL_SYSTEMS = [
  "Business Central",
  "SharePoint",
  "Tripletex",
  "MCS",
  "Annet",
];

export const DEFAULT_FILE_CATEGORIES = ["Generelt", "Tegninger", "Bilder", "Dokumentasjon"];

/** ISO-uke, brukt for periodevisning på board og i filtre. */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function formatPeriod(
  start: string | null,
  end: string | null,
  periodLabel: string | null,
): string {
  if (periodLabel) return periodLabel;
  if (!start && !end) return "Periode ikke satt";
  const fmt = (s: string) => {
    const d = new Date(s);
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  if (start && end) {
    const w = isoWeek(new Date(start));
    return `${fmt(start)}–${fmt(end)} (uke ${w})`;
  }
  const one = (start || end)!;
  return `${fmt(one)} (uke ${isoWeek(new Date(one))})`;
}

export function formatMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return "–";
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(v) + " kr";
}

/** Kort oppsummering av ressursbehov, f.eks. "3 montører / 32 t". */
export function resourceNeedLabel(count: number | null, hours: number | null): string | null {
  const parts: string[] = [];
  if (count) parts.push(`${count} ${count === 1 ? "person" : "personer"}`);
  if (hours) parts.push(`${hours} t`);
  return parts.length ? parts.join(" / ") : null;
}
