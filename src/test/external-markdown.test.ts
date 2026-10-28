// Isolated source blobs only: no production storage or e-mail.
import { describe, expect, it, vi, afterEach } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import { buildExportNames, buildManifest, type AttachmentCandidate } from "@/lib/response-package";
import { buildDleFiles } from "@/lib/dle/export";
import { externalDocumentBlob, isMarkdownFile } from "@/lib/external-document";
import { markdownSections } from "../../supabase/functions/_shared/external-document";
import { prepareDleFile } from "@/lib/dle/sources";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://example.test/source" } }) }) } } }));
vi.mock("@/hooks/useChemicals", () => ({ fetchSdsUrl: vi.fn() }));
const markdown = "# Rutine for internrevisjon\n\nÅrlig kontroll av ansvar.\n\n## Gjennomførte tiltak\n- **Kontrollert** organisasjon\n- Dokumentasjon gjennomgått\n\n| Punkt | Resultat |\n| --- | --- |\n| 2 | Fullført |\n\nReferanse [DSB](https://www.dsb.no)\n";
const candidate = { key: "routine", kind: "document", title: "Rutine for internrevisjon", file_name: "rutine.md", mime_type: "text/markdown", source_label: "Internkontroll" } as AttachmentCandidate;
afterEach(() => vi.unstubAllGlobals());
const read = (blob: Blob): Promise<string> => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(blob); });
describe("External Markdown documentation", () => {
  it.each([["rutine.md", "text/plain"], ["rapport.MD", "application/octet-stream"], ["rutine", "text/markdown; charset=utf-8"]])("detects source %s without relying on both name and MIME", (name, mime) => expect(isMarkdownFile(name, mime)).toBe(true));
  it("preview and manifest use PDF name and MIME while preserving source identity", () => {
    const names = buildExportNames([candidate]); const manifest = buildManifest([candidate], names);
    expect(names.routine).toBe("01_Rutine_for_internrevisjon.pdf"); expect(manifest[0].mime_type).toBe("application/pdf");
    expect(candidate.file_name).toBe("rutine.md"); expect(candidate.mime_type).toBe("text/markdown");
  });
  it("produces PDF paths for finding attachments and general audit originals, never .md", () => {
    const files = buildDleFiles("attachments", [{ id: "source", title: candidate.title, sections: [], original: { filename: "rutine.md", mime: "text/markdown", bucket: "internal", path: "source.md" } }], true, "MCS Service", "2026-10-28");
    expect(files[0].name.endsWith(".pdf")).toBe(true); expect(files[0].path.endsWith(".pdf")).toBe(true); expect(files[0].records[0].original?.path).toBe("source.md");
  });
  it("preserves Markdown headings, body, table content and official link in the representation and actual PDF", async () => {
    const sections = markdownSections(markdown); expect(sections[0].heading).toBe("Rutine for internrevisjon"); expect(sections.map(s => s.text).join()).toContain("Fullført");
    const pdf = await externalDocumentBlob(new NodeBlob([markdown], { type: "text/markdown" }) as Blob, "rutine.md", "text/markdown", candidate.title, "MCS Service", "2026-10-28");
    expect(pdf.type).toBe("application/pdf"); const content = await read(pdf);
    expect(content.startsWith("%PDF-")).toBe(true); expect(content).toContain("Rutine for internrevisjon"); expect(content).toContain("Kontrollert"); expect(content).toContain("https://www.dsb.no"); expect(content).toContain("%%EOF");
  });
  it("download preparation fetches source but delivers generated PDF containing its content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new NodeBlob([markdown], { type: "text/markdown" }) })));
    const file = buildDleFiles("attachments", [{ id: "source", title: candidate.title, sections: [], original: { filename: "rutine.md", mime: "text/markdown", bucket: "internal", path: "source.md" } }], true, "MCS Service", "2026-10-28")[0];
    const pdf = await prepareDleFile(file, "MCS Service", "2026-10-28"); expect(pdf.type).toBe("application/pdf"); expect(await read(pdf)).toContain("Kontrollert");
  });
  it("passes an original PDF through byte-for-byte and never regenerates it", async () => {
    const original = new NodeBlob(["%PDF-1.4\noriginal bytes\n%%EOF"], { type: "application/pdf" }) as Blob;
    expect(await externalDocumentBlob(original, "original.pdf", "application/pdf", "Original", "MCS", "2026-10-28")).toBe(original);
  });
  it("fails closed on empty Markdown rather than dropping evidence", async () => {
    await expect(externalDocumentBlob(new NodeBlob(["  "]) as Blob, "empty.md", null, "Empty", "MCS", "2026-10-28")).rejects.toThrow("tomt");
  });
});