/** Normalize legacy storage names only for display/counting; never rewrite approvals. */
export function approvalResponseStatus(status: string): string {
  if (status === "rejected") return "declined";
  if (status === "reschedule_requested") return "change_request";
  return status;
}