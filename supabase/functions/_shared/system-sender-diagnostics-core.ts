// Pure readiness evaluation for the central system sender (postkontoret). No values leave this module.
// Two authorization paths:
//  - classic: Entra application grant Mail.Send in the token + ApplicationAccessPolicy (legacy).
//  - exchange_rbac: Exchange RBAC for Applications (scoped). Entra Mail.Send is then EXPECTED to be absent;
//    a token cannot prove Exchange access, so readiness requires a recorded admin attestation of a positive AND
//    negative Test-ServicePrincipalAuthorization plus confirmation that no unscoped Entra mail/calendar grants exist.
//    Any unscoped Entra Mail.*/Calendars.* grant in the token unions with RBAC and defeats the scope -> blocks.
import { SYSTEM_MAILBOX, UNSCOPED_RISK, parseAttestation, proveSendScope } from "./m365-scope-proof.ts";
export { parseAttestation, UNSCOPED_RISK };

export const TEST_SEND_PHRASE = "SEND ÉN TESTMELDING TIL MEG";
export interface SenderFacts {
  secrets: { tenant: boolean; client: boolean; secret: boolean };
  calendarClientId: string | null;
  mode: string; scopeVerified: string; pilotRecipients: string[];
  token: { ok: boolean; http?: number | null; tid?: string | null; appId?: string | null; roles: string[] } | null;
  tenantId: string | null; mailClientId: string | null;
  /** Raw M365_RBAC_ATTESTATION value (JSON). Empty = pending. */
  rbacAttestation?: string;
  now?: number;
}
export type CheckState = "ok" | "missing" | "warning" | "manual";
export interface SenderCheck { key: string; state: CheckState; label: string; action?: string }
export type AuthPath = "classic" | "exchange_rbac";
const BROAD_OTHER = ["Directory.ReadWrite.All", "User.ReadWrite.All"];

