// Pure readiness evaluation for the central system sender (postkontoret). No values leave this module.
import { SYSTEM_MAILBOX } from "./m365-sender.ts";

export const TEST_SEND_PHRASE = "SEND ÉN TESTMELDING TIL MEG";
export interface SenderFacts {
  secrets: { tenant: boolean; client: boolean; secret: boolean };
  calendarClientId: string | null;
  mode: string; scopeVerified: string; pilotRecipients: string[];
  token: { ok: boolean; http?: number | null; tid?: string | null; appId?: string | null; roles: string[] } | null;
  tenantId: string | null; mailClientId: string | null;
}
export type CheckState = "ok" | "missing" | "warning" | "manual";
export interface SenderCheck { key: string; state: CheckState; label: string; action?: string }
const BROAD = ["Mail.ReadWrite", "Mail.ReadBasic.All", "MailboxSettings.ReadWrite", "Directory.ReadWrite.All", "User.ReadWrite.All", "Calendars.ReadWrite"];
export function evaluateSender(f: SenderFacts): { checks: SenderCheck[]; ready_for_test: boolean; mode_on: boolean; mailbox: string } {
  const c: SenderCheck[] = [];
  const secretsOk = f.secrets.tenant && f.secrets.client && f.secrets.secret;
  c.push({ key: "secrets", state: secretsOk ? "ok" : "missing", label: "Innlogging for e-postappen er lagt inn", action: secretsOk ? undefined : "Legg inn manglende AZURE_*-hemmeligheter." });
  const separate = !!f.mailClientId && !!f.calendarClientId && f.mailClientId !== f.calendarClientId;
  c.push({ key: "separate_identity", state: separate ? "ok" : "missing", label: "E-postappen er en annen app enn kalenderappen", action: separate ? undefined : "Bruk separate app-registreringer for e-post og kalender." });
  const tokenOk = !!f.token?.ok && f.token.tid === f.tenantId && f.token.appId === f.mailClientId;
  c.push({ key: "token", state: tokenOk ? "ok" : "missing", label: "Microsoft utsteder app-token for riktig tenant og app", action: tokenOk ? undefined : "Kontroller hemmelighet/utløp i Entra (Simen)." });
  const roles = f.token?.roles ?? [];
  c.push({ key: "mail_send", state: roles.includes("Mail.Send") ? "ok" : "missing", label: "Applikasjonstillatelsen Mail.Send er gitt med admin-samtykke", action: roles.includes("Mail.Send") ? undefined : "Simen: gi Mail.Send (Application) + admin consent." });
  const broad = roles.filter(r => BROAD.includes(r));
  c.push({ key: "least_privilege", state: broad.length ? "warning" : "ok", label: broad.length ? `Appen har bredere tillatelser: ${broad.join(", ")}` : "Ingen unødvendig brede skrivetillatelser" , action: broad.length ? "Vurder egen app kun med Mail.Send for utsending." : undefined });
  const scoped = f.scopeVerified === "true";
  c.push({ key: "mailbox_scope", state: scoped ? "ok" : "manual", label: `Appen kan bare sende som ${SYSTEM_MAILBOX} (Exchange-tilgangsbegrensning)`, action: scoped ? undefined : "Simen: RBAC for Applications/ApplicationAccessPolicy begrenset til postkontoret; bekreft med Test-ServicePrincipalAuthorization før M365_MAILBOX_SCOPE_VERIFIED settes." });
  const pilotOk = f.pilotRecipients.length === 1;
  c.push({ key: "pilot", state: pilotOk ? "ok" : f.pilotRecipients.length ? "warning" : "missing", label: `Pilotmottakere: ${f.pilotRecipients.length}`, action: pilotOk ? undefined : "Kun én mottaker (Thomas) i M365_PILOT_RECIPIENTS for første test." });
  const modeOn = f.mode.trim().toLowerCase() === "postkontoret";
  c.push({ key: "mode", state: modeOn ? "warning" : "ok", label: modeOn ? "Systemavsender er PÅ for alle utsendinger i piloten" : "Systemavsender er av (gammel vei brukes)" });
  const ready = secretsOk && separate && tokenOk && roles.includes("Mail.Send") && scoped && pilotOk;
  return { checks: c, ready_for_test: ready, mode_on: modeOn, mailbox: SYSTEM_MAILBOX };
}
/** Test send needs readiness, the exact phrase and a recipient that is the caller and the single pilot recipient. */
export function testSendGate(ready: boolean, phrase: string, callerEmail: string | null, pilot: string[]): string | null {
  if (phrase !== TEST_SEND_PHRASE) return "confirmation_required";
  if (!ready) return "sender_not_ready";
  const me = (callerEmail ?? "").trim().toLowerCase();
  if (!me || pilot.length !== 1 || pilot[0] !== me) return "recipient_must_be_caller_and_only_pilot";
  return null;
}
