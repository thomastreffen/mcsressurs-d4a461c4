export const HUB_ORIGIN = "https://mcsressurs.lovable.app";
export const jobInfoPath = (id: string) => `/job-info/${encodeURIComponent(id)}`;
export const jobInfoUrl = (id: string) => `${HUB_ORIGIN}${jobInfoPath(id)}`;
export function jobInfoAction(id: string): string {
  return `<p style="margin:16px 0;"><a href="${jobInfoUrl(id)}" style="display:block;padding:14px 18px;min-height:20px;background:#2563b0;color:#fff;text-align:center;text-decoration:none;font-size:16px;font-weight:600;border-radius:6px;">Åpne jobbinfo</a></p>`;
}
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
  return `${jobInfoAction(id)}<p>${count ? `${count} vedlegg i Hub. ` : ""}Jobbinfo er tilgjengelig også etter at du har svart. Innlogging og gjeldende jobbtilgang kreves.</p>`;
}