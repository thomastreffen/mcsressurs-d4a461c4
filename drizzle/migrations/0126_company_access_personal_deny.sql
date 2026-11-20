CREATE OR REPLACE FUNCTION public.has_company_access(_uid uuid, _company uuid, _module text, _level text DEFAULT 'view'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
SELECT _uid IS NOT NULL AND _company IS NOT NULL AND _module IN ('resource_plan','planning','customers','hms','finance','organisation','employees','documents') AND _level IN ('view','edit','admin')
AND EXISTS(SELECT 1 FROM public.user_accounts a WHERE a.auth_user_id=_uid AND a.is_active)
AND (public.is_super_admin(_uid)
 OR EXISTS(SELECT 1 FROM public.company_module_access g WHERE g.user_id=_uid AND g.company_id=_company AND g.module=_module AND g.revoked_at IS NULL AND (g.valid_from IS NULL OR g.valid_from<=current_date) AND (g.valid_to IS NULL OR g.valid_to>=current_date) AND (CASE g.level WHEN 'admin' THEN 3 WHEN 'edit' THEN 2 ELSE 1 END)>=(CASE _level WHEN 'admin' THEN 3 WHEN 'edit' THEN 2 ELSE 1 END))
 OR (_module='planning' AND EXISTS(SELECT 1 FROM public.planning_company_access g WHERE g.user_id=_uid AND g.company_id=_company))
 OR (public.is_employee_of(_uid,_company)
  AND NOT EXISTS(SELECT 1 FROM public.user_permission_overrides_v2 o JOIN public.user_accounts a ON a.id=o.user_account_id WHERE a.auth_user_id=_uid AND o.permission_key='company_access.'||_module AND o.mode='deny' AND (o.scope_company_id IS NULL OR o.scope_company_id=_company))
  AND (public.has_role(_uid,'admin') OR CASE _module
 WHEN 'planning' THEN _level='view' OR _level='edit'
 WHEN 'resource_plan' THEN CASE _level WHEN 'view' THEN public.company_role_permission(_uid,_company,'resourceplan.view') OR public.company_role_permission(_uid,_company,'module.resource_plan') WHEN 'edit' THEN public.company_role_permission(_uid,_company,'resourceplan.schedule') OR public.company_role_permission(_uid,_company,'resource_plan.plan_resources') OR public.company_role_permission(_uid,_company,'calendar.write_events') ELSE public.company_role_permission(_uid,_company,'calendar.delete_events') END
 WHEN 'hms' THEN public.company_role_permission(_uid,_company,CASE WHEN _level='view' THEN 'hms.view' ELSE 'hms.manage' END)
 WHEN 'organisation' THEN public.company_role_permission(_uid,_company,CASE WHEN _level='view' THEN 'hms.view' ELSE 'hms.manage' END)
 WHEN 'employees' THEN public.company_role_permission(_uid,_company,CASE WHEN _level='view' THEN 'hms.view' ELSE 'hms.manage' END)
 WHEN 'finance' THEN public.company_role_permission(_uid,_company,'jobs.view_pricing')
 WHEN 'customers' THEN public.company_role_permission(_uid,_company,CASE WHEN _level='view' THEN 'jobs.view' ELSE 'jobs.edit' END)
 WHEN 'documents' THEN public.company_role_permission(_uid,_company,CASE WHEN _level='view' THEN 'jobs.view' ELSE 'jobs.edit' END)
 ELSE false END)));
$function$;