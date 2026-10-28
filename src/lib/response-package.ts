/**
 * Svarpakke & utsendelse – felles logikk.
 *
 * Prinsipp: svarpakken refererer kun eksisterende data (funn, tiltak, documents,
 * bevis/referanser og kravmotoren). Ingen filer kopieres, og eksportnavn gjelder
 * bare den utsendte/eksporterte pakken – originalen i storage røres ikke.
 */
import type { ComplianceTone } from "@/lib/compliance";
import { isMarkdownFile, externalDocumentMime } from "../../supabase/functions/_shared/external-document";

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
  /** Source identity for deduplication; never a person/role display name. */
  source_ref_id?: string | null;
  /** Hvor dokumentet kommer fra, f.eks. «Ansatt → Kompetanse» */
  source_label: string;
  /** Dato på dokumentet/beviset */
  date: string | null;
  status_label: string;
  status_tone: ComplianceTone;
  /** Kort tittel brukt i manifest og eksportnavn */
  title: string;
  /** Systemgenerert oversikt (kompetanseoversikt) som lages ved eksport */
  generated?: { type: "competence_overview"; competence_type_id: string; rows: string[][] }
    | { type: "organization_overview"; company_id: string; rows: string[][] };
  /** Sant når referansen ikke har fil (regelverk, rolle, tiltak) */
  reference_note?: string | null;
}

export const EVIDENCE_SOURCE_LABELS: Record<string, string> = {
  competence_requirement: "Ansatt → Kompetanse",
  competence: "Ansatt → Kompetanse",
  regulation: "Regelverk",
  org_role: "Organisasjon & ansvar",
  organization_overview: "Organisasjon & ansvar – samlet oversikt",
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
  if (isMarkdownFile(c.file_name, c.mime_type)) return "pdf";
  const fromName = c.file_name?.includes(".") ? c.file_name.split(".").pop() ?? "" : "";
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
  mime_type?: string | null;
  title: string;
  source_label: string;
  reference_only: boolean;
}

export function buildManifest(list: AttachmentCandidate[], names: Record<string, string>): ManifestEntry[] {
  return list.map((c) => ({
    export_name: names[c.key] ?? null,
    mime_type: externalDocumentMime(c.file_name, c.mime_type),
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
    const completed = f.actions.filter(a => ["completed", "done"].includes(a.status));
    if (completed.length) blocks.push(`Gjennomførte tiltak: ${completed.map((a) => a.title).join("; ")}`);
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
  title?: string;
  caseNumber?: string | null;
}): string {
  // Outlook-vennlig: tabeller og inline CSS, ingen bilder eller eksterne stiler.
  const text = (s: string, extra = "") => `<p style="margin:0 0 12px;white-space:pre-wrap;${extra}">${escapeHtml(s)}</p>`;
  const label = (s: string) => `<p style="margin:14px 0 4px;font-size:12px;font-weight:bold;letter-spacing:0.04em;text-transform:uppercase;color:#6b7280;">${escapeHtml(s)}</p>`;
  const parts: string[] = [`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr><td style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#111827;line-height:1.6;max-width:680px;">`];
  parts.push(`<h1 style="margin:0 0 4px;font-size:20px;font-weight:bold;color:#111827;">${escapeHtml(input.title || "Svar på tilsyn")}</h1>`);
  if (input.caseNumber) parts.push(`<p style="margin:0 0 20px;font-size:13px;color:#6b7280;">Saksnummer ${escapeHtml(input.caseNumber)}</p>`);
  parts.push(text(input.intro));
  for (const f of input.findings) {
    parts.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0;border:1px solid #e5e7eb;"><tr><td style="padding:16px 20px;">`);
    parts.push(`<h2 style="margin:0 0 4px;font-size:16px;font-weight:bold;color:#111827;">Avvik ${f.finding_number} – ${escapeHtml(f.title)}</h2>`);
    if (f.original_text?.trim()) { parts.push(label("Avvik")); parts.push(text(f.original_text, "color:#374151;")); }
    parts.push(label("Vår tilbakemelding"));
    parts.push(text(f.response_text?.trim() || "(svartekst mangler)"));
    const completed = f.actions.filter(a => ["completed", "done"].includes(a.status));
    if (completed.length) {
      parts.push(label("Gjennomførte tiltak"));
      parts.push(`<ul style="margin:0 0 12px;padding-left:20px;">${completed.map((a) => `<li>${escapeHtml(a.title)}</li>`).join("")}</ul>`);
    }
    if (f.attachment_names.length) {
      parts.push(label("Dokumentasjon/vedlegg"));
      parts.push(`<ul style="margin:0;padding-left:20px;">${f.attachment_names.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>`);
    }
    parts.push(`</td></tr></table>`);
  }
  const files = input.manifest.filter((m) => !m.reference_only);
  const refs = input.manifest.filter((m) => m.reference_only);
  parts.push(`<h2 style="margin:24px 0 8px;font-size:16px;font-weight:bold;">Vedleggsoversikt</h2>`);
  if (files.length) {
    parts.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">`);
    files.forEach((m) => parts.push(`<tr><td style="padding:6px 12px 6px 0;border-bottom:1px solid #e5e7eb;font-family:Consolas,monospace;color:#374151;white-space:nowrap;">${escapeHtml(m.export_name ?? "")}</td><td style="padding:6px 0;border-bottom:1px solid #e5e7eb;">${escapeHtml(m.title)}</td></tr>`));
    parts.push(`</table>`);
  } else parts.push(text("Ingen vedlagte filer.", "color:#6b7280;"));
  if (refs.length) {
    parts.push(label("Referanser uten vedlagt fil"));
    parts.push(`<ul style="margin:0 0 12px;padding-left:20px;">${refs.map((m) => `<li>${escapeHtml(m.title)} (${escapeHtml(m.source_label)})</li>`).join("")}</ul>`);
  }
  parts.push(`<div style="margin-top:24px;">${text(input.closing)}</div>`);
  parts.push("</td></tr></table>");
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
