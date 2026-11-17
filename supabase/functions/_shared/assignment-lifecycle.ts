// Shared operational rule. A recipient response is not a job cancellation.
export function isJobEnded(job: { status: string | null; deleted_at: string | null }): boolean {
  return !!job.deleted_at || job.status === "cancelled" || job.status === "archived";
}

/** Only an explicit person/day removal command may delete a calendar copy. */
export function permitsDayDelete(workDate: string, activeDays: Set<string>, confirmedDays: readonly string[]): boolean {
  return confirmedDays.includes(workDate) && !activeDays.has(workDate);
}