-- Company-scoped individual overrides apply only in their own company.
CREATE OR REPLACE FUNCTION public.check_permission_v2_company(_auth_user_id uuid, _perm text, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(
    (SELECT upo.mode = 'allow'
       FROM public.user_permission_overrides_v2 upo
       JOIN public.user_accounts ua ON ua.id = upo.user_account_id
      WHERE ua.auth_user_id = _auth_user_id AND ua.is_active
        AND upo.permission_key = _perm
        AND (upo.scope_company_id IS NULL OR upo.scope_company_id = _company_id)
      ORDER BY (upo.scope_company_id IS NOT NULL) DESC LIMIT 1),
    (SELECT bool_or(rp.allowed)
       FROM public.user_roles_v2 urv
       JOIN public.user_accounts ua ON ua.id = urv.user_account_id
       JOIN public.role_permissions rp ON rp.role_id = urv.role_id
      WHERE ua.auth_user_id = _auth_user_id AND ua.is_active
        AND rp.permission_key = _perm
        AND (urv.scope_company_id IS NULL OR urv.scope_company_id = _company_id)),
    false)
$$;
REVOKE ALL ON FUNCTION public.check_permission_v2_company(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_permission_v2_company(uuid, text, uuid) TO authenticated, service_role;

-- Without company context, a scoped override only counts for the user's home company.
CREATE OR REPLACE FUNCTION public.check_permission_v2(_auth_user_id uuid, _perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(
    (SELECT upo.mode = 'allow'
       FROM public.user_permission_overrides_v2 upo
       JOIN public.user_accounts ua ON ua.id = upo.user_account_id
      WHERE ua.auth_user_id = _auth_user_id AND ua.is_active
        AND upo.permission_key = _perm
        AND (upo.scope_company_id IS NULL OR upo.scope_company_id = ua.company_id)
      LIMIT 1),
    (SELECT bool_or(rp.allowed)
       FROM public.user_roles_v2 urv
       JOIN public.user_accounts ua ON ua.id = urv.user_account_id
       JOIN public.role_permissions rp ON rp.role_id = urv.role_id
      WHERE ua.auth_user_id = _auth_user_id AND ua.is_active
        AND rp.permission_key = _perm),
    false)
$$;