import { jsPDF } from "jspdf";
import { slugForFile } from "@/lib/response-package";
import { isMarkdownFile, renderDocumentPdf } from "../../../supabase/functions/_shared/external-document";

export const DLE_CATEGORIES = [
  { key: "chart", label: "Organisasjonskart", folder: "01_Organisasjon" },
  { key: "matrix", label: "Ansvarsmatrise", folder: "01_Organisasjon" },
  { key: "roles", label: "Roller og ansvar", folder: "01_Organisasjon" },
  { key: "handbook", label: "HMS-håndbok", folder: "02_HMS" },
  { key: "fse", label: "FSE og elsikkerhet", folder: "03_FSE" },
  { key: "competence", label: "Kompetanseoversikt", folder: "04_Kompetanse" },
  { key: "sja", label: "SJA", folder: "05_Risikovurdering_SJA" },
  { key: "incidents", label: "Avvik og RUH", folder: "06_Avvik" },
  { key: "rounds", label: "Vernerunder", folder: "02_HMS" },
  { key: "chemicals", label: "Stoffkartotek", folder: "07_Stoffkartotek" },
  { key: "sds", label: "Sikkerhetsdatablad (SDS)", folder: "08_SDS" },
  { key: "attachments", label: "Vedlegg på tilsynssaken", folder: "09_Vedlegg" },
] as const;
export type DleCategory = typeof DLE_CATEGORIES[number]["key"];
export interface DleRecord {
  id: string;
  parentId?: string | null;
  version?: string;
  title: string;
  sections: { heading: string; text: string }[];
  original?: { chemicalId?: string; bucket?: string; path?: string; filename: string; mime: string };
}
export interface DleFile {
  key: string;
  category: DleCategory;
  name: string;
  path: string;
  records: DleRecord[];
}

export function externalText(value: unknown): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/https?:\/\/\S+|\/(?:hms|compliance|jobs|planlegging)\/\S+/gi, "")
    .replace(/\*\*/g, "")
    .replace(/[^\u0020-\u00ff\n\r\t]/g, " ").trim();
}

export function buildDleFiles(category: DleCategory, records: DleRecord[], separate: boolean, company: string, date: string): DleFile[] {
  const config = DLE_CATEGORIES.find((c) => c.key === category);
  if (!config || !records.length) return [];
  // Keep originals separate; Markdown delivery becomes PDF, source remains untouched.
  const groups = separate || records.some((r) => r.original) ? records.map((r) => [r]) : [records];
  const used = new Map<string, number>();
  return groups.map((group) => {
    const original = group[0]?.original;
    const extension = original && !isMarkdownFile(original.filename, original.mime) ? original.filename.split(".").pop()?.toLowerCase() || "pdf" : "pdf";
    const title = group.length === 1 && (separate || original) ? group[0].title : config.label;
    const base = `${slugForFile(company)}_${slugForFile(title)}_${date}`;
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    const name = `${base}${n > 1 ? `_${n}` : ""}.${original ? extension : "pdf"}`;
    return { key: `${category}:${group.map((r) => r.id).join(":")}`, category, name, path: `${config.folder}/${name}`, records: group };
  });
}

export function generateDlePdf(file: DleFile, company: string, date: string): Blob {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  if (file.category !== "chart") {
    renderDocumentPdf(pdf, company, date, file.records.map(r => ({ ...r, sections: r.sections.map(s => ({ heading: externalText(s.heading), text: externalText(s.text) })) })), DLE_CATEGORIES.find(c => c.key === file.category)?.label);
    return pdf.output("blob");
  }
  let y = 20;
  const write = (text: string, size = 10, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    const lines: string[] = pdf.splitTextToSize(externalText(text), 174);
    for (const line of lines) {
      if (y > 274) { pdf.addPage(); y = 20; }
      pdf.text(line, 18, y);
      y += size * 0.46 + 1;
    }
    y += 3;
  };
  const config = DLE_CATEGORIES.find((c) => c.key === file.category);
  write(company, 16, true);
  write(`${config?.label ?? "Dokumentasjon"} | ${date} | DLE-tilsyn`, 10);
  if (file.category === "chart") {
    const visited = new Set<string>();
    const branch = (record: DleRecord, depth: number) => {
      if (visited.has(record.id)) return;
      visited.add(record.id);
      if (y > 250) { pdf.addPage(); y = 20; }
      const x = 18 + Math.min(depth, 5) * 12;
      const width = 174 - Math.min(depth, 5) * 12;
      const people = record.sections.find((s) => s.heading === "Ansvarlige")?.text ?? "Ikke tildelt";
      pdf.setFontSize(10); pdf.setFont("helvetica", "normal");
      const lines: string[] = pdf.splitTextToSize(externalText(people), width - 10);
      const titles: string[] = pdf.splitTextToSize(externalText(record.title), width - 10);
      const height = 9 + (lines.length + titles.length) * 5;
      if (depth > 0) { pdf.line(x - 6, y - 6, x - 6, y + 5); pdf.line(x - 6, y + 5, x, y + 5); }
      pdf.rect(x, y, width, height);
      pdf.setFont("helvetica", "bold"); pdf.text(titles, x + 5, y + 6);
      pdf.setFont("helvetica", "normal"); pdf.text(lines, x + 5, y + 6 + titles.length * 5);
      y += height + 7;
      for (const child of file.records.filter((r) => r.parentId === record.id)) branch(child, depth + 1);
    };
    for (const root of file.records.filter((r) => !r.parentId || !file.records.some((p) => p.id === r.parentId))) branch(root, 0);
    for (const record of file.records) branch(record, 0);
  }
  for (const record of file.category === "chart" ? [] : file.records) {
    write(record.title, 13, true);
    if (record.version) write(`Dokumentversjon: ${record.version}`, 9);
    for (const section of record.sections) {
      if (section.heading) write(section.heading, 11, true);
      if (section.text) write(section.text);
    }
    y += 4;
  }
  const total = pdf.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p); pdf.setFontSize(8); pdf.text(`${p} / ${total}`, 180, 289);
  }
  return pdf.output("blob");
}

export async function deliverDleBlob(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; }
    catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
