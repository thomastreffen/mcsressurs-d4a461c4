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