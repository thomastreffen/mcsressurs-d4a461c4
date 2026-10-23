import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseProjectUrl, supabasePublishableKey, userBearer } from "../supabase";

const MAX = 10 * 1024 * 1024;
const fail = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true });

export default defineTool({
  name: "upload_competence_document",
  title: "Last opp kompetansedokument",
  description:
    "Upload a PDF certificate as documentation for one competence record (compliance_competences.id). " +
    "Provide the PDF either as base64 (pdf_base64) or as an https URL (pdf_url). Max 10 MB. " +
    "Runs as the signed-in Hub user; requires HMS edit rights in the competence's company. Replaces the record's linked document.",
  inputSchema: {
    competence_id: z.string().uuid().describe("ID of the competence record"),
    file_name: z.string().min(1).max(200).describe("File name, e.g. lift-bevis.pdf"),
    pdf_base64: z.string().optional().describe("PDF content as base64"),
    pdf_url: z.string().url().optional().describe("https URL to download the PDF from"),
    client_request_id: z.string().uuid().optional().describe("Optional idempotency key"),
  },
  handler: async (args, ctx) => {
    if (!ctx.isAuthenticated()) return fail("Not authenticated");
    let bytes: Uint8Array;
    try {
      if (args.pdf_base64) {
        const bin = atob(args.pdf_base64.replace(/^data:[^,]*,/, "").replace(/\s/g, ""));
        bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      } else if (args.pdf_url) {
        if (!args.pdf_url.startsWith("https://")) return fail("pdf_url must be https");
        const res = await fetch(args.pdf_url, { redirect: "follow" });
        if (!res.ok) return fail(`Could not download PDF (${res.status})`);
        const len = Number(res.headers.get("content-length") ?? 0);
        if (len > MAX) return fail("PDF is larger than 10 MB");
        bytes = new Uint8Array(await res.arrayBuffer());
      } else return fail("Provide pdf_base64 or pdf_url");
    } catch {
      return fail("Could not read the PDF");
    }
    if (bytes.length === 0 || bytes.length > MAX) return fail("PDF must be between 1 byte and 10 MB");

    const form = new FormData();
    form.append("competence_id", args.competence_id);
    if (args.client_request_id) form.append("client_request_id", args.client_request_id);
    form.append("file", new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" }), args.file_name.endsWith(".pdf") ? args.file_name : `${args.file_name}.pdf`);

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
