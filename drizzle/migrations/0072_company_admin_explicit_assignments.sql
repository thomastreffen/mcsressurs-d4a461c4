CREATE TABLE public.company_admin_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.internal_companies(id),
  granted_by uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE UNIQUE INDEX company_admin_assignments_active_uniq ON public.company_admin_assignments(auth_user_id, company_id) WHERE revoked_at IS NULL;
GRANT SELECT, INSERT, UPDATE ON public.company_admin_assignments TO authenticated;
GRANT ALL ON public.company_admin_assignments TO service_role;
ALTER TABLE public.company_admin_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmin reads company admin assignments" ON public.company_admin_assignments FOR SELECT TO authenticated USING (public.is_global_superadmin(auth.uid()) OR auth_user_id = auth.uid());
CREATE POLICY "Superadmin grants company admin" ON public.company_admin_assignments FOR INSERT TO authenticated WITH CHECK (public.is_global_superadmin(auth.uid()) AND auth_user_id <> auth.uid());
CREATE POLICY "Superadmin revokes company admin" ON public.company_admin_assignments FOR UPDATE TO authenticated USING (public.is_global_superadmin(auth.uid())) WITH CHECK (public.is_global_superadmin(auth.uid()));
COMMENT ON TABLE public.company_admin_assignments IS 'Explicit company-admin tier. Empty until approved diff; legacy admin role never implies company admin.';

CREATE OR REPLACE FUNCTION public.is_company_admin(_auth_user_id uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _company_id IS NOT NULL AND (
    public.is_global_superadmin(_auth_user_id)
    OR EXISTS (
      SELECT 1 FROM public.company_admin_assignments a
      JOIN public.user_memberships m ON m.user_id = a.auth_user_id AND m.company_id = a.company_id AND m.is_active
      WHERE a.auth_user_id = _auth_user_id AND a.company_id = _company_id AND a.revoked_at IS NULL
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.event_company_id(_event_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM public.events WHERE id = _event_id
$$;
REVOKE ALL ON FUNCTION public.event_company_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_company_id(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.event_company_id(uuid) IS 'Resource company resolver for future company-aware admin policies. Not yet used.';