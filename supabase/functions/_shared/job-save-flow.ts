/**
 * Pure helpers for the job save/notify/Outlook flow.
 *
 * Product contract (approved 11.11.2026):
 * - "Lagre" saves only – no e-mail, Hub notification or calendar write.
 * - "Lagre og varsle" notifies affected technicians, idempotently.
 * - "Oppdater Outlook" is a separate explicit action that PATCHes existing
 *   calendar links only – it must never create a new event when the link is
 *   missing (that would risk duplicates), and never sends e-mail.
 */

export type CalendarUpdatePlan = "patch" | "create" | "no_link" | "in_progress";

/**
 * Decide what an "update" action may do for one recipient.
 * - A "pending:" marker means another sync is in flight → "in_progress"
 *   (never double-create).
 * - updateOnly=true (explicit "Oppdater Outlook"): missing link → "no_link"
 *   (report as pending, never create a duplicate event).
 * - updateOnly=false (legacy flows, e.g. first sync after approval): missing
 *   link → "create" is allowed.
 */
export function planCalendarUpdate(existingCalEventId: string | null | undefined, updateOnly: boolean): CalendarUpdatePlan {
  if (existingCalEventId?.startsWith("pending:")) return "in_progress";
  if (existingCalEventId) return "patch";
  return updateOnly ? "no_link" : "create";
}

export interface NotifyChangeItem {
  label: string;
  oldValue?: string | null;
  newValue?: string | null;
}

/**
 * Stable fingerprint of an info-update notification: same job, same changes
 * (order-independent), same recipient set (order-independent) ⇒ same key.
 * Used to suppress duplicate e-mails/Hub notifications from repeated clicks.
 */
export function notifyFingerprint(jobId: string, changes: NotifyChangeItem[], technicianIds: string[]): string {
  const changePart = changes
    .map((c) => `${c.label}|${(c.oldValue ?? "").trim()}|${(c.newValue ?? "").trim()}`)
    .sort()
    .join(";;");
  const techPart = [...technicianIds].sort().join(",");
  return `${jobId}#${changePart}#${techPart}`;
}

/** Window in which an identical notification is treated as a duplicate. */
export const NOTIFY_DEDUP_WINDOW_MINUTES = 15;

/**
 * Decide whether an info-update notification should be sent, given the
 * fingerprints already sent recently.
 */
export function shouldSendInfoUpdate(fingerprint: string, recentFingerprints: string[]): boolean {
  return !recentFingerprints.includes(fingerprint);
}
