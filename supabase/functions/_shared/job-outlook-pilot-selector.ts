import { buildPerDayPlan } from "./multi-day-calendar.ts";

export interface PilotJob { id: string; company_id: string | null; deleted_at: string | null; project_type: string | null }
export interface PilotAssignment { technician_id: string; name: string; email: string | null; deleted_at: string | null; archived_at: string | null }
export interface PilotBlock { company_id: string; technician_id: string; start_at: string; end_at: string; source: string; deleted_at: string | null }
export interface PilotLink { technician_id: string; work_date: string; status: string; outlook_event_id: string | null }

/** Only live assigned Hub workdays in the JOB company; never Outlook-derived suggestions. */
export function pilotChoices(job: PilotJob, assignments: PilotAssignment[], blocks: PilotBlock[], links: PilotLink[]) {
  if (!job.company_id || job.deleted_at || job.project_type === "task") return [];
  return assignments.filter(a => !a.deleted_at && !a.archived_at && !!a.email?.trim()).map(a => ({
    id: a.technician_id, name: a.name,
    days: buildPerDayPlan(job.id, blocks.filter(b => b.company_id === job.company_id && b.technician_id === a.technician_id && !b.deleted_at && b.source === "manual"))
      .map(d => ({ work_date: d.workDate, start_at: d.startAt, end_at: d.endAt,
        synced: links.some(l => l.technician_id === a.technician_id && l.work_date === d.workDate && l.status === "synced" && !!l.outlook_event_id) })),
  })).filter(a => a.days.length > 0);
}

export function freshMailboxProbe(probe: { created_at: string; result: { pass?: boolean; http?: number } } | null, now: Date): boolean {
  const age = probe ? now.getTime() - Date.parse(probe.created_at) : NaN;
  return !!probe && probe.result?.pass === true && probe.result.http === 200 && age >= 0 && age < 24 * 3600_000;
}
/** Existing unrevoked target for the same (job, technician, day). Expired targets are retired
 *  (revoked + audited) only when a superadmin explicitly confirms a new day; never auto-renewed. */
export function existingTargetDecision(existing: { revoked_at: string | null; expires_at: string } | null, now: Date): "none" | "active" | "expired" {
  if (!existing || existing.revoked_at) return "none";
  return Date.parse(existing.expires_at) <= now.getTime() ? "expired" : "active";
}

/** Former employees are never selectable, regardless of stale login/account rows. */
export const EXCLUDED_TECHNICIANS: ReadonlySet<string> = new Set([
  "ebc15ac7-fd4c-461d-a61c-06b97d705cc0", // Ståle Roar Jensen
  "ba707f5e-0a7d-40b8-95f2-896d1c4c01c2", // Andre Midtgard
]);
export interface IdentityFacts { technician_id: string; archived: boolean; deleted: boolean; account_active: boolean; person_active: boolean; employed_in_company: boolean; mailbox: string }
/** Central calendar eligibility = active technician + active Hub login + active person + active employment in the job company + mailbox. */
export function activeIdentity(f: IdentityFacts): boolean {
  return !EXCLUDED_TECHNICIANS.has(f.technician_id) && !f.archived && !f.deleted && f.account_active && f.person_active && f.employed_in_company && /^[^@\s]+@[^@\s]+$/.test(f.mailbox);
}
export type ReadinessState = "not_selected" | "probe_required" | "probe_ok" | "probe_failed";
/** Per-mailbox read-only state: each mailbox needs its own fresh 200; one mailbox never proves another. */
export function mailboxReadiness(probe: { created_at: string; result: { pass?: boolean; http?: number } } | null, hasTarget: boolean, now: Date): ReadinessState {
  if (!hasTarget) return "not_selected";
  if (!probe) return "probe_required";
  if (freshMailboxProbe(probe, now)) return "probe_ok";
  return probe.result?.pass === false ? "probe_failed" : "probe_required";
}
