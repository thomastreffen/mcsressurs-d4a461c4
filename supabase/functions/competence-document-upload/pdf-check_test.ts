import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isPlausiblePdf } from "./pdf-check.ts";

const enc = new TextEncoder();

function validPdf(extraTail = ""): Uint8Array {
  const body =
    "%PDF-1.4\n" +
    "1 0 obj\n<< /Type /Catalog >>\nendobj\n" +
    "xref\n0 2\n0000000000 65535 f \n0000000009 00000 n \n" +
    "trailer\n<< /Size 2 /Root 1 0 R >>\n" +
    "startxref\n80\n%%EOF\n";
  return enc.encode(body + extraTail);
}

Deno.test("accepts a structurally complete PDF", () => {
  assertEquals(isPlausiblePdf(validPdf()), true);
});

Deno.test("accepts trailing bytes after %%EOF", () => {
  assertEquals(isPlausiblePdf(validPdf("\n\n  \n")), true);
  assertEquals(isPlausiblePdf(validPdf("TRAILING-GARBAGE")), true);
});

Deno.test("rejects truncated PDF with header but no trailer", () => {
  assertEquals(isPlausiblePdf(validPdf().subarray(0, 40)), false);
});

Deno.test("rejects %%EOF without startxref", () => {
  assertEquals(isPlausiblePdf(enc.encode("%PDF-1.4\nbody\n%%EOF\n")), false);
});

Deno.test("rejects non-PDF content and empty input", () => {
  assertEquals(isPlausiblePdf(enc.encode("JVBERi0xLjQK base64 text")), false);
  assertEquals(isPlausiblePdf(new Uint8Array(0)), false);
});

Deno.test("rejects the observed corruption pattern (148750 bytes, header only)", () => {
  const corrupt = new Uint8Array(148750);
  corrupt.set(enc.encode("%PDF-1.4\n"), 0);
  corrupt.fill(0x61, 10);
  assertEquals(isPlausiblePdf(corrupt), false);
});
