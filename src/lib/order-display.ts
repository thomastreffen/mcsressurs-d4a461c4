/* Shared helpers for displaying order submissions consistently
   across customer tracking page and internal admin list. */

type AnyRec = Record<string, any> | null | undefined;

const SITE_KEYS = [
  "oppdragssted",
  "oppdrags_sted",
  "site_name",
  "project_name",
  "prosjekt",
  "prosjektnavn",
  "anlegg",
  "anleggsnavn",
  "facility_name",
  "oppdragstittel",
  "tittel",
];

const ADDRESS_KEYS = [
  "adresse",
  "address",
  "street_address",
  "anleggsadresse",
  "besoksadresse",
  "besøksadresse",
];

const POSTAL_KEYS = ["poststed", "postal_city", "postnummer", "postcode", "zip"];

const COMPANY_KEYS = ["firmanavn", "firma", "kundenavn", "kunde", "company_name"];

const CONTACT_KEYS = ["bestiller_navn", "kontaktperson_kunde", "kontaktperson", "contact_name"];

function pick(rec: AnyRec, keys: string[]): string | null {
  if (!rec) return null;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Best site/facility/project title from a submission. */
export function getSubmissionSiteTitle(submission: any): string | null {
  if (!submission) return null;
  // Direct fields (e.g. RPC response with oppdragssted/oppdragstittel)
  const direct = pick(submission, SITE_KEYS);
  if (direct) return direct;
  // Inside summary jsonb
  return pick(submission?.summary, SITE_KEYS);
}

/** Address line "Street, 1234 City". */
export function getSubmissionAddressLine(submission: any): string | null {
  if (!submission) return null;
  const sm = submission.summary || {};
  const street =
    pick(sm, ADDRESS_KEYS) ||
    pick(submission, ADDRESS_KEYS);
  const code =
    pick(sm, ["postnummer", "postcode", "postal_code", "zip", "zip_code"]) ||
    pick(submission, ["postnummer", "postcode", "postal_code", "zip", "zip_code"]);
  const city =
    pick(sm, ["poststed", "postal_city", "city", "sted"]) ||
    pick(submission, ["poststed", "postal_city", "city", "sted"]);
  const postal = [code, city].filter(Boolean).join(" ") || null;
  if (street && postal) return `${street}, ${postal}`;
  return street || postal;
}

export function getSubmissionCompany(submission: any): string | null {
  return (
    pick(submission?.summary, COMPANY_KEYS) ||
    pick(submission, COMPANY_KEYS) ||
    null
  );
}

export function getSubmissionContact(submission: any): string | null {
  return (
    submission?.submitter_name ||
    pick(submission?.summary, CONTACT_KEYS) ||
    pick(submission, CONTACT_KEYS) ||
    null
  );
}

/** Primary display title with sensible fallbacks. */
export function getSubmissionDisplayTitle(submission: any): string {
  return (
    getSubmissionSiteTitle(submission) ||
    getSubmissionAddressLine(submission) ||
    getSubmissionCompany(submission) ||
    getSubmissionContact(submission) ||
    submission?.submission_no ||
    "Bestilling"
  );
}

function titleCaseCity(city: string): string {
  if (!city || city !== city.toUpperCase()) return city;
  return city.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, p, c) => p + c.toUpperCase());
}

/** Operative site address "Ramstadveien 6, 1850 Mysen" from an order summary (oppdragssted). Never invoice address. */
export function getOrderSiteAddress(summary: AnyRec): string {
  const street = pick(summary, ["adresse", "address", "besoksadresse", "anleggsadresse"]) || "";
  let code = pick(summary, ["postnummer", "postcode"]) || "";
  let city = pick(summary, ["poststed", "city"]) || "";
  const m = code.match(/^(\d{4})\s+(.+)$/);
  if (m) { code = m[1]; city = city || m[2]; }
  const tail = [code, titleCaseCity(city)].filter(Boolean).join(" ");
  return street && tail ? `${street}, ${tail}` : street || tail;
}

export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
