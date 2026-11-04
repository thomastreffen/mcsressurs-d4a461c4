export const HUB_ORIGIN = "https://mcsressurs.lovable.app";
export const jobInfoPath = (id: string) => `/job-info/${encodeURIComponent(id)}`;
export const jobInfoUrl = (id: string) => `${HUB_ORIGIN}${jobInfoPath(id)}`;
export function attachmentLocation(a: Record<string, unknown>, storageOrigin: string): { bucket: string; path: string } | null {
  const allowed = new Set(["job-attachments", "order-form-attachments", "planning-files"]);
  if (typeof a.bucket === "string" && typeof a.path === "string" && allowed.has(a.bucket) && !a.path.includes("..")) return { bucket: a.bucket, path: a.path };
  if (typeof a.url !== "string") return null;
  try {
    const u = new URL(a.url);
    if (u.origin !== new URL(storageOrigin).origin) return null;
    const match = u.pathname.match(/^\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
    if (!match || !allowed.has(match[1])) return null;
    const path = decodeURIComponent(match[2]);
    return path.includes("..") ? null : { bucket: match[1], path };
  } catch { return null; }
}
export function jobAttachmentLinks(id: string, attachments: unknown): string {
  const count = Array.isArray(attachments) ? attachments.length : 0;
  return `<p><a href="${jobInfoUrl(id)}">Åpne jobbinfo og vedlegg i MCS Hub${count ? ` (${count} vedlegg)` : ""}</a></p><p>Jobbinfo er tilgjengelig etter godkjenning. Innlogging og gjeldende jobbtilgang kreves.</p>`;
}