// Target admin tiers (mirrors public.is_global_superadmin / is_company_admin).
// Not yet authoritative: database policies still use is_admin() until an approved diff is activated.
export interface AdminTierInput {
  appRoles: string[];
  activeCompanyIds: string[];
}

export function isGlobalSuperadmin(u: AdminTierInput): boolean {
  return u.appRoles.includes("super_admin");
}

export function isCompanyAdmin(u: AdminTierInput, companyId: string | null | undefined): boolean {
  if (!companyId) return false;
  if (isGlobalSuperadmin(u)) return true;
  return u.appRoles.includes("admin") && u.activeCompanyIds.includes(companyId);
}

/** Only global superadmins may change roles, permissions or memberships. */
export function canManageAccess(u: AdminTierInput): boolean {
  return isGlobalSuperadmin(u);
}
