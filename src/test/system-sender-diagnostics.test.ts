import { describe, it, expect } from "vitest";
import { evaluateSender, testSendGate, TEST_SEND_PHRASE, type SenderFacts } from "../../supabase/functions/_shared/system-sender-diagnostics-core";
const base: SenderFacts = { secrets: { tenant: true, client: true, secret: true }, calendarClientId: "cal", mode: "", scopeVerified: "", pilotRecipients: [], token: { ok: true, tid: "t", appId: "mail", roles: ["Mail.Send"] }, tenantId: "t", mailClientId: "mail" };
const ready: SenderFacts = { ...base, scopeVerified: "true", pilotRecipients: ["thomas.treffen@mcsservice.no"] };
const state = (f: SenderFacts, k: string) => evaluateSender(f).checks.find(c => c.key === k)!.state;
describe("system sender readiness", () => {
  it("today's setup (no scope attestation, no pilot) is not ready", () => {
    expect(evaluateSender(base).ready_for_test).toBe(false);
    expect(state(base, "mailbox_scope")).toBe("manual");
    expect(state(base, "pilot")).toBe("missing");
  });
  it("ready only with Mail.Send, separate app, right tenant, scope attestation and one pilot", () => {
    expect(evaluateSender(ready).ready_for_test).toBe(true);
    expect(evaluateSender({ ...ready, token: { ...ready.token!, roles: [] } }).ready_for_test).toBe(false);
    expect(evaluateSender({ ...ready, calendarClientId: "mail" }).ready_for_test).toBe(false);
    expect(evaluateSender({ ...ready, token: { ...ready.token!, tid: "other" } }).ready_for_test).toBe(false);
    expect(evaluateSender({ ...ready, pilotRecipients: ["a@x.no", "b@x.no"] }).ready_for_test).toBe(false);
    expect(evaluateSender({ ...ready, secrets: { ...ready.secrets, secret: false } }).ready_for_test).toBe(false);
  });
  it("broad mail permissions are flagged", () => {
    expect(state({ ...ready, token: { ...ready.token!, roles: ["Mail.Send", "Mail.ReadWrite"] } }, "least_privilege")).toBe("warning");
  });
  it("test send goes only to the caller as sole pilot with exact phrase", () => {
    const p = ["thomas.treffen@mcsservice.no"];
    expect(testSendGate(true, TEST_SEND_PHRASE, "Thomas.Treffen@mcsservice.no", p)).toBeNull();
    expect(testSendGate(true, "send", "thomas.treffen@mcsservice.no", p)).toBe("confirmation_required");
    expect(testSendGate(false, TEST_SEND_PHRASE, "thomas.treffen@mcsservice.no", p)).toBe("sender_not_ready");
    expect(testSendGate(true, TEST_SEND_PHRASE, "mats.lien.hansen@mcselektrotavler.no", p)).toBe("recipient_must_be_caller_and_only_pilot");
    expect(testSendGate(true, TEST_SEND_PHRASE, null, p)).toBe("recipient_must_be_caller_and_only_pilot");
  });
});
