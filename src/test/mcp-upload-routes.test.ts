// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import upload from "@/lib/mcp/tools/upload-competence-document";
import { addToolMeta } from "@/lib/mcp/tool-meta";

const id = "b3da6c64-88d9-4beb-b08a-dbed21bd2e3c";
const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 1\n0000000000 65535 f\ntrailer\n<< /Size 1 >>\nstartxref\n49\n%%EOF\n");
const file = { download_url: "https://files.example.test/certificate.pdf", file_id: "file-test", mime_type: "application/pdf", file_name: "certificate.pdf" };
function context() {
  const ctx = new ToolContext(undefined);
  vi.spyOn(ctx, "isAuthenticated").mockReturnValue(true);
  vi.spyOn(ctx, "getToken").mockReturnValue("mock-caller-bearer");
  return ctx;
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("MCP native PDF contract", () => {
  it("requires download_url and file_id on the top-level file parameter", () => {
    const schema = z.object(upload.inputSchema);
    expect(schema.safeParse({ competence_id: id, file }).success).toBe(true);
    expect(schema.safeParse({ competence_id: id, file: { file_id: "file-test" } }).success).toBe(false);
    expect(schema.safeParse({ competence_id: id, file: { download_url: file.download_url } }).success).toBe(false);
    const payload = { result: { tools: [{ name: upload.name, inputSchema: {} }] } };
    expect(addToolMeta(payload)).toEqual({ result: { tools: [{ name: upload.name, inputSchema: {}, _meta: { "openai/fileParams": ["file"] } }] } });
  });

  for (const route of ["file", "pdf_url", "pdf_base64"] as const) {
    it(`${route} forwards exact binary PDF bytes and the existing competence ID`, async () => {
      vi.stubEnv("SUPABASE_URL", "https://backend.example.test");
      vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "mock-public-key");
      const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        if (String(url) === file.download_url) return new Response(pdf.slice().buffer, { headers: { "content-type": "application/pdf" } });
        const form = init?.body;
        expect(form).toBeInstanceOf(FormData);
        if (!(form instanceof FormData)) throw new Error("Expected multipart form");
        expect(form.get("competence_id")).toBe(id);
        const binary = form.get("file");
        expect(binary).toBeInstanceOf(Blob);
        if (!(binary instanceof Blob)) throw new Error("Expected binary PDF");
        expect(new Uint8Array(await binary.arrayBuffer())).toEqual(pdf);
        expect(binary.type).toBe("application/pdf");
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer mock-caller-bearer");
        return Response.json({ document_id: "mock-existing-document", file_path: "mock-private-path" });
      });
      vi.stubGlobal("fetch", fetchMock);
      const args = route === "file"
        ? { competence_id: id, file, pdf_base64: "invalid-fallback", pdf_url: "https://unused.example.test" }
        : route === "pdf_url" ? { competence_id: id, pdf_url: file.download_url }
        : { competence_id: id, pdf_base64: btoa(String.fromCharCode(...pdf)) };
      const result = await upload.handler({ file: undefined, file_name: undefined, pdf_base64: undefined, pdf_url: undefined, client_request_id: undefined, ...args }, context());
      expect(result.isError).not.toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(route === "pdf_base64" ? 1 : 2);
    });
  }

  it("rejects a truncated native file before calling the storage API", async () => {
    const fetchMock = vi.fn(async () => new Response("%PDF-1.4\ntruncated"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await upload.handler({ competence_id: id, file, file_name: undefined, pdf_base64: undefined, pdf_url: undefined, client_request_id: undefined }, context());
    expect(result.isError).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});