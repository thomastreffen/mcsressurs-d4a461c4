CREATE OR REPLACE FUNCTION public.person_has_employment(_person_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.employment_profiles WHERE person_id = _person_id)
$$;
GRANT EXECUTE ON FUNCTION public.person_has_employment(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.person_has_employment(uuid) FROM anon, public;

DROP POLICY IF EXISTS "Users can read people in their companies" ON public.people;
CREATE POLICY "Users can read people in their companies" ON public.people FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR EXISTS (SELECT 1 FROM public.employment_profiles ep WHERE ep.person_id = people.id AND public.is_company_member(auth.uid(), ep.company_id))
  OR EXISTS (SELECT 1 FROM public.user_accounts ua WHERE ua.person_id = people.id AND ua.auth_user_id = auth.uid())
  OR (public.is_admin() AND NOT public.person_has_employment(people.id))
);
DROP POLICY IF EXISTS "Admins can manage people" ON public.people;
CREATE POLICY "Admins can manage people" ON public.people FOR ALL TO authenticated
USING (public.is_admin() AND (
  public.is_super_admin(auth.uid())
  OR EXISTS (SELECT 1 FROM public.employment_profiles ep WHERE ep.person_id = people.id AND public.is_active_member_of(ep.company_id))
  OR NOT public.person_has_employment(people.id)))
WITH CHECK (public.is_admin());