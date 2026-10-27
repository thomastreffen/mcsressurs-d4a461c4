/** Pure send guards shared by the preview and the authenticated sender. */
export interface SendFinding {
  id: string;
  status: string;
  documentation_status: string;
  internal_assessment?: string | null;
  responsible_person_id?: string | null;
  responsible_role_id?: string | null;
  response_text?: string | null;
  response_approved_at?: string | null;
  condition_corrected_at?: string | null;
  documentation_complete_at?: string | null;
}
export function responseFindingReady(f: SendFinding): boolean {
  return ["documentation_ready", "submitted", "approved"].includes(f.status)
    && f.documentation_status === "complete"
    && Boolean(f.internal_assessment?.trim() && (f.responsible_person_id || f.responsible_role_id)
      && f.response_text?.trim() && f.response_approved_at && f.condition_corrected_at && f.documentation_complete_at);
}
export function previewAllowsSend(input: { current: string; confirmed: string | null; ready: boolean; busy: boolean }): boolean {
  return input.ready && !input.busy && Boolean(input.current) && input.confirmed === input.current;
}
/** Saving/preparing is never a delivery receipt. */
export function initialPackageDelivery(mode: "send" | "export") {
  return { status: mode === "send" ? "draft" : "exported", sent_at: null, sent_by: null };
}
export function explicitPackageSend(confirmed: unknown, status: string): boolean {
  return confirmed === true && ["draft", "exported"].includes(status);
}