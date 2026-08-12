/**
 * Svarpakke & utsendelse – felles logikk.
 *
 * Prinsipp: svarpakken refererer kun eksisterende data (funn, tiltak, documents,
 * bevis/referanser og kravmotoren). Ingen filer kopieres, og eksportnavn gjelder
 * bare den utsendte/eksporterte pakken – originalen i storage røres ikke.
 */
import type { ComplianceTone } from "@/lib/compliance";

export type AttachmentKind = "document" | "generated" | "reference";

export interface AttachmentCandidate {
  /** Stabil nøkkel brukt for valg i UI og i utkastet */
  key: string;
  finding_id: string | null;
  kind: AttachmentKind;
  evidence_id: string | null;
  document_id: string | null;
  /** Filnavn slik det ligger i systemet (documents.file_name) */
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  storage_bucket: string | null;
  file_path: string | null;
  source_kind: string;
  /** Hvor dokumentet kommer fra, f.eks. «Ansatt → Kompetanse» */
  source_label: string;
  /** Dato på dokumentet/beviset */
  date: string | null;
  status_label: string;
  status_tone: ComplianceTone;
  /** Kort tittel brukt i manifest og eksportnavn */
  title: string;
  /** Systemgenerert oversikt (kompetanseoversikt) som lages ved eksport */
  generated?: { type: "competence_overview"; competence_type_id: string; rows: string[][] };
  /** Sant når referansen ikke har fil (regelverk, rolle, tiltak) */
  reference_note?: string | null;
}

export const EVIDENCE_SOURCE_LABELS: Record<string, string> = {
  competence_requirement: "Ansatt → Kompetanse",
  competence: "Ansatt → Kompetanse",
  regulation: "Regelverk",
  org_role: "Organisasjon & ansvar",
  internal_audit: "Internkontroll",
  hms_incident: "HMS-avvik",
  action_item: "Tiltak",
  document: "Opplastet dokument",
  other: "Annen referanse",
};

export function sourceLabelFor(kind: string): string {
  return EVIDENCE_SOURCE_LABELS[kind] ?? "Referanse";
}

/** Filnavnvennlig tekst: «Andre Midtgård» → «Andre_Midtgard» */
export function slugForFile(input: string): string {
  return (input || "vedlegg")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[æÆ]/g, "ae")
    .replace(/[øØ]/g, "o")
    .replace(/[åÅ]/g, "a")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 70) || "vedlegg";
}

function extensionOf(c: AttachmentCandidate): string {
  if (c.kind === "generated") return "csv";
  const fromName = c.file_name?.includes(".") ? c.file_name.split(".").pop()! : "";
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  if (c.mime_type?.includes("pdf")) return "pdf";
  return "pdf";
}

/** Ryddige, nummererte vedleggsnavn – gjelder kun eksportert/sendt pakke */
export function buildExportNames(list: AttachmentCandidate[]): Record<string, string> {
  const out: Record<string, string> = {};
  let n = 0;
  for (const c of list) {
    if (c.kind === "reference") continue;
    n += 1;
    const prefix = String(n).padStart(2, "0");
    out[c.key] = `${prefix}_${slugForFile(c.title)}.${extensionOf(c)}`;
  }
  return out;
}

export interface ManifestEntry {
  export_name: string | null;
  title: string;
  source_label: string;
  reference_only: boolean;
}

export function buildManifest(list: AttachmentCandidate[], names: Record<string, string>): ManifestEntry[] {
  return list.map((c) => ({
    export_name: names[c.key] ?? null,
    title: c.title,
    source_label: c.source_label,
    reference_only: c.kind === "reference",
  }));
}

export function manifestAsText(entries: ManifestEntry[]): string {
  const files = entries.filter((e) => !e.reference_only);
  const refs = entries.filter((e) => e.reference_only);
  const lines: string[] = ["Vedlegg", ""];
  files.forEach((e) => lines.push(`${e.export_name}  –  ${e.title} (${e.source_label})`));
  if (refs.length) {
    lines.push("", "Referanser uten vedlagt fil", "");
    refs.forEach((e) => lines.push(`- ${e.title} (${e.source_label})`));
  }
  return lines.join("\n");
}

/* ---------------- E-postutkast ---------------- */

export interface PackageFindingDraft {
  finding_id: string;
  finding_number: number;
  finding_type: string;
  title: string;
  original_text: string | null;
  response_text: string;
  actions: { title: string; status: string }[];
  attachment_names: string[];
}

export function defaultSubject(opts: { authority?: string | null; companyName?: string | null; caseNumber?: string | null }): string {
  const parts = ["Tilbakemelding på tilsyn"];
  if (opts.companyName) parts.push(opts.companyName);
  if (opts.caseNumber) parts.push(`Saksnummer ${opts.caseNumber}`);
  return parts.join(" – ");
}

