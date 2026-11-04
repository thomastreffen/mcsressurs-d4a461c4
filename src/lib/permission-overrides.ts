export type OverrideMode = "allow" | "deny";
export type OverrideRow = { permission_key: string; mode: OverrideMode; scope_company_id: string | null; scope_department_id?: string | null };
export function visibleOverrides(rows: OverrideRow[], company: string | null): Record<string, OverrideMode> {
  return Object.fromEntries(rows.filter(r => r.scope_company_id === null || r.scope_company_id === company).filter(r => !r.scope_department_id).map(r => [r.permission_key, r.mode]));
}
/** Send changed keys only. Never copy inherited global rows into a company scope. */
export function overrideChanges(rows: OverrideRow[], company: string | null, draft: Record<string, OverrideMode>, scope: string) {
  const before = visibleOverrides(rows, company);
  const after = { ...draft };
  for (const key of Object.keys(after)) if (key.startsWith("scope.view.")) delete after[key];
  if (scope !== "inherit") after[scope] = "allow";
  const changes: { permission_key: string; mode: OverrideMode | null; expected: OverrideRow | null }[] = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[key] === after[key]) continue;
    const existing = rows.find(r => r.permission_key === key);
    if (existing && (existing.scope_company_id !== company || existing.scope_department_id)) {
      throw new Error(`Rettigheten ${key} har allerede en global eller annen avgrensning. Endre den i opprinnelig omfang; den kan ikke kopieres til valgt selskap.`);
    }
    changes.push({ permission_key: key, mode: after[key] ?? null, expected: existing ?? null });
  }
  return changes;
}
export function toggleEffectiveOverride(roleAllowed: boolean, current?: OverrideMode): OverrideMode | undefined {
  const allowed = current ? current === "allow" : roleAllowed;
  const desired = !allowed;
  return desired === roleAllowed ? undefined : desired ? "allow" : "deny";
}