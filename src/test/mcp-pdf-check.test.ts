import { describe, expect, it } from "vitest";
import { isPlausiblePdf } from "@/lib/mcp/pdf-check";

const enc = new TextEncoder();

/** Minimal structurally complete PDF: header, body, xref table, trailer, %%EOF. */
function validPdf(extraTail = ""): Uint8Array {
  const body =
    "%PDF-1.4\n" +
    "1 0 obj\n<< /Type /Catalog >>\nendobj\n" +
    "xref\n0 2\n0000000000 65535 f \n0000000009 00000 n \n" +
    "trailer\n<< /Size 2 /Root 1 0 R >>\n" +
    "startxref\n80\n%%EOF\n";
  return enc.encode(body + extraTail);
}

describe("isPlausiblePdf", () => {
  it("accepts a structurally complete PDF", () => {
    expect(isPlausiblePdf(validPdf())).toBe(true);
  });

  it("accepts a valid PDF with trailing bytes after %%EOF", () => {
    expect(isPlausiblePdf(validPdf("\n\n   \n"))).toBe(true);
    expect(isPlausiblePdf(validPdf("TRAILING-GARBAGE-BYTES"))).toBe(true);
  });

  it("rejects a truncated PDF that has the header but no %%EOF", () => {
    const truncated = validPdf().subarray(0, 40); // cut before xref/trailer
    expect(isPlausiblePdf(truncated)).toBe(false);
  });

  it("rejects a PDF missing startxref but containing %%EOF", () => {
    const noXref = enc.encode("%PDF-1.4\nbody\n%%EOF\n");
    expect(isPlausiblePdf(noXref)).toBe(false);
  });

  it("rejects content without the %PDF- magic header", () => {
    expect(isPlausiblePdf(enc.encode("JVBERi0xLjQK...base64-text...%%EOF\nstartxref\n"))).toBe(false);
    expect(isPlausiblePdf(enc.encode("not a pdf at all"))).toBe(false);
  });

  it("rejects empty and tiny inputs", () => {
    expect(isPlausiblePdf(new Uint8Array(0))).toBe(false);
    expect(isPlausiblePdf(enc.encode("%PDF-"))).toBe(false);
  });

  it("rejects the observed corruption pattern: base64-length payload with header but no trailer", () => {
    // Simulates the Emil Strid case: starts with %PDF- but the tail is missing.
    const corrupt = new Uint8Array(148750);
    corrupt.set(enc.encode("%PDF-1.4\n"), 0);
    corrupt.fill(0x61, 10); // 'a' filler, no startxref/%%EOF anywhere
    expect(isPlausiblePdf(corrupt)).toBe(false);
  });
});

describe("base64 route decoding (MCP tool contract)", () => {
  it("decodes base64 to the exact original byte length, not 4/3 of it", () => {
    const original = validPdf();
    const base64 = btoa(String.fromCharCode(...original));
    // Same decoding as the MCP tool's pdf_base64 branch:
    const bin = atob(base64.replace(/^data:[^,]*,/, "").replace(/\s/g, ""));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    expect(bytes.length).toBe(original.length);
    expect(bytes.length).not.toBe(Math.ceil(original.length / 3) * 4);
    expect(isPlausiblePdf(bytes)).toBe(true);
  });

  it("strips a data-URL prefix before decoding", () => {
    const original = validPdf();
    const dataUrl = "data:application/pdf;base64," + btoa(String.fromCharCode(...original));
    const bin = atob(dataUrl.replace(/^data:[^,]*,/, "").replace(/\s/g, ""));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    expect(bytes.length).toBe(original.length);
    expect(isPlausiblePdf(bytes)).toBe(true);
  });
});
