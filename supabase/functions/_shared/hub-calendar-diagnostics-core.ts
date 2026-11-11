// Pure core for the READ-ONLY central calendar app connection test (no imports, unit-testable).
// Only fixed GET targets; never returns tokens, secrets, ids or calendar/mail content.

export const TEST_MAILBOX = "test-kalender@mcsservice.no";
/** Known mailbox OUTSIDE the ApplicationAccessPolicy group (Exchange test: Denied). */
export const OUT_OF_SCOPE_MAILBOX = "simen.kjeksli@mcselektrotavler.no";

export type CheckId = "token" | "app_identity" | "app_roles" | "test_calendar" | "out_of_scope_calendar" | "mail_blocked";
export type CheckResult = "pass" | "fail" | "inconclusive";

export interface DiagnosticCheck {
  id: CheckId;
  label: string;
  expected: string;
  result: CheckResult;
  httpStatus?: number;
  graphCode?: string;
  explanation: string;
}

export interface GraphProbe {
  id: "test_calendar" | "out_of_scope_calendar" | "mail_blocked";
  path: string;
  expectStatus: 200 | 403;
}

/** The only Graph requests this test may ever make. All GET, all metadata-only ($select=id). */
export const PROBES: GraphProbe[] = [
  { id: "test_calendar", path: `/v1.0/users/${encodeURIComponent(TEST_MAILBOX)}/calendar?$select=id`, expectStatus: 200 },
  { id: "out_of_scope_calendar", path: `/v1.0/users/${encodeURIComponent(OUT_OF_SCOPE_MAILBOX)}/calendar?$select=id`, expectStatus: 403 },
  { id: "mail_blocked", path: `/v1.0/users/${encodeURIComponent(TEST_MAILBOX)}/mailFolders/inbox?$select=id`, expectStatus: 403 },
];

export const REQUIRED_SECRETS = ["HUB_CALENDAR_TENANT_ID", "HUB_CALENDAR_CLIENT_ID", "HUB_CALENDAR_CLIENT_SECRET"] as const;

export function missingSecrets(env: (name: string) => string | undefined): string[] {
  return REQUIRED_SECRETS.filter((n) => !env(n)?.trim());
}

/** Role names from an app-only access token payload. Signature is not verified here – only used for reporting. */
export function tokenRoles(accessToken: string): { roles: string[]; appId: string | null } {
  try {
    const part = accessToken.split(".")[1] ?? "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const payload = JSON.parse(atob(b64));
    return { roles: Array.isArray(payload.roles) ? payload.roles.map(String).sort() : [], appId: payload.appid ?? payload.azp ?? null };
  } catch {
    return { roles: [], appId: null };
  }
}

const FORBIDDEN_ROLE = /^(Mail\.|MailboxSettings\.|Directory\.|User\.ReadWrite|Application\.|RoleManagement\.|Group\.ReadWrite|Sites\.|Files\.)/i;

export function assessRoles(roles: string[]): DiagnosticCheck {
  const forbidden = roles.filter((r) => FORBIDDEN_ROLE.test(r));
  const hasCalendar = roles.some((r) => /^Calendars\.(ReadWrite|Read)$/i.test(r));
  if (forbidden.length) {
    return { id: "app_roles", label: "Apptillatelser", expected: "Kun kalender", result: "fail", explanation: `Appen har tillatelser utover kalender: ${forbidden.join(", ")}. Må fjernes før pilot.` };
  }
  if (!hasCalendar) {
    return { id: "app_roles", label: "Apptillatelser", expected: "Kun kalender", result: "fail", explanation: "Tokenet har ingen kalendertillatelse. Admin-samtykke (Grant admin consent) mangler eller er ikke ferdig spredt." };
  }
  return { id: "app_roles", label: "Apptillatelser", expected: "Kun kalender", result: "pass", explanation: `Kun kalendertillatelse: ${roles.join(", ")}.` };
}

export function assessIdentity(calendarClientId: string, mailClientId: string | undefined, tokenAppId: string | null): DiagnosticCheck {
  const base = { id: "app_identity" as const, label: "Egen app-identitet", expected: "Separat fra e-postappen" };
  if (mailClientId && calendarClientId.trim() === mailClientId.trim()) {
    return { ...base, result: "fail", explanation: "Kalenderappen bruker samme app som e-post/Postkontoret. Må være en egen app." };
  }
  if (tokenAppId && tokenAppId !== calendarClientId.trim()) {
    return { ...base, result: "fail", explanation: "Tokenet tilhører en annen app enn den som er lagret som kalenderapp." };
  }
  return { ...base, result: "pass", explanation: "Egen kalenderapp, adskilt fra e-postappen." };
}

