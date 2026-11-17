/** Select only the latest response for each live assignment; never infer from job status. */
export function liveAssignmentResponses<T extends { job_id: string; technician_user_id: string; created_at: string }>(
  rows: T[], assignments: { event_id: string; user_id: string | null }[],
): T[] {
  const live = new Set(assignments.filter(a => a.user_id).map(a => `${a.event_id}:${a.user_id}`));
  const latest = new Map<string, T>();
  for (const row of rows) {
    const key = `${row.job_id}:${row.technician_user_id}`;
    if (!live.has(key)) continue;
    const previous = latest.get(key);
    if (!previous || Date.parse(row.created_at) > Date.parse(previous.created_at)) latest.set(key, row);
  }
  return [...latest.values()];
}