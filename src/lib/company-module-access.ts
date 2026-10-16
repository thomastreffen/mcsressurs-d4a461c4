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
export function moduleForPath(path: string): CompanyModule | null {
  if (path.startsWith('/admin/')) return null;
  if (path.startsWith('/compliance/organisasjon')) return 'organisation';
  if (path.startsWith('/hms/people') || path.startsWith('/employees')) return 'employees';
  if (path.startsWith('/hms') || path.startsWith('/compliance')) return 'hms';
  if (path.startsWith('/planlegging')) return 'planning';
  if (path.startsWith('/customers')) return 'customers';
  if (path.startsWith('/sales') || path.startsWith('/invoice-basis') || path.startsWith('/projects/contracts')) return 'finance';
  if (path.startsWith('/projects') || path.startsWith('/jobs') || path.startsWith('/resource-plan') || path.startsWith('/calendar') || path.startsWith('/absence')) return 'resource_plan';
  return null;
}
export function moduleForMenu(key: string): CompanyModule | null {
  if (['sales','invoice_basis','management'].includes(key)) return 'finance';
  if (['projects','absence','calendar'].includes(key)) return 'resource_plan';
  if (['resource_plan','planning','customers','hms','finance','organisation','employees','documents'].includes(key)) return key as CompanyModule;
  return null;
}