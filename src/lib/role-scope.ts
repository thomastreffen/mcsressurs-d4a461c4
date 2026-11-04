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

/** Role ids to remove/add when the editor saves; unchanged role ids (incl. their scoped rows) are left untouched. */
export function roleAssignmentDiff(saved: string[], next: string[]) {
  const s = new Set(saved), n = new Set(next);
  return { removed: [...s].filter((r) => !n.has(r)), added: [...n].filter((r) => !s.has(r)) };
}
