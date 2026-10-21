/**
 * Delt logikk for HMS-internkontrollsløyfen:
 * årshjul, virksomhetsrisikoregister, handlingsplan og årlig internkontrollgjennomgang.
 * Ren presentasjons-/beregningslogikk — ingen datahenting her.
 */

// ---------- HMS-årshjul ----------

export const ACTIVITY_FREQUENCIES = ["monthly", "quarterly", "semiannual", "annual", "custom"] as const;
export type ActivityFrequency = (typeof ACTIVITY_FREQUENCIES)[number];

export const FREQUENCY_LABEL: Record<ActivityFrequency, string> = {
  monthly: "Månedlig",
  quarterly: "Kvartalsvis",
  semiannual: "Halvårlig",
  annual: "Årlig",
  custom: "Egendefinert",
};

export const ACTIVITY_CATEGORY_LABEL: Record<string, string> = {
  internrevisjon: "Internrevisjon",
  vernerunde: "Vernerunde",
  handbok: "Gjennomgang av HMS-håndbok",
  fse: "FSE-status / opplæring",
  forstehjelp: "Førstehjelpskontroll",
  sds: "Stoffkartotek / SDS-gjennomgang",
  kompetanse: "Kompetansekontroll",
  beredskap: "Beredskapsøvelse",
  ledelse: "Ledelsens HMS-gjennomgang",
  risiko: "Oppdatering av risikovurdering",
  annet: "Annet",
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(d: Date | string): Date {
  return typeof d === "string" ? new Date(`${d.slice(0, 10)}T12:00:00`) : d;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Neste forfallsdato etter gjennomføring, basert på frekvens. */
export function nextDueDate(from: Date | string, frequency: ActivityFrequency, customIntervalDays?: number | null): string {
  const d = toDate(from);
  switch (frequency) {
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      break;
    case "semiannual":
      d.setMonth(d.getMonth() + 6);
      break;
    case "annual":
      d.setFullYear(d.getFullYear() + 1);
      break;
    case "custom":
      d.setTime(d.getTime() + Math.max(1, customIntervalDays ?? 30) * DAY_MS);
      break;
  }
  return isoDate(d);
}

export type ActivityState = "done" | "cancelled" | "overdue" | "due_soon" | "planned";

export const ACTIVITY_STATE_LABEL: Record<ActivityState, string> = {
  done: "Gjennomført",
  cancelled: "Avbrutt",
  overdue: "Forfalt",
  due_soon: "Nærmer seg",
  planned: "Planlagt",
};

/** Utledet visningsstatus: forfalt/nærmer seg regnes fra due_date, aldri lagret. */
export function activityState(
  a: { status: string; due_date: string },
  today: Date = new Date()
): ActivityState {
  if (a.status === "done") return "done";
  if (a.status === "cancelled") return "cancelled";
  const due = toDate(a.due_date).getTime();
  const t = toDate(today).getTime();
  if (due < t) return "overdue";
  if (due - t <= 30 * DAY_MS) return "due_soon";
  return "planned";
}

// ---------- Virksomhetsrisikoregister ----------

export type RiskLevel = "low" | "medium" | "high" | "critical";

export const RISK_LEVEL_LABEL: Record<RiskLevel, string> = {
  low: "Lav",
  medium: "Middels",
  high: "Høy",
  critical: "Kritisk",
};

export const RISK_LEVEL_STYLE: Record<RiskLevel, string> = {
  low: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  critical: "bg-rose-50 text-rose-700 border-rose-200",
};

/** Risikonivå fra score (sannsynlighet × konsekvens, 1–25). */
export function riskLevel(score: number): RiskLevel {
  if (score >= 15) return "critical";
  if (score >= 10) return "high";
  if (score >= 5) return "medium";
  return "low";
}

export const RISK_STATUS_LABEL: Record<string, string> = {
  active: "Aktiv",
  mitigated: "Redusert",
  closed: "Lukket",
};

// ---------- HMS-handlingsplan (hms_action_items) ----------

export const ACTION_STATUS_LABEL: Record<string, string> = {
  open: "Ny",
  in_progress: "Pågår",
  waiting: "Avventer",
  done: "Ferdig",
};

export const OPEN_ACTION_STATUSES = ["open", "in_progress", "waiting"] as const;

export const ACTION_SOURCE_LABEL: Record<string, string> = {
  risk_register: "Risikovurdering",
  year_activity: "HMS-årshjul",
  internal_review: "Internkontroll",
  incident: "Avvik / RUH",
  inspection: "Tilsyn",
  audit: "Internrevisjon",
  submission: "Sjekkliste / SJA",
  alert: "Varsel",
  manual: "Manuelt",
};

/** Kilde for et tiltak: eksplisitt source_type vinner, ellers utledes fra koblingsfelt. */
export function deriveActionSource(item: {
  source_type?: string | null;
  risk_register_id?: string | null;
  year_activity_id?: string | null;
  internal_review_id?: string | null;
  incident_id?: string | null;
  compliance_inspection_id?: string | null;
  compliance_audit_id?: string | null;
  compliance_finding_id?: string | null;
  submission_id?: string | null;
  alert_id?: string | null;
}): string {
  if (item.source_type) return item.source_type;
  if (item.risk_register_id) return "risk_register";
  if (item.year_activity_id) return "year_activity";
  if (item.internal_review_id) return "internal_review";
  if (item.incident_id) return "incident";
  if (item.compliance_inspection_id || item.compliance_finding_id) return "inspection";
  if (item.compliance_audit_id) return "audit";
  if (item.submission_id) return "submission";
  if (item.alert_id) return "alert";
  return "manual";
}

/** Forfalt = har frist i fortid og er ikke ferdig. */
export function isActionOverdue(
  a: { status: string; due_date?: string | null },
  today: Date = new Date()
): boolean {
  if (a.status === "done") return false;
  if (!a.due_date) return false;
  return toDate(a.due_date).getTime() < toDate(today).getTime();
}

export type ActionDisplayStatus = "open" | "in_progress" | "waiting" | "done" | "overdue";

export function actionDisplayStatus(
  a: { status: string; due_date?: string | null },
  today: Date = new Date()
): ActionDisplayStatus {
  if (a.status === "done") return "done";
  if (isActionOverdue(a, today)) return "overdue";
  return (OPEN_ACTION_STATUSES as readonly string[]).includes(a.status)
    ? (a.status as ActionDisplayStatus)
    : "open";
}

export const ACTION_DISPLAY_LABEL: Record<ActionDisplayStatus, string> = {
  open: "Ny",
  in_progress: "Pågår",
  waiting: "Avventer",
  done: "Ferdig",
  overdue: "Forfalt",
};

// ---------- Årlig internkontrollgjennomgang ----------

export interface ReviewCheckpoint {
  key: string;
  label: string;
  /** Nøkkel i auto_snapshot som gir systemfakta for punktet */
  snapshotKey?: string;
}

export const REVIEW_CHECKPOINTS: ReviewCheckpoint[] = [
  { key: "year_wheel", label: "HMS-årshjulet er gjennomført etter plan", snapshotKey: "yearActivitiesOverdue" },
  { key: "actions", label: "Åpne og forfalte tiltak er under kontroll", snapshotKey: "overdueActions" },
  { key: "incidents", label: "Åpne avvik er behandlet", snapshotKey: "openIncidents" },
  { key: "repeated_incidents", label: "Gjentakende avvik er vurdert", snapshotKey: "repeatedIncidents" },
  { key: "serious_incidents", label: "Alvorlige hendelser er fulgt opp", snapshotKey: "seriousIncidents" },
  { key: "vernerunder", label: "Vernerunder er gjennomført", snapshotKey: "vernerunderDone" },
  { key: "handbook_acks", label: "Alle ansatte har gjeldende HMS-bekreftelse", snapshotKey: "missingHandbookAcks" },
  { key: "fse", label: "FSE-opplæring er gyldig for alle berørte", snapshotKey: "expiredFse" },
  { key: "first_aid", label: "Førstehjelpskompetanse er gyldig", snapshotKey: "expiredFirstAid" },
  { key: "sds", label: "Stoffkartotek/SDS er komplett og revidert", snapshotKey: "sdsMissing" },
  { key: "organisation", label: "Organisasjon, roller og ansvar er oppdatert" },
  { key: "new_methods", label: "Nye arbeidsmetoder/kjemikalier er risikovurdert" },
  { key: "risk_register", label: "Risikoregisteret er oppdatert", snapshotKey: "risksNeedingReview" },
  { key: "hms_goals", label: "Status på HMS-mål er vurdert" },
];

export type ReviewAnswer = "yes" | "no" | "na";

export const REVIEW_ANSWER_LABEL: Record<ReviewAnswer, string> = {
  yes: "Ja",
  no: "Nei",
  na: "Ikke relevant",
};
