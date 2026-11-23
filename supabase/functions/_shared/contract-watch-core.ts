// Pure rules for MCS AI Avtalevakt (phase 1: one mailbox, read-only). No I/O here.
export const PILOT_MAILBOX = "thomas.treffen@mcsservice.no";
export const OTHER_MAILBOX_PROBE = "postkontoret@mcsservice.no";
export const REQUIRED_SECRETS = ["AVTALEVAKT_TENANT_ID", "AVTALEVAKT_CLIENT_ID", "AVTALEVAKT_CLIENT_SECRET"] as const;

export function missingSecrets(env: (n: string) => string | undefined): string[] {
  return REQUIRED_SECRETS.filter((n) => !env(n));
}

/** Entra application roles that union with Exchange RBAC and would widen mailbox scope (kept in sync with m365-scope-proof). */
export const UNSCOPED_MAIL_ROLES = ["Mail.Send", "Mail.ReadWrite", "Mail.Read", "Mail.ReadBasic", "Mail.ReadBasic.All", "MailboxSettings.ReadWrite", "MailboxSettings.Read", "Calendars.ReadWrite", "Calendars.Read", "Contacts.ReadWrite", "Contacts.Read"];

/**
 * RBAC-only: Exchange RBAC for Applications grants never appear in the token, so the token must carry
 * NO Entra mail/mailbox/calendar/contacts role. Any such role unions with RBAC and is a failure.
 * Role check alone never proves scope: only the live positive 200 + negative 403 AccessDenied probes do.
 */
export function assessRoles(roles: string[]): { ok: boolean; extra: string[]; path: "exchange_rbac" } {
  const extra = roles.filter((r) => UNSCOPED_MAIL_ROLES.includes(r) || /^(Mail|MailboxSettings|Calendars|Contacts)\./.test(r));
  return { ok: extra.length === 0, extra, path: "exchange_rbac" };
}

/** Token must be issued by the configured tenant for the configured Avtalevakt app. */
export function assessTokenIdentity(claims: { tid?: string; appid?: string; azp?: string } | null, tenantId?: string, clientId?: string): { ok: boolean; reason?: "no_claims" | "tenant_mismatch" | "app_mismatch" } {
  if (!claims) return { ok: false, reason: "no_claims" };
  if (!tenantId || claims.tid?.toLowerCase() !== tenantId.trim().toLowerCase()) return { ok: false, reason: "tenant_mismatch" };
  const app = (claims.appid ?? claims.azp ?? "").toLowerCase();
  if (!clientId || app !== clientId.trim().toLowerCase()) return { ok: false, reason: "app_mismatch" };
  return { ok: true };
}

/** Negative probe passes only on 403 with an explicit access-denied Graph code. 404/unknown is never a pass. */
export function judgeNegativeProbe(status: number | null, errorCode: string | null): ProbeResult {
  if (status === 200) return "fail";
  if (status === 403 && (errorCode === "ErrorAccessDenied" || errorCode === "AccessDenied" || errorCode === "Authorization_RequestDenied")) return "pass";
  return "inconclusive";
}

/** The Avtalevakt app must never be the same identity as mail sender or calendar app. */
export function isSeparateIdentity(clientId: string | undefined, others: (string | undefined)[]): boolean {
  return !!clientId && others.filter(Boolean).every((o) => o !== clientId);
}

export type ProbeResult = "pass" | "fail" | "inconclusive";
/** Expected: own mailbox 200, other mailbox 403. 401/5xx/429 are inconclusive, never a pass. */
export function judgeProbe(expected: 200 | 403, status: number | null): ProbeResult {
  if (status === expected) return "pass";
  if (status === null || status === 401 || status === 429 || status >= 500) return "inconclusive";
  return "fail";
}

export function overall(results: ProbeResult[]): ProbeResult {
  if (results.includes("fail")) return "fail";
  if (results.includes("inconclusive")) return "inconclusive";
  return "pass";
}

/** Reading is allowed only when every gate is true. */
export function mayRead(s: { enabled: boolean; allowed_mailboxes: string[]; scope_verified_at: string | null; consent_at: string | null }, mailbox: string): boolean {
  return s.enabled && !!s.scope_verified_at && !!s.consent_at && s.allowed_mailboxes.map((m) => m.toLowerCase()).includes(mailbox.toLowerCase());
}

export type ConfidenceClass = "uncertain" | "check" | "likely";
export function confidenceClass(confidence: number, dateCertain: boolean): ConfidenceClass {
  if (confidence < 0.6) return "uncertain";
  if (confidence > 0.85 && dateCertain) return "likely";
  return "check";
}

/** Only these may notify Thomas; uncertain items are silent. */
export function shouldNotify(c: ConfidenceClass, coverage: Coverage, isTest: boolean): boolean {
  return !isTest && c !== "uncertain" && coverage !== "covered";
}

