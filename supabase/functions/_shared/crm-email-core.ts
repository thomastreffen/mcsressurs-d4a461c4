// Pure rules for CRM email sent from the signed-in salesperson's own Microsoft account.
export const CRM_EMAIL_MAX_RECIPIENTS = 20;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type ResolvedContact = { id: string; name: string; email: string };
export type RecipientInput = { contacts: ResolvedContact[]; requestedContactIds: string[]; manual: string[]; manualConfirmed: boolean };

export function resolveRecipients(i: RecipientInput): { ok: true; to: string[]; manual: string[] } | { ok: false; code: string } {
  const found = new Set(i.contacts.map((c) => c.id));
  if (i.requestedContactIds.some((id) => !found.has(id))) return { ok: false, code: "contact_not_available" };
  const manual = [...new Set(i.manual.map((m) => m.trim().toLowerCase()).filter(Boolean))];
  if (manual.some((m) => m.length > 254 || !EMAIL_RE.test(m))) return { ok: false, code: "invalid_manual_email" };
  if (manual.length > 0 && !i.manualConfirmed) return { ok: false, code: "manual_not_confirmed" };
  const to = [...new Set([...i.contacts.map((c) => c.email.toLowerCase()), ...manual])];
  if (to.length === 0) return { ok: false, code: "no_recipients" };
  if (to.length > CRM_EMAIL_MAX_RECIPIENTS) return { ok: false, code: "too_many_recipients" };
  return { ok: true, to, manual: manual.filter((m) => !i.contacts.some((c) => c.email.toLowerCase() === m)) };
}

export function validateContent(subject: string, body: string): string | null {
  if (!subject.trim() || subject.length > 250) return "invalid_subject";
  if (!body.trim() || body.length > 20000) return "invalid_body";
  return null;
}

export function sendEnabled(env: (k: string) => string | undefined) {
  return env("CRM_EMAIL_SEND_ENABLED") === "true";
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function buildMessage(o: { subject: string; body: string; to: string[]; inboundToken: string; threadId: string; replyDomain: string; senderName: string }) {
  return {
    subject: o.subject,
    body: { contentType: "HTML", content: `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.6">${esc(o.body).replace(/\n/g, "<br/>")}</div>` },
    toRecipients: o.to.map((address) => ({ emailAddress: { address } })),
    replyTo: [{ emailAddress: { address: `thread+${o.inboundToken}@${o.replyDomain}`, name: o.senderName } }],
    internetMessageHeaders: [
      { name: "X-MCS-Thread-Token", value: o.inboundToken },
      { name: "X-MCS-THREAD", value: o.threadId },
      { name: "X-MCS-ENTITY", value: "CRM" },
    ],
  };
}

/** Graph outcome classification. Unknown outcomes are never retried automatically. */
export function classifySend(status: number | null): "accepted" | "failed" | "uncertain" {
  if (status === 202) return "accepted";
  if (status === null || status >= 500 || status === 429) return "uncertain";
  return "failed";
}

/** Delegated scopes from an access token's `scp` claim (payload only; token is never logged or returned). */
export function tokenScopes(token: string | null): string[] {
  if (!token) return [];
  try {
    const part = token.split(".")[1];
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=")));
    return typeof json.scp === "string" ? json.scp.split(" ") : [];
  } catch { return []; }
}

export type SenderCapability = "can_send" | "missing_send" | "not_connected";
export function senderCapability(token: string | null): SenderCapability {
  if (!token) return "not_connected";
  return tokenScopes(token).some((s) => s.toLowerCase() === "mail.send") ? "can_send" : "missing_send";
}

/** Reconciliation of an uncertain send: only a found Sent Items copy counts as accepted. */
export function reconcileOutcome(foundInSentItems: boolean | null): "accepted" | "not_sent" | "uncertain" {
  if (foundInSentItems === null) return "uncertain";
  return foundInSentItems ? "accepted" : "not_sent";
}
