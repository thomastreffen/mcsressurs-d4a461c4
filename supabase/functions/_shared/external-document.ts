/** Source identity is retained internally; only the delivery representation changes. */
export function isMarkdownFile(name: string | null | undefined, mime?: string | null): boolean {
  return /\.(md|markdown)$/i.test(name ?? "") || /^(text\/(x-)?markdown)(;|$)/i.test(mime ?? "");
}

export function externalDocumentName(name: string, mime?: string | null): string {
  return isMarkdownFile(name, mime) ? name.replace(/\.(md|markdown)$/i, "").concat(".pdf") : name;
}

export function externalDocumentMime(name: string, mime?: string | null): string | null {
  return isMarkdownFile(name, mime) ? "application/pdf" : mime ?? null;
}

/** Plain, readable Markdown representation. Preserve links, lists, tables and code content. */
export function markdownSections(markdown: string): { heading: string; text: string }[] {
  const sections: { heading: string; text: string }[] = [];
  let current = { heading: "", text: "" };
  let fenced = false;
  for (const line of markdown.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    const heading = !fenced ? /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line) : null;
    if (heading) {
      if (current.heading || current.text.trim()) sections.push(current);
      current = { heading: heading[2], text: "" };
      continue;
    }
    if (!fenced && /^\s*(---+|\*\*\*+|\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?)\s*$/.test(line)) continue;
    let readable = fenced ? line : line
      .replace(/!?\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
      .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, "$1$2")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/^\s*>\s?/, "")
      .replace(/^\s*[-*+]\s+/, "- ");
    if (!fenced && /^\s*\|.*\|\s*$/.test(readable)) readable = readable.trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim()).join("  /  ");
    current.text += `${readable}\n`;
  }
  if (current.heading || current.text.trim()) sections.push(current);
  return sections;
}

export interface DocumentPdf {
  setFont(name: string, style: string): unknown;
  setFontSize(size: number): unknown;
  splitTextToSize(text: string, width: number): string[];
  text(text: string, x: number, y: number): unknown;
  addPage(): unknown;
  getNumberOfPages(): number;
  setPage(page: number): unknown;
}

/** Same A4 typography, margins, heading hierarchy and page numbers as DLE documents. */
export function renderDocumentPdf(pdf: DocumentPdf, company: string, date: string, records: { title: string; version?: string; sections: { heading: string; text: string }[] }[], category = "Dokumentasjon") {
  let y = 20;
  const write = (text: string, size = 10, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal"); pdf.setFontSize(size);
    // Norwegian letters are covered by the existing PDF font. Normalize punctuation only.
    const value = text.replace(/<[^>]*>/g, "").replace(/[–—]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\u0020-\u00ff\n\r\t]/g, " ");
    for (const line of pdf.splitTextToSize(value, 174)) {
      if (y > 274) { pdf.addPage(); y = 20; }
      pdf.text(line, 18, y); y += size * 0.46 + 1;
    }
    y += 3;
  };
  write(company, 16, true); write(`${category} | ${date} | DLE-tilsyn`);
  for (const record of records) {
    write(record.title, 13, true);
    if (record.version) write(`Dokumentversjon: ${record.version}`, 9);
    for (const section of record.sections) {
      if (section.heading) write(section.heading, 11, true);
      if (section.text) write(section.text);
    }
    y += 4;
  }
  const total = pdf.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    pdf.setPage(page); pdf.setFontSize(8); pdf.text(`${page} / ${total}`, 180, 289);
  }
}