CREATE OR REPLACE FUNCTION public.admin_tier_shadow_diff()
RETURNS TABLE(auth_user_id uuid, full_name text, legacy_admin boolean, legacy_super_admin boolean, v1_manage_users boolean, is_admin_now boolean, superadmin_after boolean, company_admin_after text[], member_of text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT au.id, p.full_name,
    public.has_role(au.id,'admin'), public.has_role(au.id,'super_admin'),
    public.check_permission(au.id,'admin.manage_users'),
    (public.has_role(au.id,'admin') OR public.has_role(au.id,'super_admin') OR public.check_permission(au.id,'admin.manage_users')),
    public.is_global_superadmin(au.id),
    ARRAY(SELECT DISTINCT c.name FROM user_memberships m JOIN internal_companies c ON c.id=m.company_id WHERE m.user_id=au.id AND m.is_active AND public.is_company_admin(au.id,m.company_id)),
    ARRAY(SELECT DISTINCT c.name FROM user_memberships m JOIN internal_companies c ON c.id=m.company_id WHERE m.user_id=au.id AND m.is_active)
  FROM auth.users au
  LEFT JOIN user_accounts ua ON ua.auth_user_id=au.id AND ua.is_active
  LEFT JOIN people p ON p.id=ua.person_id
  WHERE public.is_global_superadmin(auth.uid())
    AND (public.has_role(au.id,'admin') OR public.has_role(au.id,'super_admin') OR public.check_permission(au.id,'admin.manage_users'))
$$;
REVOKE ALL ON FUNCTION public.admin_tier_shadow_diff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_tier_shadow_diff() TO authenticated;
COMMENT ON FUNCTION public.admin_tier_shadow_diff() IS 'Read-only shadow diff: current is_admin() vs target tiers. Superadmin only. Changes nothing.';