import { sendMail } from "./m365-sender.ts";
import { recordDelivery } from "./recipient-delivery.ts";

/** One atomic claim per recipient and semantic message. Unknown outcomes never replay. */
export async function sendJobEmail(db: any, eventId: string, technicianId: string, message: Parameters<typeof sendMail>[0], options: Parameters<typeof sendMail>[1], retryFailed = false) {
  // Rotating response tokens do not create a new communication intent.
  const semanticHtml = message.html.replace(/\/approval\/[a-zA-Z0-9-]+/g, "/approval/response");
  const bytes = new TextEncoder().encode(JSON.stringify([eventId, technicianId, message.to, message.subject, semanticHtml]));
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(b => b.toString(16).padStart(2, "0")).join("");
  const key = `job-email:${eventId}:${technicianId}:${hash}`;
  const claim = await db.rpc("claim_job_email_attempt", { _key: key, _event: eventId, _technician: technicianId, _retry: retryFailed });
  if (claim.error) throw new Error("E-postforsøket kunne ikke registreres; ingenting sendt");
  if (!claim.data) {
    const previous = await db.from("job_email_attempts").select("outcome,graph_status").eq("operation_key", key).maybeSingle();
    if (previous.error) throw new Error("Tidligere e-postresultat kunne ikke kontrolleres");
    return { ok: previous.data?.outcome === "accepted", status: previous.data?.graph_status ?? null, reason: "unknown_graph_outcome", detail: null, duplicate: true };
  }
  await recordDelivery(db, { eventId, technicianId, channel: "email", recipientEmail: message.to, status: "pending", operationKey: key });
  let result;
  try { result = await sendMail(message, options); }
  catch { return { ok: false, status: null, reason: "unknown_graph_outcome", detail: null, duplicate: false }; }
  // A network failure is ambiguous: keep pending, never automatically replay it.
  const uncertain = !result.ok && (result.reason === "network_error" || result.reason === "unknown_graph_outcome");
  const saved = await db.from("job_email_attempts").update({ outcome: result.ok ? "accepted" : uncertain ? "pending" : "failed", graph_status: result.status, reason_code: result.ok ? null : result.reason, finished_at: new Date().toISOString() }).eq("operation_key", key);
  if (saved.error) throw new Error("E-postresultatet er ukjent; avstemming kreves før nytt forsøk");
  return { ...result, reason: result.ok ? null : result.reason, detail: result.ok ? null : result.detail, duplicate: false };
}