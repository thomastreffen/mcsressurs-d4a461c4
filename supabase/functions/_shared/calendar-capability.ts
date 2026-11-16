/** Stored metadata only; never refresh or treat a calendar link as token availability. */
export function storedDelegatedAvailable(meta: Record<string, unknown>, now = Date.now()) {
  return typeof meta.ms_access_token === "string" && meta.ms_access_token.length > 0 &&
    ((typeof meta.ms_refresh_token === "string" && meta.ms_refresh_token.length > 0) ||
      (typeof meta.ms_expires_at === "string" && Date.parse(meta.ms_expires_at) > now + 300_000));
}
export function selectedCalendarRecipients<T extends { tech: { id: string } }>(rows: T[], requested: unknown, scoped: boolean) {
  if (!scoped || !Array.isArray(requested)) return rows;
  return rows.filter(r => requested.includes(r.tech.id));
}