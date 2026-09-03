-- Fix critical tenant-isolation gap on customer_contact_tags
DROP POLICY IF EXISTS "Authenticated users can manage contact tags" ON public.customer_contact_tags;

CREATE POLICY "Members read contact tags"
  ON public.customer_contact_tags FOR SELECT TO authenticated
  USING (is_company_member(auth.uid(), company_id) OR user_has_company_access(auth.uid(), company_id));

CREATE POLICY "Members insert contact tags"
  ON public.customer_contact_tags FOR INSERT TO authenticated
  WITH CHECK (is_company_member(auth.uid(), company_id) OR user_has_company_access(auth.uid(), company_id));

CREATE POLICY "Members update contact tags"
  ON public.customer_contact_tags FOR UPDATE TO authenticated
  USING (is_company_member(auth.uid(), company_id) OR user_has_company_access(auth.uid(), company_id))
  WITH CHECK (is_company_member(auth.uid(), company_id) OR user_has_company_access(auth.uid(), company_id));

CREATE POLICY "Members delete contact tags"
  ON public.customer_contact_tags FOR DELETE TO authenticated
  USING (is_company_member(auth.uid(), company_id) OR user_has_company_access(auth.uid(), company_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_contact_tags TO authenticated;
GRANT ALL ON public.customer_contact_tags TO service_role;
REVOKE ALL ON public.customer_contact_tags FROM anon;

-- Relations must also require that the tag belongs to a company the user may access
DROP POLICY IF EXISTS "Members read contact tag relations" ON public.customer_contact_tag_relations;
DROP POLICY IF EXISTS "Members write contact tag relations" ON public.customer_contact_tag_relations;
DROP POLICY IF EXISTS "Members delete contact tag relations" ON public.customer_contact_tag_relations;

CREATE POLICY "Members read contact tag relations"
  ON public.customer_contact_tag_relations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customer_contacts cc
      JOIN public.customers cu ON cu.id = cc.customer_id
      WHERE cc.id = contact_id AND cu.company_id IS NOT NULL
        AND (is_company_member(auth.uid(), cu.company_id) OR user_has_company_access(auth.uid(), cu.company_id))
    )
    AND EXISTS (
      SELECT 1 FROM public.customer_contact_tags t
      WHERE t.id = tag_id
        AND (is_company_member(auth.uid(), t.company_id) OR user_has_company_access(auth.uid(), t.company_id))
    )
  );

CREATE POLICY "Members write contact tag relations"
  ON public.customer_contact_tag_relations FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.customer_contacts cc
      JOIN public.customers cu ON cu.id = cc.customer_id
      WHERE cc.id = contact_id AND cu.company_id IS NOT NULL
        AND (is_company_member(auth.uid(), cu.company_id) OR user_has_company_access(auth.uid(), cu.company_id))
    )
    AND EXISTS (
      SELECT 1 FROM public.customer_contact_tags t
      WHERE t.id = tag_id
        AND (is_company_member(auth.uid(), t.company_id) OR user_has_company_access(auth.uid(), t.company_id))
    )
  );

CREATE POLICY "Members delete contact tag relations"
  ON public.customer_contact_tag_relations FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customer_contacts cc
      JOIN public.customers cu ON cu.id = cc.customer_id
      WHERE cc.id = contact_id AND cu.company_id IS NOT NULL
        AND (is_company_member(auth.uid(), cu.company_id) OR user_has_company_access(auth.uid(), cu.company_id))
    )
  );

GRANT SELECT, INSERT, DELETE ON public.customer_contact_tag_relations TO authenticated;
GRANT ALL ON public.customer_contact_tag_relations TO service_role;
REVOKE ALL ON public.customer_contact_tag_relations FROM anon;