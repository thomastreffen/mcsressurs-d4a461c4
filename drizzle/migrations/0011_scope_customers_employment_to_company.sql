-- Rolle «Planlegger/Admin» (admin.manage_users) ga tidligere innsyn i kunder og ansatte i ALLE selskaper.
-- Nå: super admin ser alt; øvrige admins/brukere kun selskaper de er aktivt medlem av.
CREATE OR REPLACE FUNCTION public.is_active_member_of(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _company_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_memberships um
    WHERE um.user_id = auth.uid() AND um.company_id = _company_id AND um.is_active = true)
$$;
GRANT EXECUTE ON FUNCTION public.is_active_member_of(uuid) TO authenticated;

DROP POLICY IF EXISTS "Admins can manage customers" ON public.customers;
DROP POLICY IF EXISTS "Users can view customers" ON public.customers;
CREATE POLICY "Users can view customers" ON public.customers FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_active_member_of(company_id));
CREATE POLICY "Admins can manage customers" ON public.customers FOR ALL TO authenticated
  USING (public.is_admin() AND (public.is_super_admin(auth.uid()) OR public.is_active_member_of(company_id)))
  WITH CHECK (public.is_admin() AND (public.is_super_admin(auth.uid()) OR public.is_active_member_of(company_id)));

DROP POLICY IF EXISTS "Admins can manage customer_contacts" ON public.customer_contacts;
DROP POLICY IF EXISTS "Users can view customer_contacts" ON public.customer_contacts;
CREATE POLICY "Users can view customer_contacts" ON public.customer_contacts FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.customers c WHERE c.id = customer_contacts.customer_id AND public.is_active_member_of(c.company_id)));
CREATE POLICY "Admins can manage customer_contacts" ON public.customer_contacts FOR ALL TO authenticated
  USING (public.is_admin() AND (public.is_super_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.customers c WHERE c.id = customer_contacts.customer_id AND public.is_active_member_of(c.company_id))))
  WITH CHECK (public.is_admin() AND (public.is_super_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.customers c WHERE c.id = customer_contacts.customer_id AND public.is_active_member_of(c.company_id))));

DROP POLICY IF EXISTS "Admins can manage employment_profiles" ON public.employment_profiles;
DROP POLICY IF EXISTS "Company members can read employment_profiles" ON public.employment_profiles;
CREATE POLICY "Company members can read employment_profiles" ON public.employment_profiles FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_active_member_of(company_id));
CREATE POLICY "Admins can manage employment_profiles" ON public.employment_profiles FOR ALL TO authenticated
  USING (public.is_admin() AND (public.is_super_admin(auth.uid()) OR public.is_active_member_of(company_id)))
  WITH CHECK (public.is_admin() AND (public.is_super_admin(auth.uid()) OR public.is_active_member_of(company_id)));