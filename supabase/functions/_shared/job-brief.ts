// Operational job brief for technicians — ONE source of truth for the approval
// email, the "send again" email and the in-app task view. Pure TS (no Deno/DOM),
// imported by both edge functions and the frontend.
// Priority: edited event fields -> linked order (values + summary) -> empty.
// Never includes invoice recipient, invoice marking/PO, internal handling or CRM fields.
import { addressFromEvent, addressFromOrderSummary, formatAddress } from "./job-address.ts";

type Rec = Record<string, unknown>;
export type OrderValue = { field_key: string; value: unknown };

export interface OperationalJobBrief {
  jobNumber: string;
  title: string;
  siteName: string;
  address: string;
  customer: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  workDescription: string;
  materialResponsibility: string;
  serviceMustProcure: string;
  practicalInfo: string;
}

const text = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(", ");
  if (typeof v === "object") {
    const o = v as Rec;
    if (typeof o.value === "string") return o.value.trim();
    if (typeof o.label === "string") return o.label.trim();
  }
  return "";
};

const matches = (key: string, prefix: string) => {
  const k = key.toLowerCase();
  return k === prefix || k.startsWith(`${prefix}_`);
};

function orderValues(values: OrderValue[], summary: Rec, ...prefixes: string[]): string[] {
  const out: string[] = [];
  for (const p of prefixes) {
    for (const v of values) if (matches(String(v.field_key ?? ""), p)) out.push(text(v.value));
    for (const [k, raw] of Object.entries(summary)) if (matches(k, p)) out.push(text(raw));
  }
  const seen = new Set<string>();
  return out.filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
}

// Header lines auto-written into event.description at creation; shown as structured fields instead.
const HEADER_LABELS = /^(bestilling|kunde|kontaktperson|telefon|e-?post|oppdragssted|adresse)\s*:/i;

/** Event description without the auto-generated header block (keeps the actual work text). */
export function stripBriefHeader(description: string): string {
  const lines = description.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length && (HEADER_LABELS.test(lines[i].trim()) || (!lines[i].trim() && i < 8))) {
    if (!lines[i].trim() && !lines.slice(0, i).some((l) => HEADER_LABELS.test(l.trim()))) break;
    i++;
  }
  return lines.slice(i).join("\n").trim();
}

export function buildOperationalJobBrief(input: {
  event: Rec;
  orderSummary?: Rec | null;
  orderValues?: OrderValue[] | null;
}): OperationalJobBrief {
  const e = input.event ?? {};
  const s = (input.orderSummary ?? {}) as Rec;
  const vals = input.orderValues ?? [];
  const find = (...p: string[]) => orderValues(vals, s, ...p)[0] ?? "";
  const ev = (k: string) => text(e[k]);

  // Order oppdragssted fields: in values the site name + street + "1850 MYSEN" all share the prefix.
  const siteParts = orderValues(vals, {}, "oppdragssted");
  const orderSiteName = text(s.oppdragssted) || siteParts[0] || "";
  let orderAddress = addressFromOrderSummary(s);
  if (!orderAddress && siteParts.length >= 2) {
    const postal = siteParts.find((p) => /^\d{4}\b/.test(p)) ?? "";
    const street = siteParts.slice(1).find((p) => p !== postal) ?? "";
    orderAddress = formatAddress(street, postal, "");
  }

  const eventDescription = stripBriefHeader(ev("description"));
  const orderDescription = find("detaljert_arbeidsbeskrivelse", "arbeidsbeskrivelse", "beskrivelse", "problem_beskrivelse");

  return {
    jobNumber: ev("job_number") || ev("internal_number"),
    title: ev("title"),
    siteName: ev("location_details") || orderSiteName,
    address: addressFromEvent(e) || orderAddress,
    customer: ev("customer") || find("kundenavn", "firmanavn", "kunde", "company_name"),
    contactName: ev("site_contact_name") || find("kontaktperson_navn", "kontaktperson_kunde", "kontaktperson"),
    contactPhone: ev("site_contact_phone") || find("kontaktperson_telefon", "telefon_kunde", "kontakt_telefon"),
    contactEmail: find("kontaktperson_epost", "epost_kunde", "kontakt_epost"),
    workDescription: eventDescription || orderDescription,
    materialResponsibility: find("materialansvar", "hvem_skaffer_materiell"),
    serviceMustProcure: find("hva_skaffer_service", "hva_ma_service_skaffe"),
    practicalInfo: ev("access_notes") || orderValues(vals, s, "praktisk_info", "praktisk", "tilgang", "adgang", "parkering", "kontakt_for_oppmote", "nokler").join("\n"),
  };
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const mapsHref = (a: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`;

/** Email rows (<tr>) for the brief. All order/event text is escaped. */
export function briefEmailRows(b: OperationalJobBrief, when: { date: string; time: string }): string {
  const row = (label: string, html: string) => html
    ? `<tr><td style="padding:8px 0;color:#64748b;width:150px;vertical-align:top;">${label}</td><td style="padding:8px 0;">${html}</td></tr>` : "";
  const t = (v: string) => (v ? escapeHtml(v).replace(/\n/g, "<br>") : "");
  return [
    row("Jobbnummer", b.jobNumber ? `<strong>${t(b.jobNumber)}</strong>` : ""),
    row("Tittel", t(b.title)),
    row("Oppdragssted", t(b.siteName)),
    row("Adresse", b.address ? `<a href="${mapsHref(b.address)}" style="color:#2563b0;">${t(b.address)}</a>` : "—"),
    row("Kunde", t(b.customer)),
    row("Kontaktperson", t(b.contactName)),
    row("Telefon", b.contactPhone ? `<a href="tel:${escapeHtml(b.contactPhone.replace(/\s/g, ""))}" style="color:#2563b0;">${t(b.contactPhone)}</a>` : ""),
    row("E-post", b.contactEmail ? `<a href="mailto:${escapeHtml(b.contactEmail)}" style="color:#2563b0;">${t(b.contactEmail)}</a>` : ""),
    row("Dato", t(when.date)),
    row("Tid", t(when.time)),
    row("Arbeidsbeskrivelse", t(b.workDescription)),
    row("Hvem skaffer materiell?", t(b.materialResponsibility)),
    row("Hva må MCS Service skaffe?", t(b.serviceMustProcure)),
    row("Praktisk info / adgang", t(b.practicalInfo)),
  ].join("");
}

export { mapsHref as briefMapsUrl };
