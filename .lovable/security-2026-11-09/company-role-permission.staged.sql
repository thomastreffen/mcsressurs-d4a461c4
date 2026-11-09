-- NOT APPLIED: effective operational diff and v1 fallback removal approval required.
CREATE OR REPLACE FUNCTION public.company_role_permission(_uid uuid, _company uuid, _perm text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
SELECT COALESCE(
 (SELECT o.mode='allow' FROM public.user_permission_overrides_v2 o JOIN public.user_accounts a ON a.id=o.user_account_id WHERE a.auth_user_id=_uid AND a.is_active AND o.permission_key=_perm AND (o.scope_company_id IS NULL OR o.scope_company_id=_company) ORDER BY o.scope_company_id NULLS LAST LIMIT 1),
 (SELECT o.allowed FROM public.user_permission_overrides o WHERE o.user_id=_uid AND o.permission_key=_perm LIMIT 1),
 (SELECT bool_or(rp.allowed) FROM public.role_permissions rp WHERE rp.permission_key=_perm AND rp.role_id IN (
 SELECT um.role_id FROM public.user_memberships um WHERE um.user_id=_uid AND um.company_id=_company AND um.is_active AND um.role_id IS NOT NULL
 UNION SELECT r.role_id FROM public.user_role_assignments r WHERE r.user_id=_uid AND NOT EXISTS(SELECT 1 FROM public.user_memberships um WHERE um.user_id=_uid AND um.company_id=_company AND um.is_active AND um.role_id IS NOT NULL)
 UNION SELECT r.role_id FROM public.user_roles_v2 r JOIN public.user_accounts a ON a.id=r.user_account_id WHERE a.auth_user_id=_uid AND a.is_active AND (r.scope_company_id IS NULL OR r.scope_company_id=_company) AND NOT EXISTS(SELECT 1 FROM public.user_memberships um WHERE um.user_id=_uid AND um.company_id=_company AND um.is_active AND um.role_id IS NOT NULL)
 )),false)
$function$
;