/** Map an AADSTS token error code to an operator explanation. */
export function explainTokenError(httpStatus: number, aadsts: string | null): DiagnosticCheck {
  const map: Record<string, string> = {
    AADSTS7000215: "Ugyldig klienthemmelighet. Lag en ny hemmelighet i Entra og lagre den på nytt i Hub.",
    AADSTS7000222: "Klienthemmeligheten er utløpt. Lag en ny og lagre den på nytt i Hub.",
    AADSTS700016: "Fant ikke appen i denne tenanten. Kontroller app-ID og tenant-ID.",
    AADSTS90002: "Fant ikke tenanten. Kontroller tenant-ID.",
    AADSTS900023: "Tenant-ID har feil format.",
  };
  return {
    id: "token", label: "Innlogging for appen", expected: "Token mottatt", result: "fail", httpStatus, graphCode: aadsts ?? undefined,
    explanation: (aadsts && map[aadsts]) ?? `Microsoft avviste innloggingen (${aadsts ?? httpStatus}).`,
  };
}

const PROBE_TEXT: Record<GraphProbe["id"], { label: string; expected: string; ok: string; bad: string }> = {
  test_calendar: { label: "Testkalender (tillatt)", expected: "200 – tilgang", ok: "Appen kan lese kalenderinformasjon for testpostkassen.", bad: "" },
  out_of_scope_calendar: { label: "Kalender utenfor gruppen", expected: "403 – nektet", ok: "Tilgangsbegrensningen virker: appen nektes utenfor godkjent gruppe.", bad: "KRITISK: appen fikk tilgang til en kalender utenfor godkjent gruppe. Tilgangsbegrensningen virker ikke." },
  mail_blocked: { label: "E-post (skal være stengt)", expected: "403 – nektet", ok: "Appen har ikke tilgang til e-post.", bad: "KRITISK: appen kan lese e-post. Fjern e-posttillatelser før pilot." },
};

export function assessProbe(probe: GraphProbe, httpStatus: number, graphCode: string | null): DiagnosticCheck {
  const t = PROBE_TEXT[probe.id];
  const base = { id: probe.id, label: t.label, expected: t.expected, httpStatus, graphCode: graphCode ?? undefined };
  if (httpStatus === probe.expectStatus) return { ...base, result: "pass", explanation: t.ok };
  if (probe.expectStatus === 403 && httpStatus >= 200 && httpStatus < 300) return { ...base, result: "fail", explanation: t.bad };
  if (probe.id === "test_calendar") {
    if (httpStatus === 403) return { ...base, result: "inconclusive", explanation: "Nektet på testpostkassen. Vanlig rett etter endring av tilgangsbegrensning/samtykke (kan ta opptil ca. 1 time, av og til lenger). Prøv igjen senere; vedvarer det, kontroller at testpostkassen er med i gruppen." };
    if (httpStatus === 404) return { ...base, result: "inconclusive", explanation: graphCode === "MailboxNotEnabledForRESTAPI" ? "Testpostkassen har ingen aktiv Exchange-postkasse (lisens mangler eller er nylig tildelt)." : "Fant ikke testpostkassen i Microsoft." };
    if (httpStatus === 401) return { ...base, result: "fail", explanation: "Microsoft godtok ikke tokenet for kalender. Admin-samtykke mangler." };
  }
  if (httpStatus === 404) return { ...base, result: "inconclusive", explanation: "Postkassen ble ikke funnet, så testen sier ingenting om tilgangsbegrensningen." };
  if (httpStatus === 429 || httpStatus >= 500) return { ...base, result: "inconclusive", explanation: "Microsoft svarte midlertidig feil. Prøv igjen senere." };
  return { ...base, result: "inconclusive", explanation: `Uventet svar (${httpStatus}${graphCode ? ` ${graphCode}` : ""}).` };
}

export function overallResult(checks: DiagnosticCheck[]): "pass" | "fail" | "inconclusive" {
  if (checks.some((c) => c.result === "fail")) return "fail";
  if (checks.some((c) => c.result === "inconclusive")) return "inconclusive";
  return "pass";
}

/** Guard: the diagnostic fetch may only ever issue GET to one of the fixed probe paths. */
export function assertReadOnlyProbe(method: string, path: string): void {
  if (method !== "GET") throw new Error("diagnostic_write_blocked");
  if (!PROBES.some((p) => p.path === path)) throw new Error("diagnostic_path_blocked");
}
