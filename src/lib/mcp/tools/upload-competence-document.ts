import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { withToolMeta } from "../tool-meta";
import { supabaseProjectUrl, supabasePublishableKey, userBearer } from "../supabase";
import { isPlausiblePdf } from "../pdf-check";

const MAX = 10 * 1024 * 1024;
const fail = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true });

const tool = defineTool({
  name: "upload_competence_document",
  title: "Last opp kompetansedokument",
  description:
    "Upload a PDF certificate as documentation for one competence record (compliance_competences.id). " +
    "Prefer the native `file` parameter (a user-uploaded PDF). Legacy: pdf_base64 or https pdf_url. Max 10 MB. " +
    "Runs as the signed-in Hub user; requires HMS edit rights in the competence's company. Replaces the record's linked document.",
  inputSchema: {
    competence_id: z.string().uuid().describe("ID of the competence record"),
    file: z
      .object({
        download_url: z.string().url().describe("Temporary download URL for the uploaded file"),
        file_id: z.string().min(1).describe("Host file ID"),
        mime_type: z.string().optional().describe("MIME type, should be application/pdf"),
        file_name: z.string().optional().describe("Original file name"),
      })
      .optional()
      .describe("User-uploaded PDF file (OpenAI file param)"),
    file_name: z.string().min(1).max(200).optional().describe("File name, e.g. lift-bevis.pdf (defaults to file.file_name)"),
    pdf_base64: z.string().optional().describe("Legacy: PDF content as base64"),
    pdf_url: z.string().url().optional().describe("Legacy: https URL to download the PDF from"),
    client_request_id: z.string().uuid().optional().describe("Optional idempotency key"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async (args, ctx) => {
    if (!ctx.isAuthenticated()) return fail("Not authenticated");
    const download = async (url: string) => {
      if (!url.startsWith("https://")) throw new Error("URL must be https");
      const res = await fetch(url, { redirect: "follow", signal: ctx.signal });
      if (!res.ok) throw new Error(`Could not download PDF (${res.status})`);
      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > MAX) throw new Error("PDF is larger than 10 MB");
      return new Uint8Array(await res.arrayBuffer());
    };
    let bytes: Uint8Array;
    try {
      if (args.file) {
        if (args.file.mime_type && args.file.mime_type !== "application/pdf") return fail("File must be a PDF");
        bytes = await download(args.file.download_url);
      } else if (args.pdf_base64) {
        const bin = atob(args.pdf_base64.replace(/^data:[^,]*,/, "").replace(/\s/g, ""));
        bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      } else if (args.pdf_url) {
        bytes = await download(args.pdf_url);
      } else return fail("Provide file, pdf_base64 or pdf_url");
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Could not read the PDF");
    }
    if (bytes.length === 0 || bytes.length > MAX) return fail("PDF must be between 1 byte and 10 MB");
    // Reject truncated/corrupt PDFs: must start with "%PDF-" and end with a %%EOF trailer.
    if (!isPlausiblePdf(bytes)) return fail("File is not a valid PDF (missing or corrupt PDF trailer)");
    const rawName = args.file_name ?? args.file?.file_name ?? "kompetansebevis.pdf";

    const form = new FormData();
    form.append("competence_id", args.competence_id);
    if (args.client_request_id) form.append("client_request_id", args.client_request_id);
    form.append("file", new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" }), rawName.toLowerCase().endsWith(".pdf") ? rawName : `${rawName}.pdf`);

    const res = await fetch(`${supabaseProjectUrl()}/functions/v1/competence-document-upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${userBearer(ctx)}`, apikey: supabasePublishableKey() },
      body: form,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return fail(body?.error ?? `Upload failed (${res.status})`);
    return {
      content: [{ type: "text", text: `Uploaded. document_id=${body.document_id}` }],
      structuredContent: { document_id: body.document_id, file_path: body.file_path },
    };
  },
});

export default withToolMeta(tool, { "openai/fileParams": ["file"] });
