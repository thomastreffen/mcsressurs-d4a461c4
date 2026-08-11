/**
 * Centralized job status definitions and workflow logic.
 *
 * Statuses are divided into three axes:
 * 1. Acceptance (montørsvar) – technician response to assignment
 * 2. Execution (utførelse) – operational progress
 * 3. Billing (økonomi) – post-completion financial status
 */

export type JobStatus =
  | "requested"
  | "approved"
  | "time_change_proposed"
  | "rejected"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "ready_for_invoicing"
  | "invoiced"
  | "cancelled";

export type StatusAxis = "acceptance" | "execution" | "billing";

export interface StatusConfig {
  label: string;
  className: string;
  borderClass: string;
  dotClass: string;
  axis: StatusAxis;
  /** Icon hint for compact display (calendar blocks) */
  iconHint?: "clock" | "check" | "clock-change" | "x" | "calendar" | "play" | "check-circle" | "receipt" | "file-check";
}

export const JOB_STATUS_CONFIG: Record<JobStatus, StatusConfig> = {
  // ── Acceptance (montørsvar) ──
  requested: {
    label: "Forespurt",
    className: "bg-status-requested text-status-requested-foreground",
    borderClass: "border-l-status-requested",
    dotClass: "bg-status-requested",
    axis: "acceptance",
    iconHint: "clock",
  },
  approved: {
    label: "Godkjent",
    className: "bg-status-approved text-status-approved-foreground",
    borderClass: "border-l-status-approved",
    dotClass: "bg-status-approved",
    axis: "acceptance",
    iconHint: "check",
  },
  time_change_proposed: {
    label: "Tidsendring foreslått",
    className: "bg-status-time-change-proposed text-status-time-change-proposed-foreground",
    borderClass: "border-l-status-time-change-proposed",
    dotClass: "bg-status-time-change-proposed",
    axis: "acceptance",
    iconHint: "clock-change",
  },
  rejected: {
    label: "Avslått",
    className: "bg-status-rejected text-status-rejected-foreground",
    borderClass: "border-l-status-rejected",
    dotClass: "bg-status-rejected",
    axis: "acceptance",
    iconHint: "x",
  },
  // ── Execution (utførelse) ──
  scheduled: {
    label: "Planlagt",
    className: "bg-status-scheduled text-status-scheduled-foreground",
    borderClass: "border-l-status-scheduled",
    dotClass: "bg-status-scheduled",
    axis: "execution",
    iconHint: "calendar",
  },
  in_progress: {
    label: "Pågår",
    className: "bg-status-in-progress text-status-in-progress-foreground",
    borderClass: "border-l-status-in-progress",
    dotClass: "bg-status-in-progress",
    axis: "execution",
    iconHint: "play",
  },
  completed: {
    label: "Ferdig",
    className: "bg-status-completed text-status-completed-foreground",
    borderClass: "border-l-status-completed",
    dotClass: "bg-status-completed",
    axis: "execution",
    iconHint: "check-circle",
  },
  // ── Billing (økonomi) ──
  ready_for_invoicing: {
    label: "Klar for fakturering",
    className: "bg-status-ready-for-invoicing text-status-ready-for-invoicing-foreground",
    borderClass: "border-l-status-ready-for-invoicing",
    dotClass: "bg-status-ready-for-invoicing",
    axis: "billing",
    iconHint: "receipt",
  },
  invoiced: {
    label: "Fakturert",
    className: "bg-status-invoiced text-status-invoiced-foreground",
    borderClass: "border-l-status-invoiced",
    dotClass: "bg-status-invoiced",
    axis: "billing",
    iconHint: "file-check",
  },
  cancelled: {
    label: "Kansellert",
    className: "bg-muted text-muted-foreground",
    borderClass: "border-l-muted-foreground",
    dotClass: "bg-muted-foreground",
    axis: "execution",
    iconHint: "x",
  },
};

export const ALL_STATUSES: JobStatus[] = [
  "requested",
  "approved",
  "time_change_proposed",
  "rejected",
  "scheduled",
  "in_progress",
  "completed",
  "ready_for_invoicing",
  "invoiced",
  "cancelled",
];

/** Statuses grouped by axis */
export const ACCEPTANCE_STATUSES: JobStatus[] = ["requested", "approved", "time_change_proposed", "rejected"];
export const EXECUTION_STATUSES: JobStatus[] = ["scheduled", "in_progress", "completed", "cancelled"];
export const BILLING_STATUSES: JobStatus[] = ["ready_for_invoicing", "invoiced"];

export const STATUS_AXIS_LABELS: Record<StatusAxis, string> = {
  acceptance: "Montørsvar",
  execution: "Utførelse",
  billing: "Økonomi",
};

/** Which statuses a montør (technician) can set */
export const TECHNICIAN_ALLOWED_STATUSES: JobStatus[] = [
  "in_progress",
  "completed",
];

/** Which statuses admin can set (all except super_admin-restricted) */
export const ADMIN_ALLOWED_STATUSES: JobStatus[] = ALL_STATUSES;

/** System-set statuses (not user-settable directly) */
export const SYSTEM_STATUSES: JobStatus[] = ["requested", "approved"];

/** Check if a role can transition to a given status */
export function canSetStatus(
  role: "super_admin" | "admin" | "montør" | "customer_user" | string,
  targetStatus: JobStatus
): boolean {
  if (role === "super_admin" || role === "admin") return true;
  if (role === "montør") return TECHNICIAN_ALLOWED_STATUSES.includes(targetStatus);
  return false;
}

/** Get display number for a job */
export function getDisplayNumber(jobNumber: string | null, internalNumber: string | null): string {
  return jobNumber || internalNumber || "—";
}

/**
 * Determine the effective execution status from the legacy single-status field.
 * The DB stores a single status that may be acceptance OR execution OR billing.
 * This function maps it to the execution axis for display purposes.
 */
export function getExecutionStatus(status: JobStatus): JobStatus {
  // If status is already execution or billing, use it
  if (EXECUTION_STATUSES.includes(status) || BILLING_STATUSES.includes(status)) {
    return status;
  }
  // Acceptance statuses imply "scheduled" for execution axis (job is in plan)
  return "scheduled";
}

/**
 * Determine the acceptance status from the legacy single-status field.
 * Falls back to "requested" if status is not an acceptance type.
 */
export function getAcceptanceFromLegacy(status: JobStatus): JobStatus | null {
  if (ACCEPTANCE_STATUSES.includes(status)) return status;
  // If the job has moved past acceptance (scheduled, in_progress, etc.), it was implicitly approved
  if (EXECUTION_STATUSES.includes(status) || BILLING_STATUSES.includes(status)) return "approved";
  return null;
}
