/** v2 is authoritative per role: a scoped v2 role applies only in its company and suppresses its legacy v1 copy. */
export function mergeScopedRoleIds(
  v1RoleIds: string[],
  v2Roles: { role_id: string; scope_company_id: string | null }[],
  activeCompanyId: string | null | undefined,
): string[] {
  const v2Ids = new Set(v2Roles.map((r) => r.role_id));
  const out = v1RoleIds.filter((id) => !v2Ids.has(id));
  for (const r of v2Roles) {
    const applies = !r.scope_company_id || r.scope_company_id === activeCompanyId;
    if (applies && !out.includes(r.role_id)) out.push(r.role_id);
  }
  return out;
}
