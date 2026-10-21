/** Presentation only: closed and rejected reports are finished history. */
export function isFinishedIncident(status: string) {
  return status === "closed" || status === "rejected";
}

export function groupIncidentHistory<T extends { status: string; created_at: string }>(incidents: T[]) {
  const newestFirst = [...incidents].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return {
    open: newestFirst.filter((incident) => !isFinishedIncident(incident.status)),
    closed: newestFirst.filter((incident) => isFinishedIncident(incident.status)),
  };
}