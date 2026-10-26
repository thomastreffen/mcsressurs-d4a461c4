/**
 * Conservative PDF plausibility check used before storing an uploaded file.
 * A valid PDF starts with "%PDF-" and ends with a "%%EOF" marker preceded by
 * a "startxref" section. Trailing bytes after %%EOF (newlines, padding) are
 * tolerated; a truncated file missing the trailer is rejected.
 */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const EOF_WINDOW = 1024; // %%EOF must appear within the last 1 KB
const XREF_WINDOW = 64 * 1024; // startxref is searched in the last 64 KB

const latin1 = new TextDecoder("latin1");

export function isPlausiblePdf(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_MAGIC.length + 8) return false;
  for (let i = 0; i < PDF_MAGIC.length; i++) {
    if (bytes[i] !== PDF_MAGIC[i]) return false;
  }
  const tail = bytes.subarray(Math.max(0, bytes.length - XREF_WINDOW));
  const tailText = latin1.decode(tail);
  if (!tailText.includes("startxref")) return false;
  const eofText = latin1.decode(bytes.subarray(Math.max(0, bytes.length - EOF_WINDOW)));
  return eofText.includes("%%EOF");
}
