/** Shared live-register predicate for UI, exports and server-side response drafts. */
export function activeOrganizationRoles<T extends {
  is_active?: boolean; valid_from: string | null; valid_to: string | null;
  sort_order: number; title: string;
}>(roles: T[], today = new Date().toISOString().slice(0, 10)): T[] {
  return roles.filter(r => r.is_active !== false && (!r.valid_from || r.valid_from <= today) && (!r.valid_to || r.valid_to >= today))
    .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, "nb"));
}

export function linkedOrganizationCoverage(
  evidence: { source_kind: string; ref_id: string | null }[], companyId: string, activeRoleCount: number,
): boolean {
  return activeRoleCount > 0 && evidence.some(e => e.source_kind === "organization_overview" && e.ref_id === companyId);
}