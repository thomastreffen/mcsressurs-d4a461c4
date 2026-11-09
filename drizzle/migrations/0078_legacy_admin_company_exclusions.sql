CREATE TABLE public.legacy_admin_company_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.internal_companies(id),
  reason text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid
);
CREATE UNIQUE INDEX legacy_admin_company_exclusions_active_uq ON public.legacy_admin_company_exclusions(auth_user_id, company_id) WHERE revoked_at IS NULL;
GRANT SELECT, INSERT, UPDATE ON public.legacy_admin_company_exclusions TO authenticated;
GRANT ALL ON public.legacy_admin_company_exclusions TO service_role;
ALTER TABLE public.legacy_admin_company_exclusions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "superadmin manages admin exclusions" ON public.legacy_admin_company_exclusions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'super_admin'::app_role));
CREATE POLICY "own admin exclusions readable" ON public.legacy_admin_company_exclusions FOR SELECT TO authenticated USING (auth_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.legacy_admin_excluded(_uid uuid, _company uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT _company IS NOT NULL AND EXISTS (SELECT 1 FROM public.legacy_admin_company_exclusions x WHERE x.auth_user_id=_uid AND x.company_id=_company AND x.revoked_at IS NULL) $$;
REVOKE ALL ON FUNCTION public.legacy_admin_excluded(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.legacy_admin_excluded(uuid,uuid) TO anon, authenticated, service_role;

-- Company-bounded legacy admin, now also honouring explicit per-company admin exclusions (operative membership untouched).
CREATE OR REPLACE FUNCTION public.legacy_admin_in_company(_company uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.has_role(auth.uid(),'super_admin'::app_role)
   OR (public.is_admin() AND (_company IS NULL OR (public.is_active_member_of(_company) AND NOT public.legacy_admin_excluded(auth.uid(), _company)))) $$;