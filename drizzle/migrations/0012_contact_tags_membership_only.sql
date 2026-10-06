DROP POLICY IF EXISTS "Members read contact tags" ON public.customer_contact_tags;
DROP POLICY IF EXISTS "Members insert contact tags" ON public.customer_contact_tags;
DROP POLICY IF EXISTS "Members update contact tags" ON public.customer_contact_tags;
DROP POLICY IF EXISTS "Members delete contact tags" ON public.customer_contact_tags;
CREATE POLICY "Members read contact tags" ON public.customer_contact_tags FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_active_member_of(company_id));
CREATE POLICY "Members insert contact tags" ON public.customer_contact_tags FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_active_member_of(company_id));
CREATE POLICY "Members update contact tags" ON public.customer_contact_tags FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_active_member_of(company_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_active_member_of(company_id));
CREATE POLICY "Members delete contact tags" ON public.customer_contact_tags FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_active_member_of(company_id));