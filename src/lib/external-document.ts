import { jsPDF } from "jspdf";
import { isMarkdownFile, markdownSections, renderDocumentPdf } from "../../supabase/functions/_shared/external-document";
export { isMarkdownFile, externalDocumentName, externalDocumentMime } from "../../supabase/functions/_shared/external-document";

export async function externalDocumentBlob(blob: Blob, sourceName: string, mime: string | null | undefined, title: string, company: string, date: string): Promise<Blob> {
  if (!isMarkdownFile(sourceName, mime) && !isMarkdownFile(sourceName, blob.type)) return blob;
  const markdown = await blob.text();
  if (!markdown.trim()) throw new Error("Markdown-dokumentet er tomt. Ingen dokumentasjon eksportert.");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  renderDocumentPdf(pdf, company, date, [{ title, sections: markdownSections(markdown) }]);
  return pdf.output("blob");
}