export function evaluateSender(f: SenderFacts): { checks: SenderCheck[]; ready_for_test: boolean; mode_on: boolean; mailbox: string; auth_path: AuthPath; unscoped_grants: string[] } {
  const c: SenderCheck[] = [];
  const secretsOk = f.secrets.tenant && f.secrets.client && f.secrets.secret;
  c.push({ key: "secrets", state: secretsOk ? "ok" : "missing", label: "Innlogging for e-postappen er lagt inn", action: secretsOk ? undefined : "Legg inn manglende AZURE_*-hemmeligheter." });
  const separate = !!f.mailClientId && !!f.calendarClientId && f.mailClientId !== f.calendarClientId;
  c.push({ key: "separate_identity", state: separate ? "ok" : "missing", label: "E-postappen er en annen app enn kalenderappen", action: separate ? undefined : "Bruk separate app-registreringer for e-post og kalender." });
  const tokenOk = !!f.token?.ok && f.token.tid === f.tenantId && f.token.appId === f.mailClientId;
  c.push({ key: "token", state: tokenOk ? "ok" : "missing", label: "Microsoft utsteder app-token for riktig tenant og app", action: tokenOk ? undefined : "Kontroller hemmelighet/utløp i Entra (Simen)." });
  const roles = f.token?.roles ?? [];
  const hasEntraSend = roles.includes("Mail.Send");
  const att = parseAttestation(f.rbacAttestation);
  // RBAC path when an attestation exists, or when the token lacks Entra Mail.Send (expected under RBAC).
  const path: AuthPath = att.value || (f.rbacAttestation?.trim()) || !hasEntraSend ? "exchange_rbac" : "classic";
  const unscoped = roles.filter(r => UNSCOPED_RISK.includes(r));
  const pilotOk = f.pilotRecipients.length === 1;
  let authorized = false;

  if (path === "classic") {
    c.push({ key: "mail_send", state: "ok", label: "Entra-tillatelsen Mail.Send (Application) er gitt med admin-samtykke" });
    const scoped = f.scopeVerified === "true";
    c.push({ key: "mailbox_scope", state: scoped ? "ok" : "manual", label: `Appen kan bare sende som ${SYSTEM_MAILBOX} (ApplicationAccessPolicy)`, action: scoped ? undefined : "Simen: bekreft begrensning med Test-ApplicationAccessPolicy før M365_MAILBOX_SCOPE_VERIFIED settes." });
    const broad = roles.filter(r => r !== "Mail.Send" && (UNSCOPED_RISK.includes(r) || BROAD_OTHER.includes(r)));
    c.push({ key: "least_privilege", state: broad.length ? "warning" : "ok", label: broad.length ? `Appen har bredere tillatelser: ${broad.join(", ")}` : "Ingen unødvendig brede tillatelser", action: broad.length ? "Vurder egen app kun med Mail.Send for utsending." : undefined });
    authorized = hasEntraSend && scoped;
  } else {
    c.push({ key: "mail_send", state: "ok", label: "Entra Mail.Send mangler i token – forventet ved Exchange RBAC for Applications (ikke en feil)" });
    // Unscoped Entra mail/calendar grants union with RBAC and remove the effective mailbox scope.
    c.push({ key: "unscoped_entra", state: unscoped.length ? "missing" : "ok",
      label: unscoped.length ? `Uavgrensede Entra-tillatelser i token: ${unscoped.join(", ")} – opphever Exchange-avgrensningen (reell risiko)` : "Ingen uavgrensede Entra e-post-/kalendertillatelser i token",
      action: unscoped.length ? "Simen: fjern disse Entra API-tillatelsene (Application) fra app-registreringen, eller bekreft at de ikke er gitt; behold kun Exchange RBAC-rollene. Hub fjerner ingenting." : undefined });
    const broad = roles.filter(r => BROAD_OTHER.includes(r));
    if (broad.length) c.push({ key: "least_privilege", state: "warning", label: `Appen har brede katalogtillatelser: ${broad.join(", ")}` });
    const a = att.value;
    if (!a) {
      c.push({ key: "rbac_attestation", state: att.error ? "missing" : "manual", label: att.error ? "RBAC-attestasjonen er ugyldig formatert" : "Exchange RBAC-tilgang er ikke bevist – attestasjon venter",
        action: `Simen: kjør Test-ServicePrincipalAuthorization positivt mot ${SYSTEM_MAILBOX} (Mail.Send InScope=True) og negativt mot en annen postkasse (Mail.Send InScope=False). Resultatet registreres deretter som M365_RBAC_ATTESTATION.` });
    } else {
      const mbOk = a.mailbox === SYSTEM_MAILBOX.toLowerCase();
      const negOk = !!a.negative_mailbox && a.negative_mailbox !== a.mailbox;
      const grantsNone = a.unscoped_entra_grants.trim().toLowerCase() === "none";
      c.push({ key: "rbac_positive", state: mbOk ? "ok" : "missing", label: mbOk ? `Positiv test bekreftet for ${SYSTEM_MAILBOX} (${a.positive_at})` : "Positiv test gjelder feil avsender", action: mbOk ? undefined : `Testen må gjelde ${SYSTEM_MAILBOX}.` });
      c.push({ key: "rbac_negative", state: negOk ? "ok" : "missing", label: negOk ? `Negativ test bekreftet mot annen postkasse (${a.negative_at})` : "Negativ test mangler eller gjelder samme postkasse" });
      c.push({ key: "rbac_unscoped_checked", state: grantsNone ? "ok" : "missing", label: grantsNone ? "Simen har bekreftet ingen uavgrensede Entra-tillatelser" : "Uavgrensede Entra-tillatelser er ikke avkreftet" });
      authorized = mbOk && negOk && grantsNone && unscoped.length === 0;
    }
  }
  c.push({ key: "pilot", state: pilotOk ? "ok" : f.pilotRecipients.length ? "warning" : "missing", label: `Pilotmottakere: ${f.pilotRecipients.length}`, action: pilotOk ? undefined : "Kun én mottaker (Thomas) i M365_PILOT_RECIPIENTS for første test." });
  const modeOn = f.mode.trim().toLowerCase() === "postkontoret";
  c.push({ key: "mode", state: modeOn ? "warning" : "ok", label: modeOn ? "Systemavsender er PÅ for alle utsendinger i piloten" : "Systemavsender er av (gammel vei brukes)" });
  // Same server proof as every real system send (sendMail), incl. attestation TTL and identity binding.
  const proof = proveSendScope((k) => ({ AZURE_TENANT_ID: f.tenantId ?? "", AZURE_CLIENT_ID: f.mailClientId ?? "", M365_MAILBOX_SCOPE_VERIFIED: f.scopeVerified, M365_RBAC_ATTESTATION: f.rbacAttestation ?? "" } as Record<string, string>)[k], f.token?.ok ? { tid: f.token.tid ?? null, appId: f.token.appId ?? null, roles } : null, f.now);
  if (!proof.ok && authorized) c.push({ key: "scope_proof", state: "missing", label: `Serverkontrollen avviser avsenderbeviset (${proof.reason})`, action: proof.reason === "rbac_attestation_expired" ? `Simen: kjør begge Test-ServicePrincipalAuthorization på nytt (bevis gjelder ${90} dager).` : undefined });
  const ready = secretsOk && separate && tokenOk && authorized && proof.ok && pilotOk;
  return { checks: c, ready_for_test: ready, mode_on: modeOn, mailbox: SYSTEM_MAILBOX, auth_path: path, unscoped_grants: unscoped };
}
/** Test send needs readiness, the exact phrase and a recipient that is the caller and the single pilot recipient. */
export function testSendGate(ready: boolean, phrase: string, callerEmail: string | null, pilot: string[]): string | null {
  if (phrase !== TEST_SEND_PHRASE) return "confirmation_required";
  if (!ready) return "sender_not_ready";
  const me = (callerEmail ?? "").trim().toLowerCase();
  if (!me || pilot.length !== 1 || pilot[0] !== me) return "recipient_must_be_caller_and_only_pilot";
  return null;
}
