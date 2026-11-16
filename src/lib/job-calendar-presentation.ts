export interface CalendarCapability {
  technician_id: string;
  delegated_available: boolean;
  existing_link: boolean;
}
export interface QueueIntent {
  id?: string;
  technician_id?: string | null;
  operation: string;
  status: string;
  reason_code: string | null;
  attempt_count: number;
  updated_at?: string;
}
export const CENTRAL_WAITING = "Sentral synk venter på aktivering, ingen utsending forsøkt";

/** Never infer a token from an old successful delivery or a calendar link. */
export function eligibleMissingDays<T extends { technicianId: string }>(days: T[], capabilities: CalendarCapability[] = []) {
  return days.filter(d => capabilities.some(c => c.technician_id === d.technicianId && c.delegated_available));
}
export function canUpdateDelegated(capabilities: CalendarCapability[] = []) {
  return capabilities.some(c => c.delegated_available && c.existing_link);
}
/** Intent without an active recipient is audit only, never an actionable recipient. */
export function projectQueue(intents: QueueIntent[], assignedIds: string[]) {
  const current: QueueIntent[] = [], audit: QueueIntent[] = [];
  for (const item of intents) {
    if (item.status === "accepted") continue;
    if (!item.technician_id || !assignedIds.includes(item.technician_id) || item.operation === "delete") audit.push(item);
    else current.push(item);
  }
  return { current, audit, dormant: current.filter(i => i.status === "pending" && i.attempt_count === 0) };
}