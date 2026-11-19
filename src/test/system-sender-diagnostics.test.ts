import { describe, it, expect } from "vitest";
import { evaluateSender, testSendGate, TEST_SEND_PHRASE, type SenderFacts } from "../../supabase/functions/_shared/system-sender-diagnostics-core";
const tok = (roles: string[]) => ({ ok: true, tid: "t", appId: "mail", roles });
const base: SenderFacts = { secrets: { tenant: true, client: true, secret: true }, calendarClientId: "cal", mode: "", scopeVerified: "", pilotRecipients: ["thomas.treffen@mcsservice.no"], token: tok(["Mail.Send"]), tenantId: "t", mailClientId: "mail" };
const att = (o: Record<string, string> = {}) => JSON.stringify({ positive_at: "2026-11-19", negative_at: "2026-11-19", mailbox: "postkontoret@mcsservice.no", negative_mailbox: "thomas.treffen@mcsservice.no", unscoped_entra_grants: "none", ...o });
const rbac: SenderFacts = { ...base, token: tok([]), rbacAttestation: att() };
const ev = (f: SenderFacts) => evaluateSender(f);
const st = (f: SenderFacts, k: string) => ev(f).checks.find(c => c.key === k)?.state;
describe("system sender readiness", () => {
  it("classic Entra: ready only with Mail.Send + scope verified + one pilot", () => {
    expect(ev({ ...base, scopeVerified: "true" }).auth_path).toBe("classic");
    expect(ev({ ...base, scopeVerified: "true" }).ready_for_test).toBe(true);
    expect(ev(base).ready_for_test).toBe(false);
    expect(ev({ ...base, scopeVerified: "true", calendarClientId: "mail" }).ready_for_test).toBe(false);
    expect(ev({ ...base, scopeVerified: "true", token: { ...tok(["Mail.Send"]), tid: "x" } }).ready_for_test).toBe(false);
  });
  it("RBAC token without Mail.Send and no attestation: expected absence, access not proven, not ready", () => {
    const f = { ...base, token: tok([]) };
    expect(ev(f).auth_path).toBe("exchange_rbac");
    expect(st(f, "mail_send")).toBe("ok");
    expect(st(f, "rbac_attestation")).toBe("manual");
    expect(ev(f).ready_for_test).toBe(false);
  });
  it("RBAC with full positive+negative attestation and no unscoped grants is ready", () => {
    expect(ev(rbac).ready_for_test).toBe(true);
  });
  it("unscoped Entra Calendars.ReadWrite/Mail.ReadWrite in token blocks even with attestation", () => {
    const f = { ...rbac, token: tok(["Calendars.ReadWrite", "Mail.ReadWrite"]) };
    expect(st(f, "unscoped_entra")).toBe("missing");
    expect(ev(f).unscoped_grants).toEqual(["Calendars.ReadWrite", "Mail.ReadWrite"]);
    expect(ev(f).ready_for_test).toBe(false);
  });
  it("unscoped Entra Mail.Send alongside RBAC attestation blocks (union defeats scope)", () => {
    expect(ev({ ...rbac, token: tok(["Mail.Send"]) }).ready_for_test).toBe(false);
  });
  it("wrong sender, missing negative test, unconfirmed grants or malformed attestation block", () => {
    expect(ev({ ...rbac, rbacAttestation: att({ mailbox: "thomas.treffen@mcsservice.no" }) }).ready_for_test).toBe(false);
    expect(ev({ ...rbac, rbacAttestation: att({ negative_mailbox: "postkontoret@mcsservice.no" }) }).ready_for_test).toBe(false);
    expect(ev({ ...rbac, rbacAttestation: att({ unscoped_entra_grants: "unknown" }) }).ready_for_test).toBe(false);
    expect(ev({ ...rbac, rbacAttestation: "{bad" }).ready_for_test).toBe(false);
    expect(st({ ...rbac, rbacAttestation: "{bad" }, "rbac_attestation")).toBe("missing");
  });
  it("no pilot recipient blocks", () => {
    expect(ev({ ...rbac, pilotRecipients: [] }).ready_for_test).toBe(false);
    expect(ev({ ...rbac, pilotRecipients: ["a@x.no", "b@x.no"] }).ready_for_test).toBe(false);
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
