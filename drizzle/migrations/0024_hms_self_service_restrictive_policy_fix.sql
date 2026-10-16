-- The phase-2 "phase2_module_view" / "phase2_parent_view" policies on HMS/compliance
-- tables are RESTRICTIVE, so they AND with every permissive SELECT policy regardless
-- of which one granted access. That silently vetoed the self-service carve-outs
-- (own chemicals, own handbook, own readiness) added just now and already present
-- (published-handbook, own-acknowledgement) for any employee lacking hms.view.
-- Widen each restrictive gate to also allow the same self-service conditions.

ALTER POLICY "phase2_module_view" ON public.hms_chemicals
USING (
  public.has_company_access(auth.uid(), company_id, 'hms', 'view')
  OR public.is_active_member_of(company_id)
);

ALTER POLICY "phase2_module_view" ON public.hms_chemical_acknowledgements
USING (
  public.has_company_access(auth.uid(), company_id, 'hms', 'view')
  OR user_id = auth.uid()
  OR person_id IN (SELECT ua.person_id FROM public.user_accounts ua WHERE ua.auth_user_id = auth.uid())
);

ALTER POLICY "phase2_module_view" ON public.hms_handbooks
USING (
  public.has_company_access(auth.uid(), company_id, 'hms', 'view')
  OR (status = 'published' AND public.user_has_company_access(auth.uid(), company_id))
);

ALTER POLICY "phase2_module_view" ON public.hms_handbook_versions
USING (
  public.has_company_access(auth.uid(), company_id, 'hms', 'view')
  OR (status = 'published' AND public.user_has_company_access(auth.uid(), company_id))
);

ALTER POLICY "phase2_parent_view" ON public.hms_handbook_sections
USING (
  public.parent_module_access(auth.uid(), 'hms_handbook_versions', version_id, 'hms', 'view')
  OR EXISTS (
    SELECT 1 FROM public.hms_handbook_versions v
    WHERE v.id = hms_handbook_sections.version_id
      AND v.status = 'published'
      AND public.user_has_company_access(auth.uid(), v.company_id)
  )
);

ALTER POLICY "phase2_module_view" ON public.hms_handbook_recipients
USING (
  public.has_company_access(auth.uid(), company_id, 'hms', 'view')
  OR user_id = auth.uid()
  OR person_id IN (SELECT ua.person_id FROM public.user_accounts ua WHERE ua.auth_user_id = auth.uid())
);

ALTER POLICY "phase2_module_view" ON public.hms_handbook_acknowledgements
USING (
  public.has_company_access(auth.uid(), company_id, 'hms', 'view')
  OR user_id = auth.uid()
);

ALTER POLICY "phase2_module_view" ON public.compliance_competence_types
USING (
  public.has_company_access(auth.uid(), company_id, 'hms', 'view')
  OR public.is_active_member_of(company_id)
);

ALTER POLICY "phase2_module_view" ON public.compliance_competences
USING (
  public.has_company_access(auth.uid(), company_id, 'hms', 'view')
  OR person_id IN (SELECT ua.person_id FROM public.user_accounts ua WHERE ua.auth_user_id = auth.uid())
);
