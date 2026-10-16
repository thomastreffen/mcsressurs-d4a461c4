export type CompanyModule = 'resource_plan' | 'planning' | 'customers' | 'hms' | 'finance' | 'organisation' | 'employees' | 'documents';
export type AccessLevel = 'view' | 'edit' | 'admin';
export interface CompanyModuleGrant {
  company_id: string;
  company_name: string;
  org_number: string | null;
  module: string;
  can_view: boolean;
  can_edit: boolean;
  can_admin: boolean;
  is_home: boolean;
}
export function permitsModule(rows: CompanyModuleGrant[], companyId: string | null, module: CompanyModule, level: AccessLevel = 'view') {
  return rows.some(row => (!companyId || row.company_id === companyId) && row.module === module && row[`can_${level}`]);
}
// Self-service pages: open to every authenticated employee regardless of company-module
// grants. Access to the underlying data is already scoped by row-level security
// (own person/employment/assignment), so these must never be blocked by the module gate.
const SELF_SERVICE_PREFIXES = [
  '/hms/handbok',
  '/hms/mine-kjemikalier',
  '/hms/klar-for-arbeid',
];

export function moduleForPath(path: string): CompanyModule | null {
  if (path.startsWith('/admin/')) return null;
  if (SELF_SERVICE_PREFIXES.some(p => path.startsWith(p))) return null;
  if (path.startsWith('/compliance/organisasjon')) return 'organisation';
  if (path.startsWith('/hms/people') || path.startsWith('/employees')) return 'employees';
  if (path.startsWith('/hms') || path.startsWith('/compliance')) return 'hms';
  if (path.startsWith('/planlegging')) return 'planning';
  if (path.startsWith('/customers')) return 'customers';
  if (path.startsWith('/sales') || path.startsWith('/invoice-basis') || path.startsWith('/projects/contracts')) return 'finance';
  // Only the planner-facing Ressursplan calendar requires the resource_plan grant.
  // The general job list/detail (/projects, /jobs/:id) and personal absence requests
  // (/absence) are scoped by job participation / ownership via RLS and stay open to
  // every authenticated employee.
  if (path.startsWith('/projects/plan')) return 'resource_plan';
  return null;
}
export function moduleForMenu(key: string): CompanyModule | null {
  if (['sales','invoice_basis','management'].includes(key)) return 'finance';
  // 'projects', 'absence' and 'calendar' are self-service menu entries (own jobs,
  // own absence, own confirmations) scoped by RLS — not gated by the resource_plan
  // company grant. Only the dedicated Ressursplan entry needs that grant, and it
  // already matches via the key list below.
  if (['resource_plan','planning','customers','hms','finance','organisation','employees','documents'].includes(key)) return key as CompanyModule;
  return null;
}