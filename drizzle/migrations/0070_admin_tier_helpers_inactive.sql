CREATE OR REPLACE FUNCTION public.is_global_superadmin(_auth_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_auth_user_id, 'super_admin'::app_role)
$$;

CREATE OR REPLACE FUNCTION public.is_company_admin(_auth_user_id uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _company_id IS NOT NULL AND (
    public.is_global_superadmin(_auth_user_id)
    OR (public.has_role(_auth_user_id, 'admin'::app_role) AND EXISTS (
      SELECT 1 FROM public.user_memberships m
      WHERE m.user_id = _auth_user_id AND m.company_id = _company_id AND m.is_active
    ))
  )
$$;

COMMENT ON FUNCTION public.is_global_superadmin(uuid) IS 'Target tier 1. Not yet used by policies; activation requires approved diff.';
COMMENT ON FUNCTION public.is_company_admin(uuid, uuid) IS 'Target tier 2 (company-bound, never role/permission management). Not yet used by policies.';
REVOKE ALL ON FUNCTION public.is_global_superadmin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_company_admin(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_global_superadmin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_company_admin(uuid, uuid) TO authenticated, service_role;