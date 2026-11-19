export type MailboxCandidate = { id: string; name: string; email: string };
/** Normalizes any cached/server shape into a technician array so widgets sharing one query never crash. */
export function normalizeMailboxCandidates(data: unknown): MailboxCandidate[] {
  const list = Array.isArray(data) ? data : (data as { technicians?: unknown } | null | undefined)?.technicians;
  return Array.isArray(list) ? list.filter((t): t is MailboxCandidate => !!t && typeof (t as MailboxCandidate).id === "string") : [];
}
