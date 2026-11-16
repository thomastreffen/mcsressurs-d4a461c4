/** Public operational projection after job-access has authorized this exact job. */
export function assignmentInfo(
  uid: string,
  assigned: { technician_id: string; technicians: { name: string; user_id: string | null } | null }[],
  approvals: { technician_user_id: string; status: string }[],
  blocks: { technician_id: string; start_at: string; end_at: string }[],
) {
  const ownIds = new Set(assigned.filter(a => a.technicians?.user_id === uid).map(a => a.technician_id));
  const days = new Map<string, { start: string; end: string }>();
  for (const b of blocks) {
    // Authorized planner has no own assignment: show the live assigned team's days.
    if (ownIds.has(b.technician_id) || (ownIds.size === 0 && assigned.some(a => a.technician_id === b.technician_id))) days.set(`${b.start_at}|${b.end_at}`, { start: b.start_at, end: b.end_at });
  }
  return {
    planned_days: [...days.values()].sort((a, b) => a.start.localeCompare(b.start)),
    approvals: assigned.flatMap(a => {
      const t = a.technicians;
      if (!t) return [];
      return [{ name: t.name, own: t.user_id === uid, status: approvals.find(p => p.technician_user_id === t.user_id)?.status ?? "pending" }];
    }),
  };
}