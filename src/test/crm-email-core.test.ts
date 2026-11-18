import { describe, it, expect } from "vitest";
import { resolveRecipients, classifySend, buildMessage, sendEnabled, validateContent } from "../../supabase/functions/_shared/crm-email-core";
const c = [{ id: "k1", name: "Ola", email: "Ola@Bravida.no" }];
describe("CRM email rules", () => {
  it("contact not belonging to customer (not resolved) is rejected", () => {
    expect(resolveRecipients({ contacts: c, requestedContactIds: ["k1", "k2"], manual: [], manualConfirmed: false })).toEqual({ ok: false, code: "contact_not_available" });
  });
  it("manual address requires explicit confirmation", () => {
    expect(resolveRecipients({ contacts: c, requestedContactIds: ["k1"], manual: ["x@y.no"], manualConfirmed: false })).toEqual({ ok: false, code: "manual_not_confirmed" });
    const r = resolveRecipients({ contacts: c, requestedContactIds: ["k1"], manual: ["x@y.no", "OLA@bravida.no"], manualConfirmed: true });
    expect(r).toEqual({ ok: true, to: ["ola@bravida.no", "x@y.no"], manual: ["x@y.no"] });
  });
  it("no recipients is rejected", () => {
    expect(resolveRecipients({ contacts: [], requestedContactIds: [], manual: [], manualConfirmed: false })).toEqual({ ok: false, code: "no_recipients" });
  });
  it("only 202 is accepted; 5xx/429/timeout are uncertain, never retried as failed", () => {
    expect(classifySend(202)).toBe("accepted");
    expect(classifySend(503)).toBe("uncertain");
    expect(classifySend(429)).toBe("uncertain");
    expect(classifySend(null)).toBe("uncertain");
    expect(classifySend(403)).toBe("failed");
  });
  it("reply-to routes to the Hub thread token", () => {
    const m = buildMessage({ subject: "S", body: "<b>x</b>", to: ["a@b.no"], inboundToken: "abc-1", threadId: "t", replyDomain: "mcsservice.no", senderName: "Thomas" });
    expect(m.replyTo[0].emailAddress.address).toBe("thread+abc-1@mcsservice.no");
    expect(m.body.content).not.toContain("<b>");
  });
  it("sending is off unless explicitly enabled", () => {
    expect(sendEnabled(() => undefined)).toBe(false);
    expect(sendEnabled(() => "true")).toBe(true);
  });
  it("empty subject or body is rejected", () => {
    expect(validateContent("", "x")).toBe("invalid_subject");
    expect(validateContent("x", " ")).toBe("invalid_body");
  });
});