export function defaultIntro(opts: { contactName?: string | null; inspectionDate?: string | null; authority?: string | null }): string {
  const hei = opts.contactName ? `Hei ${opts.contactName.split(" ")[0]},` : "Hei,";
  const dato = opts.inspectionDate
    ? new Date(opts.inspectionDate).toLocaleDateString("nb-NO")
    : "";
  return [
    hei,
    "",
    `Viser til tilsyns-/revisjonsrapport${dato ? ` datert ${dato}` : ""}${opts.authority ? ` fra ${opts.authority}` : ""}.`,
    "",
    "Vi oversender dokumentasjon på gjennomførte tiltak knyttet til følgende avvik:",
  ].join("\n");
}

export function defaultClosing(companyName?: string | null): string {
  return ["Med vennlig hilsen", companyName || ""].filter(Boolean).join("\n");
}

export function buildEmailText(input: {
  intro: string;
  findings: PackageFindingDraft[];
  manifest: ManifestEntry[];
  closing: string;
}): string {
  const blocks: string[] = [input.intro.trim(), ""];
  for (const f of input.findings) {
    blocks.push(`Avvik ${f.finding_number} – ${f.title}`);
    blocks.push(f.response_text?.trim() || "(svartekst mangler)");
    if (f.actions.length) blocks.push(`Gjennomførte tiltak: ${f.actions.map((a) => a.title).join("; ")}`);
    if (f.attachment_names.length) blocks.push(`Vedlegg: ${f.attachment_names.join(", ")}`);
    blocks.push("");
  }
  blocks.push(manifestAsText(input.manifest));
  blocks.push("", input.closing.trim());
  return blocks.join("\n");
}

export function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

export function buildEmailHtml(input: {
  intro: string;
  findings: PackageFindingDraft[];
  manifest: ManifestEntry[];
  closing: string;
}): string {
  const p = (s: string) => `<p style="margin:0 0 12px;white-space:pre-wrap;">${escapeHtml(s)}</p>`;
  const parts: string[] = [`<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#111827;line-height:1.55;">`];
  parts.push(p(input.intro));
  for (const f of input.findings) {
    parts.push(`<h3 style="margin:18px 0 6px;font-size:15px;">Avvik ${f.finding_number} – ${escapeHtml(f.title)}</h3>`);
    parts.push(p(f.response_text?.trim() || "(svartekst mangler)"));
    if (f.actions.length)
      parts.push(`<p style="margin:0 0 8px;color:#374151;"><strong>Gjennomførte tiltak:</strong> ${escapeHtml(f.actions.map((a) => a.title).join("; "))}</p>`);
    if (f.attachment_names.length)
      parts.push(`<p style="margin:0 0 8px;color:#374151;"><strong>Vedlegg:</strong> ${escapeHtml(f.attachment_names.join(", "))}</p>`);
  }
  const files = input.manifest.filter((m) => !m.reference_only);
  const refs = input.manifest.filter((m) => m.reference_only);
  parts.push(`<h3 style="margin:20px 0 6px;font-size:15px;">Vedlegg</h3><ol style="margin:0 0 12px;padding-left:20px;">`);
  files.forEach((m) => parts.push(`<li>${escapeHtml(m.export_name ?? "")} – ${escapeHtml(m.title)}</li>`));
  parts.push("</ol>");
  if (refs.length) {
    parts.push(`<p style="margin:0 0 6px;color:#374151;"><strong>Referanser uten vedlagt fil:</strong></p><ul style="margin:0 0 12px;padding-left:20px;">`);
    refs.forEach((m) => parts.push(`<li>${escapeHtml(m.title)} (${escapeHtml(m.source_label)})</li>`));
    parts.push("</ul>");
  }
  parts.push(p(input.closing));
  parts.push("</div>");
  return parts.join("");
}

/* ---------------- Utkast (kun valg og e-postfelt) ---------------- */

export interface ResponseDraft {
  inspection_id: string;
  finding_ids: string[];
  attachment_keys: string[];
  recipient_name: string;
  recipient_email: string;
  cc: string;
  subject: string;
  intro: string;
  closing: string;
}

const draftKey = (inspectionId: string) => `mcs.response-draft.${inspectionId}`;

export function saveResponseDraft(d: ResponseDraft) {
  try {
    sessionStorage.setItem(draftKey(d.inspection_id), JSON.stringify(d));
  } catch {
    /* ignorer */
  }
}

export function loadResponseDraft(inspectionId: string): ResponseDraft | null {
  try {
    const raw = sessionStorage.getItem(draftKey(inspectionId));
    return raw ? (JSON.parse(raw) as ResponseDraft) : null;
  } catch {
    return null;
  }
}

export function clearResponseDraft(inspectionId: string) {
  try {
    sessionStorage.removeItem(draftKey(inspectionId));
  } catch {
    /* ignorer */
  }
}
