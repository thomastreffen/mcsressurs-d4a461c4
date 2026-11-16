import { invokeWithSession } from "./invoke-session";
import { assertNotificationResult } from "./job-notification-result";
import { toast } from "sonner";

/** Saving stays distinct from the downstream mail receipt. No automatic retries. */
export async function notifyJobAssignment(id: string, technicianIds?: string[], responseRequired = true) {
  try {
    const result = await invokeWithSession("create-approval", { body: { job_id: id, ...(technicianIds ? { technician_ids: technicianIds } : {}), response_required: responseRequired } });
    assertNotificationResult(result);
    return true;
  } catch (error) {
    toast.warning("Jobben er lagret, men varsling er ikke komplett", { description: error instanceof Error ? error.message : "Se Utsending per montør" });
    return false;
  }
}

export async function notifyJobTimeChange(id: string, technicianIds: string[], start: Date, end: Date) {
  if (!technicianIds.length) return;
  try {
    const result = await invokeWithSession("notify-event-changes", { body: { job_id: id, technician_ids: technicianIds, changes: [{ label: "Arbeidstid", newValue: `${start.toISOString()} – ${end.toISOString()}` }] } });
    assertNotificationResult(result);
  } catch (error) {
    toast.warning("Tid er lagret, men varsling er ikke komplett", { description: error instanceof Error ? error.message : "Se Utsending per montør" });
  }
}