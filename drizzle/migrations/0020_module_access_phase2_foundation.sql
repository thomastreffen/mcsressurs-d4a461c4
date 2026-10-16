CREATE OR REPLACE FUNCTION public.company_role_permission(_uid uuid, _company uuid, _perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT COALESCE(
 (SELECT o.mode='allow' FROM public.user_permission_overrides_v2 o JOIN public.user_accounts a ON a.id=o.user_account_id WHERE a.auth_user_id=_uid AND a.is_active AND o.permission_key=_perm AND (o.scope_company_id IS NULL OR o.scope_company_id=_company) ORDER BY o.scope_company_id NULLS LAST LIMIT 1),
 (SELECT o.allowed FROM public.user_permission_overrides o WHERE o.user_id=_uid AND o.permission_key=_perm LIMIT 1),
 (SELECT bool_or(rp.allowed) FROM public.role_permissions rp WHERE rp.permission_key=_perm AND rp.role_id IN (
 SELECT um.role_id FROM public.user_memberships um WHERE um.user_id=_uid AND um.company_id=_company AND um.is_active AND um.role_id IS NOT NULL
 UNION SELECT r.role_id FROM public.user_role_assignments r WHERE r.user_id=_uid AND NOT EXISTS(SELECT 1 FROM public.user_memberships um WHERE um.user_id=_uid AND um.company_id=_company AND um.is_active AND um.role_id IS NOT NULL)
 UNION SELECT r.role_id FROM public.user_roles_v2 r JOIN public.user_accounts a ON a.id=r.user_account_id WHERE a.auth_user_id=_uid AND a.is_active AND NOT EXISTS(SELECT 1 FROM public.user_memberships um WHERE um.user_id=_uid AND um.company_id=_company AND um.is_active AND um.role_id IS NOT NULL)
 )),false)
$$;
CREATE OR REPLACE FUNCTION public.has_company_access(_uid uuid,_company uuid,_module text,_level text DEFAULT 'view')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT _uid IS NOT NULL AND _company IS NOT NULL AND _module IN ('resource_plan','planning','customers','hms','finance','organisation','employees','documents') AND _level IN ('view','edit','admin')
AND EXISTS(SELECT 1 FROM public.user_accounts a WHERE a.auth_user_id=_uid AND a.is_active)
AND (public.is_super_admin(_uid)
 OR EXISTS(SELECT 1 FROM public.company_module_access g WHERE g.user_id=_uid AND g.company_id=_company AND g.module=_module AND g.revoked_at IS NULL AND (g.valid_from IS NULL OR g.valid_from<=current_date) AND (g.valid_to IS NULL OR g.valid_to>=current_date) AND (CASE g.level WHEN 'admin' THEN 3 WHEN 'edit' THEN 2 ELSE 1 END)>=(CASE _level WHEN 'admin' THEN 3 WHEN 'edit' THEN 2 ELSE 1 END))
 OR (_module='planning' AND EXISTS(SELECT 1 FROM public.planning_company_access g WHERE g.user_id=_uid AND g.company_id=_company))
 OR (public.is_employee_of(_uid,_company) AND (public.has_role(_uid,'admin') OR CASE _module
 WHEN 'planning' THEN _level='view' OR _level='edit'
 WHEN 'resource_plan' THEN CASE _level WHEN 'view' THEN public.company_role_permission(_uid,_company,'resourceplan.view') OR public.company_role_permission(_uid,_company,'module.resource_plan') WHEN 'edit' THEN public.company_role_permission(_uid,_company,'resourceplan.schedule') OR public.company_role_permission(_uid,_company,'resource_plan.plan_resources') OR public.company_role_permission(_uid,_company,'calendar.write_events') ELSE public.company_role_permission(_uid,_company,'calendar.delete_events') END
 WHEN 'hms' THEN public.company_role_permission(_uid,_company,CASE WHEN _level='view' THEN 'hms.view' ELSE 'hms.manage' END)
 WHEN 'organisation' THEN public.company_role_permission(_uid,_company,CASE WHEN _level='view' THEN 'hms.view' ELSE 'hms.manage' END)
 WHEN 'employees' THEN public.company_role_permission(_uid,_company,CASE WHEN _level='view' THEN 'hms.view' ELSE 'hms.manage' END)
 WHEN 'finance' THEN public.company_role_permission(_uid,_company,'jobs.view_pricing')
 WHEN 'customers' THEN public.company_role_permission(_uid,_company,CASE WHEN _level='view' THEN 'jobs.view' ELSE 'jobs.edit' END)
 WHEN 'documents' THEN public.company_role_permission(_uid,_company,CASE WHEN _level='view' THEN 'jobs.view' ELSE 'jobs.edit' END)
 ELSE false END)));
$$;
CREATE OR REPLACE FUNCTION public.has_hms_view(_auth_user_id uuid,_company_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.has_company_access(_auth_user_id,_company_id,'hms','view') $$;
CREATE OR REPLACE FUNCTION public.has_hms_manage(_auth_user_id uuid,_company_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.has_company_access(_auth_user_id,_company_id,'hms','edit') $$;
CREATE OR REPLACE FUNCTION public.can_plan_for_company(_uid uuid,_company_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.has_company_access(_uid,_company_id,'planning','edit') $$;
CREATE OR REPLACE FUNCTION public.my_company_module_access()
RETURNS TABLE(company_id uuid,company_name text,org_number text,module text,can_view boolean,can_edit boolean,can_admin boolean,is_home boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT c.id,c.name,c.org_number,m.key,public.has_company_access(auth.uid(),c.id,m.key,'view'),public.has_company_access(auth.uid(),c.id,m.key,'edit'),public.has_company_access(auth.uid(),c.id,m.key,'admin'),public.is_employee_of(auth.uid(),c.id)
 FROM public.internal_companies c CROSS JOIN unnest(ARRAY['resource_plan','planning','customers','hms','finance','organisation','employees','documents']) m(key)
 WHERE public.has_company_access(auth.uid(),c.id,m.key,'view') ORDER BY c.name,m.key
$$;
REVOKE ALL ON FUNCTION public.my_company_module_access() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_company_module_access() TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.company_role_permission(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.company_role_permission(uuid,uuid,text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.resource_plan_personnel(_company_ids uuid[])
RETURNS TABLE(id uuid,user_id uuid,name text,color text,avatar_id text,company_id uuid,company_name text,department_id uuid,department_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT t.id,t.user_id,p.full_name,COALESCE(ep.color,t.color),t.avatar_id,ep.company_id,c.name,ep.department_id,d.name
FROM public.employment_profiles ep JOIN public.people p ON p.id=ep.person_id JOIN public.user_accounts a ON a.person_id=p.id AND a.is_active JOIN public.technicians t ON t.user_id=a.auth_user_id AND t.archived_at IS NULL
JOIN public.internal_companies c ON c.id=ep.company_id LEFT JOIN public.departments d ON d.id=ep.department_id
WHERE ep.archived_at IS NULL AND ep.is_plannable_resource AND p.is_active AND ep.company_id=ANY(_company_ids) AND public.has_company_access(auth.uid(),ep.company_id,'resource_plan','view') ORDER BY p.full_name
$$;
REVOKE ALL ON FUNCTION public.resource_plan_personnel(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resource_plan_personnel(uuid[]) TO authenticated,service_role;