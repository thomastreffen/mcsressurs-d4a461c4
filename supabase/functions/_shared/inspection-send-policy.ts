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
}/** Test mail goes only to the caller's registered work e-mail, never to the authority. */
export function resolveTestRecipient(workEmail?: string | null, loginEmail?: string | null): string | null {
  const ok = (v?: string | null) => (v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? v.trim().toLowerCase() : null);
  return ok(workEmail) ?? ok(loginEmail);
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
/** Builds the test message: same HTML/attachments, marked TEST, only one recipient, no cc. */
export function buildTestMessage(input: { subject: string; html: string; caseNumber?: string | null; to: string; attachments: unknown[] }) {
  const label = `TEST – DLE svarpakke${input.caseNumber ? ` – sak ${input.caseNumber}` : ""}`;
  const banner = `<div style="background:#fef3c7;border:2px solid #d97706;color:#78350f;padding:12px 16px;margin:0 0 20px;font-family:Segoe UI,Arial,sans-serif;font-size:14px;"><strong>${esc(label)}</strong><br>Dette er en intern test. Den er ikke sendt til DLE, og ingen status er endret.</div>`;
  return {
    subject: `${label} · ${input.subject}`,
    body: { contentType: "HTML", content: banner + input.html },
    toRecipients: [{ emailAddress: { address: input.to } }],
    attachments: input.attachments,
  };
}
