import { describe, it, expect } from "vitest";
import {
  PROBES, missingSecrets, assessProbe, assessRoles, assessIdentity, overallResult,
  assertReadOnlyProbe, tokenRoles, explainTokenError, TEST_MAILBOX,
} from "../../supabase/functions/_shared/hub-calendar-diagnostics-core";

const probe = (id: string) => PROBES.find((p) => p.id === id)!;
const fakeToken = (payload: object) => `x.${btoa(JSON.stringify(payload)).replace(/=+$/, "")}.y`;

describe("hub calendar diagnostics – read-only connection test", () => {
  it("is inactive unless all three HUB_CALENDAR_* secrets exist (no fallback to AZURE_*)", () => {
    const env = (n: string) => ({ AZURE_TENANT_ID: "t", HUB_CALENDAR_CLIENT_ID: "c" } as Record<string, string>)[n];
    expect(missingSecrets(env)).toEqual(["HUB_CALENDAR_TENANT_ID", "HUB_CALENDAR_CLIENT_SECRET"]);
  });

  it("only GET metadata probes are allowed; any write or other path is blocked", () => {
    expect(PROBES.every((p) => p.path.includes("$select=id"))).toBe(true);
    expect(PROBES.find((p) => p.expectStatus === 200)!.path).toContain(encodeURIComponent(TEST_MAILBOX));
    for (const m of ["POST", "PATCH", "DELETE", "PUT"]) expect(() => assertReadOnlyProbe(m, PROBES[0].path)).toThrow("diagnostic_write_blocked");
    expect(() => assertReadOnlyProbe("GET", "/v1.0/users/x/events")).toThrow("diagnostic_path_blocked");
  });

  it("expected outcomes: test calendar 200, out-of-scope 403, mail 403 → pass", () => {
    const checks = [
      assessProbe(probe("test_calendar"), 200, null),
      assessProbe(probe("out_of_scope_calendar"), 403, "ErrorAccessDenied"),
      assessProbe(probe("mail_blocked"), 403, "ErrorAccessDenied"),
    ];
    expect(checks.map((c) => c.result)).toEqual(["pass", "pass", "pass"]);
    expect(overallResult(checks)).toBe("pass");
  });

  it("access outside the group or to mail is a hard fail", () => {
    expect(assessProbe(probe("out_of_scope_calendar"), 200, null).result).toBe("fail");
    expect(assessProbe(probe("mail_blocked"), 200, null).result).toBe("fail");
  });

  it("403 on the test mailbox is inconclusive (propagation), 404 without mailbox explains licence", () => {
    expect(assessProbe(probe("test_calendar"), 403, "ErrorAccessDenied").result).toBe("inconclusive");
    const r = assessProbe(probe("test_calendar"), 404, "MailboxNotEnabledForRESTAPI");
    expect(r.result).toBe("inconclusive");
    expect(r.explanation).toContain("lisens");
  });

  it("app roles: only calendar passes; Mail.* fails; none fails", () => {
    expect(assessRoles(["Calendars.ReadWrite"]).result).toBe("pass");
    expect(assessRoles(["Calendars.ReadWrite", "Mail.Send"]).result).toBe("fail");
    expect(assessRoles([]).result).toBe("fail");
  });

  it("calendar app must be a separate identity from the mail app", () => {
    expect(assessIdentity("cal-app", "mail-app", "cal-app").result).toBe("pass");
    expect(assessIdentity("same", "same", "same").result).toBe("fail");
    expect(assessIdentity("cal-app", "mail-app", "other").result).toBe("fail");
  });

  it("reads role names from token payload without exposing anything else", () => {
    expect(tokenRoles(fakeToken({ roles: ["Calendars.ReadWrite"], appid: "a" }))).toEqual({ roles: ["Calendars.ReadWrite"], appId: "a" });
    expect(tokenRoles("garbage").roles).toEqual([]);
  });

  it("invalid client secret gives a clear rotate instruction", () => {
    expect(explainTokenError(401, "AADSTS7000215").explanation).toContain("Ugyldig klienthemmelighet");
  });
});