export function dedupeKey(p: { conversationId?: string | null; customerId?: string | null; date?: string | null; task?: string | null }): string {
  const norm = (s?: string | null) => (s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
  return [p.conversationId ?? "-", p.customerId ?? "-", p.date ?? "nodate", norm(p.task).split(" ").slice(0, 4).join(" ")].join("|");
}

export type Coverage = "covered" | "partial" | "missing" | "conflict";
export interface PlanJob { date: string; technicianCount: number; techniciansBusy?: boolean }
/** Compare a promise against Resource Plan jobs for the same customer (±1 day). Resource Plan is authoritative. */
export function classifyCoverage(promise: { date: string; technicians?: number | null }, jobs: PlanJob[]): Coverage {
  const day = (d: string) => Date.parse(`${d}T12:00:00Z`) / 86400000;
  const near = jobs.filter((j) => Math.abs(day(j.date) - day(promise.date)) <= 1);
  if (near.length === 0) return "missing";
  const exact = near.find((j) => j.date === promise.date);
  if (exact?.techniciansBusy) return "conflict";
  if (!exact || exact.technicianCount === 0 || (promise.technicians ?? 0) > exact.technicianCount) return "partial";
  return "covered";
}

/** Pre-AI filter: skip auto-replies, newsletters, system notices and mail without a customer hit. */
export function prefilter(m: { from: string; subject: string; headers?: Record<string, string>; customerHit: boolean }): { process: boolean; reason?: string } {
  const h = Object.fromEntries(Object.entries(m.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v.toLowerCase()]));
  if (h["auto-submitted"] && h["auto-submitted"] !== "no") return { process: false, reason: "auto_reply" };
  if (h["list-unsubscribe"] || h["precedence"] === "bulk" || h["precedence"] === "list") return { process: false, reason: "newsletter" };
  if (/^(no-?reply|noreply|mailer-daemon|postmaster)@/i.test(m.from)) return { process: false, reason: "system" };
  if (/^(automatisk svar|automatic reply|out of office|fraværende)/i.test(m.subject)) return { process: false, reason: "auto_reply" };
  if (!m.customerHit) return { process: false, reason: "no_customer" };
  return { process: true };
}

/** Excerpt is capped at 500 chars; full bodies are never stored. */
export function excerpt(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 500);
}

/** Resolve a weekday mention relative to the send time in Europe/Oslo. Returns null if unclear (never guess). */
const WD: Record<string, number> = { mandag: 1, tirsdag: 2, onsdag: 3, torsdag: 4, fredag: 5, lørdag: 6, søndag: 0 };
/** Resolves the first coming weekday (never today) relative to send time in Oslo. "Neste <dag>" is ambiguous → null. */
export function resolveWeekday(word: string, sentAtIso: string, qualifier?: "neste"): string | null {
  const target = WD[word.toLowerCase()];
  if (target === undefined || qualifier === "neste") return null;
  const osloDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date(sentAtIso));
  const base = new Date(`${osloDate}T12:00:00Z`);
  const diff = ((target - base.getUTCDay() + 7) % 7) || 7;
  base.setUTCDate(base.getUTCDate() + diff);
  return base.toISOString().slice(0, 10);
}

// ---- Order drafts (phase 1: internal draft only, never a real order/job) ----
export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/heic", "image/webp"];
export type AttachmentDecision = "reference_only" | "rejected_type" | "rejected_size" | "rejected_inline";
/** Attachments stay as Graph references; files are fetched/stored only after explicit confirmation and a scan. */
export function attachmentDecision(a: { contentType: string; size: number; isInline?: boolean; name: string }): AttachmentDecision {
  if (a.isInline && a.size < 20 * 1024) return "rejected_inline"; // signatures/logos
  if (!ALLOWED_MIME.includes(a.contentType.toLowerCase()) || /\.(exe|js|bat|cmd|scr|zip|docm|xlsm)$/i.test(a.name)) return "rejected_type";
  if (a.size > ATTACHMENT_MAX_BYTES) return "rejected_size";
  return "reference_only";
}

/** Simple sensitive-content signal: Norwegian national ID, card-like numbers, health words. Flags, never stores. */
export function looksSensitive(text: string): boolean {
  return /\b\d{6}\s?\d{5}\b/.test(text) || /\b(?:\d[ -]?){13,16}\b/.test(text) || /\b(sykemeld|diagnose|helseopplysning)/i.test(text);
}

/** Draft fields from a commitment: date/time only when explicit; type defaults to service order. */
export function draftFromCommitment(c: { excerpt: string | null; promised_date: string | null; promised_time: string | null; date_certain: boolean; technicians?: number | null; estimatedDays?: number | null }) {
  const project = (c.estimatedDays ?? 0) > 3 || (c.technicians ?? 0) > 3;
  return {
    suggested_type: project ? "project" as const : "service_order" as const,
    agreed_date: c.date_certain ? c.promised_date : null,
    agreed_time: c.date_certain ? c.promised_time : null,
    description: c.excerpt ?? "",
    sensitive_flag: looksSensitive(c.excerpt ?? ""),
  };
}

/** A draft is "ready for check" only with customer, description and a work site. Readiness never creates an order. */
export function draftMissing(d: { customer_id: string | null; description: string | null; work_site: string | null }): string[] {
  const m: string[] = [];
  if (!d.customer_id) m.push("Kunde");
  if (!d.work_site?.trim()) m.push("Arbeidssted");
  if (!d.description?.trim()) m.push("Arbeidsbeskrivelse");
  return m;
}
