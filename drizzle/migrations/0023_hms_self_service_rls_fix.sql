-- Fix: phase-2's has_hms_view/has_company_access('hms',...) tightening unintentionally
-- blocked employee self-service HMS reads (own chemical catalog, own SDS acknowledgement
-- status, own handbook distribution/ack status, own competence rows). These flows must
-- work for every active company member, not only users holding hms.view/hms.manage.

-- 1) Chemical catalog: any active member of the company may read it (safety info
--    needed by everyone, not just hms-permission holders). Write access stays
--    restricted via the existing has_hms_manage / phase2_module_* policies.
CREATE POLICY "hms chemicals self-service view"
ON public.hms_chemicals
FOR SELECT
USING (public.is_active_member_of(company_id));

-- 2) Own chemical acknowledgement rows: a user must be able to see their own
--    acknowledgement status even without hms.view (mirrors the existing
--    hms_handbook_ack_select pattern that already allows user_id = auth.uid()).
CREATE POLICY "hms chem ack self view"
ON public.hms_chemical_acknowledgements
FOR SELECT
USING (
  user_id = auth.uid()
  OR person_id IN (SELECT ua.person_id FROM public.user_accounts ua WHERE ua.auth_user_id = auth.uid())
);

-- 3) Own handbook distribution/recipient rows: needed so "Klar for arbeid" and
--    "Min HMS-håndbok" can tell whether the required chapters were sent/acknowledged.
CREATE POLICY "hms handbook recipients self view"
ON public.hms_handbook_recipients
FOR SELECT
USING (
  user_id = auth.uid()
  OR person_id IN (SELECT ua.person_id FROM public.user_accounts ua WHERE ua.auth_user_id = auth.uid())
);

-- 4) Competence type names are a non-sensitive lookup table; any active member
--    needs them to read competence-based readiness requirements.
CREATE POLICY "compliance competence types self-service view"
ON public.compliance_competence_types
FOR SELECT
USING (public.is_active_member_of(company_id));

-- 5) Own competence rows: a user must see their own certifications/expiry dates
--    even without hms.view, for their own readiness check.
CREATE POLICY "compliance competences self view"
ON public.compliance_competences
FOR SELECT
USING (
  person_id IN (SELECT ua.person_id FROM public.user_accounts ua WHERE ua.auth_user_id = auth.uid())
);
