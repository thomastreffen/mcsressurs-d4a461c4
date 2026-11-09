-- Owner-ordered preservation: Stian Aarstad's effective rights must stay unchanged; explicit, audited retention instead of implicit global admin.
CREATE TABLE public.legacy_admin_global_retention (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid
);
CREATE UNIQUE INDEX legacy_admin_global_retention_active_uq ON public.legacy_admin_global_retention(auth_user_id) WHERE revoked_at IS NULL;
GRANT SELECT, INSERT, UPDATE ON public.legacy_admin_global_retention TO authenticated;
GRANT ALL ON public.legacy_admin_global_retention TO service_role;
ALTER TABLE public.legacy_admin_global_retention ENABLE ROW LEVEL SECURITY;
CREATE POLICY "superadmin manages retention" ON public.legacy_admin_global_retention FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'super_admin'::app_role));
INSERT INTO public.legacy_admin_global_retention(auth_user_id, reason)
SELECT '88d51d9b-a6cb-40e8-9f24-3466caf2faad','Eierkrav 09.11.2026: Stian Aarstads rettigheter skal forbli uendret inntil egen beslutning'
WHERE NOT EXISTS (SELECT 1 FROM public.legacy_admin_global_retention WHERE auth_user_id='88d51d9b-a6cb-40e8-9f24-3466caf2faad' AND revoked_at IS NULL);

CREATE TABLE public.security_company_backfill_log (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  company_id uuid NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.security_company_backfill_log TO service_role;
GRANT SELECT ON public.security_company_backfill_log TO authenticated;
ALTER TABLE public.security_company_backfill_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "superadmin reads backfill log" ON public.security_company_backfill_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'super_admin'::app_role));

CREATE OR REPLACE FUNCTION public.legacy_admin_global_retained(_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.legacy_admin_global_retention r WHERE r.auth_user_id=_uid AND r.revoked_at IS NULL) $$;

-- Strict: rows without a resolvable company are superadmin-only (plus explicit retention).
CREATE OR REPLACE FUNCTION public.legacy_admin_in_company(_company uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.has_role(auth.uid(),'super_admin'::app_role)
   OR (public.is_admin() AND (
        public.legacy_admin_global_retained(auth.uid())
        OR (_company IS NOT NULL AND public.is_active_member_of(_company) AND NOT public.legacy_admin_excluded(auth.uid(), _company)))) $$;

-- Lenient variant only for Postkontoret intake rows that are not yet assigned to a company.
CREATE OR REPLACE FUNCTION public.legacy_admin_in_company_or_unassigned(_company uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.legacy_admin_in_company(_company) OR (_company IS NULL AND public.is_admin()) $$;

CREATE OR REPLACE FUNCTION public.account_auth_user(_account uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT auth_user_id FROM public.user_accounts WHERE id=_account $$;

-- Legacy admin over another login: only via a shared, active, non-excluded company membership.
CREATE OR REPLACE FUNCTION public.legacy_admin_over_user(_target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.has_role(auth.uid(),'super_admin'::app_role)
  OR (public.is_admin() AND (public.legacy_admin_global_retained(auth.uid())
      OR (_target IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_memberships t
           WHERE t.user_id=_target AND t.is_active AND public.legacy_admin_in_company(t.company_id))))) $$;

CREATE OR REPLACE FUNCTION public.legacy_admin_over_person(_person uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.legacy_admin_in_company(NULL)
  OR EXISTS (SELECT 1 FROM public.employment_profiles ep WHERE ep.person_id=_person AND ep.archived_at IS NULL AND public.legacy_admin_in_company(ep.company_id)) $$;

CREATE OR REPLACE FUNCTION public.fag_request_company_id(_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT company_id FROM public.fag_requests WHERE id=_id $$;
CREATE OR REPLACE FUNCTION public.conversation_thread_company_id(_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT company_id FROM public.conversation_threads WHERE id=_id $$;

CREATE OR REPLACE FUNCTION public.storage_first_uuid(_name text) RETURNS uuid
LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT CASE WHEN split_part(_name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN split_part(_name,'/',1)::uuid END $$;

CREATE OR REPLACE FUNCTION public.activity_entity_company(_type text, _id uuid, _commercial_case uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT coalesce(
  CASE _type
    WHEN 'lead' THEN (SELECT company_id FROM public.leads WHERE id=_id)
    WHEN 'job' THEN (SELECT company_id FROM public.events WHERE id=_id)
    WHEN 'event' THEN (SELECT company_id FROM public.events WHERE id=_id)
    WHEN 'project' THEN (SELECT company_id FROM public.events WHERE id=_id)
    WHEN 'schedule_block' THEN (SELECT company_id FROM public.schedule_blocks WHERE id=_id)
    WHEN 'conversation_thread' THEN (SELECT company_id FROM public.conversation_threads WHERE id=_id)
    WHEN 'compliance_competence' THEN (SELECT company_id FROM public.compliance_competences WHERE id=_id)
    WHEN 'offer' THEN (SELECT company_id FROM public.offers WHERE id=_id)
    WHEN 'calculation' THEN (SELECT company_id FROM public.calculations WHERE id=_id)
    WHEN 'customer' THEN (SELECT company_id FROM public.customers WHERE id=_id)
  END,
  (SELECT company_id FROM public.commercial_cases WHERE id=_commercial_case)) $$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['legacy_admin_global_retained(uuid)','legacy_admin_in_company_or_unassigned(uuid)','account_auth_user(uuid)','legacy_admin_over_user(uuid)','legacy_admin_over_person(uuid)','fag_request_company_id(uuid)','conversation_thread_company_id(uuid)','storage_first_uuid(text)','activity_entity_company(text,uuid,uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon, authenticated, service_role', f);
  END LOOP;
END $$;

-- Postkontoret: unassigned intake rows keep previous admin visibility (documented, pending decision).
DO $$ DECLARE r record; q text; w text; BEGIN
  FOR r IN SELECT p.polname, pg_get_expr(p.polqual,p.polrelid) q, pg_get_expr(p.polwithcheck,p.polrelid) w
           FROM pg_policy p WHERE p.polrelid='public.inbox_messages'::regclass LOOP
    q := replace(r.q,'legacy_admin_in_company(','legacy_admin_in_company_or_unassigned(');
    w := replace(r.w,'legacy_admin_in_company(','legacy_admin_in_company_or_unassigned(');
    IF q IS DISTINCT FROM r.q THEN EXECUTE format('ALTER POLICY %I ON public.inbox_messages USING (%s)', r.polname, q); END IF;
    IF w IS DISTINCT FROM r.w THEN EXECUTE format('ALTER POLICY %I ON public.inbox_messages WITH CHECK (%s)', r.polname, w); END IF;
  END LOOP;
END $$;

-- Access sources: reads/manage only through shared company (writes stay superadmin-gated by restrictive policies).
ALTER POLICY "Admins can manage memberships" ON public.user_memberships USING (public.legacy_admin_in_company(company_id)) WITH CHECK (public.legacy_admin_in_company(company_id));
ALTER POLICY "Users can view own memberships" ON public.user_memberships USING ((user_id = auth.uid()) OR public.legacy_admin_in_company(company_id));
ALTER POLICY "Admins can manage overrides" ON public.user_permission_overrides USING (public.legacy_admin_over_user(user_id)) WITH CHECK (public.legacy_admin_over_user(user_id));
ALTER POLICY "Users can view own overrides" ON public.user_permission_overrides USING ((user_id = auth.uid()) OR public.legacy_admin_over_user(user_id));
ALTER POLICY "Admins manage overrides_v2" ON public.user_permission_overrides_v2 USING (public.legacy_admin_over_user(public.account_auth_user(user_account_id))) WITH CHECK (public.legacy_admin_over_user(public.account_auth_user(user_account_id)));
ALTER POLICY "Users read own permission overrides" ON public.user_permission_overrides_v2 USING (public.legacy_admin_over_user(public.account_auth_user(user_account_id)) OR (EXISTS (SELECT 1 FROM public.user_accounts ua WHERE ua.id = user_permission_overrides_v2.user_account_id AND ua.auth_user_id = auth.uid())));
ALTER POLICY "Admins can manage role assignments" ON public.user_role_assignments USING (public.legacy_admin_over_user(user_id)) WITH CHECK (public.legacy_admin_over_user(user_id));
ALTER POLICY "Users can view own assignments" ON public.user_role_assignments USING ((user_id = auth.uid()) OR public.legacy_admin_over_user(user_id));
ALTER POLICY "Admins can view all roles" ON public.user_roles USING (public.legacy_admin_over_user(user_id) OR (user_id = auth.uid()));
ALTER POLICY "Admins manage user_roles_v2" ON public.user_roles_v2 USING (public.legacy_admin_over_user(public.account_auth_user(user_account_id))) WITH CHECK (public.legacy_admin_over_user(public.account_auth_user(user_account_id)));
ALTER POLICY "Users read own role assignments" ON public.user_roles_v2 USING (public.legacy_admin_over_user(public.account_auth_user(user_account_id)) OR (EXISTS (SELECT 1 FROM public.user_accounts ua WHERE ua.id = user_roles_v2.user_account_id AND ua.auth_user_id = auth.uid())));
ALTER POLICY "Admins manage user_scopes" ON public.user_scopes USING (public.legacy_admin_over_user(public.account_auth_user(user_account_id))) WITH CHECK (public.legacy_admin_over_user(public.account_auth_user(user_account_id)));
ALTER POLICY "Users read own scopes" ON public.user_scopes USING (public.legacy_admin_over_user(public.account_auth_user(user_account_id)) OR (EXISTS (SELECT 1 FROM public.user_accounts ua WHERE ua.id = user_scopes.user_account_id AND ua.auth_user_id = auth.uid())));
ALTER POLICY "Admins manage permissions" ON public.permissions USING (public.legacy_admin_in_company(NULL)) WITH CHECK (public.legacy_admin_in_company(NULL));
ALTER POLICY "Admins can manage user_accounts" ON public.user_accounts USING (public.legacy_admin_in_company(company_id)) WITH CHECK (public.legacy_admin_in_company(company_id));

-- People / personnel.
ALTER POLICY "Admins can manage people" ON public.people USING (public.legacy_admin_over_person(id) OR (NOT public.person_has_employment(id) AND public.legacy_admin_in_company(NULL)));
ALTER POLICY "Users can read people in their companies" ON public.people USING (public.is_super_admin(auth.uid()) OR (EXISTS (SELECT 1 FROM public.employment_profiles ep WHERE ep.person_id = people.id AND public.is_company_member(auth.uid(), ep.company_id))) OR (EXISTS (SELECT 1 FROM public.user_accounts ua WHERE ua.person_id = people.id AND ua.auth_user_id = auth.uid())) OR (public.legacy_admin_in_company(NULL) AND NOT public.person_has_employment(id)));
ALTER POLICY "Admins can delete technicians" ON public.technicians USING (public.legacy_admin_over_user(user_id));
ALTER POLICY "Admins can insert technicians" ON public.technicians WITH CHECK (public.legacy_admin_over_user(user_id));
ALTER POLICY "Admins can update technicians" ON public.technicians USING (public.legacy_admin_over_user(user_id));
ALTER POLICY "Admins can manage user_documents" ON public.user_documents USING (public.legacy_admin_over_user(user_id)) WITH CHECK (public.legacy_admin_over_user(user_id));

-- Polymorphic logs: resolved through the entity's company; unresolvable rows are superadmin-only.
ALTER POLICY "Admins can manage activity_log" ON public.activity_log USING (public.legacy_admin_in_company(public.activity_entity_company(entity_type, entity_id, commercial_case_id))) WITH CHECK (public.legacy_admin_in_company(public.activity_entity_company(entity_type, entity_id, commercial_case_id)));
ALTER POLICY "Lead participants can view activity_log" ON public.activity_log USING (public.legacy_admin_in_company(public.activity_entity_company(entity_type, entity_id, commercial_case_id)) OR ((entity_type = 'lead') AND (EXISTS (SELECT 1 FROM public.lead_participants lp WHERE lp.lead_id = activity_log.entity_id AND lp.user_id = auth.uid()))));
ALTER POLICY "Admins can manage communication_logs" ON public.communication_logs USING (public.legacy_admin_in_company(public.activity_entity_company(entity_type, entity_id, NULL))) WITH CHECK (public.legacy_admin_in_company(public.activity_entity_company(entity_type, entity_id, NULL)));
ALTER POLICY "Users can view own communication_logs" ON public.communication_logs USING (public.legacy_admin_in_company(public.activity_entity_company(entity_type, entity_id, NULL)) OR (created_by = auth.uid()) OR ((entity_type = 'lead') AND (EXISTS (SELECT 1 FROM public.lead_participants lp WHERE lp.lead_id = communication_logs.entity_id AND lp.user_id = auth.uid()))) OR ((entity_type = 'job') AND (EXISTS (SELECT 1 FROM public.job_participants jp WHERE jp.job_id = communication_logs.entity_id AND jp.user_id = auth.uid()))));
ALTER POLICY "Admins manage form_pdf_imports" ON public.form_pdf_imports USING (public.legacy_admin_in_company(coalesce(public.document_company_id(source_document_id), public.form_template_company_id(template_id)))) WITH CHECK (public.legacy_admin_in_company(coalesce(public.document_company_id(source_document_id), public.form_template_company_id(template_id))));

-- System config: management superadmin-only (reads of shared defaults unchanged).
ALTER POLICY "Admins can manage mailboxes" ON public.mailboxes USING (public.legacy_admin_in_company(NULL)) WITH CHECK (public.legacy_admin_in_company(NULL));

-- Storage: admin branch bound to the folder's owning record.
ALTER POLICY "Admins can delete attachments" ON storage.objects USING ((bucket_id = 'job-attachments') AND public.legacy_admin_in_company(public.event_company_id(public.storage_first_uuid(name))));
ALTER POLICY "Admins can delete job attachments" ON storage.objects USING ((bucket_id = 'job-attachments') AND public.legacy_admin_in_company(public.event_company_id(public.storage_first_uuid(name))));
ALTER POLICY "Admins can view attachments" ON storage.objects USING ((bucket_id = 'job-attachments') AND public.legacy_admin_in_company(public.event_company_id(public.storage_first_uuid(name))));
ALTER POLICY "Admins can upload attachments" ON storage.objects WITH CHECK ((bucket_id = 'job-attachments') AND public.legacy_admin_in_company(public.event_company_id(public.storage_first_uuid(name))));
ALTER POLICY "Admins can delete calculation attachments" ON storage.objects USING ((bucket_id = 'calculation-attachments') AND public.legacy_admin_in_company(public.calculation_company_id(public.storage_first_uuid(name))));
ALTER POLICY "Admins can manage user docs storage" ON storage.objects USING ((bucket_id = 'user-documents') AND (public.legacy_admin_over_user(public.storage_first_uuid(name)) OR public.legacy_admin_over_person(public.storage_first_uuid(name)))) WITH CHECK ((bucket_id = 'user-documents') AND (public.legacy_admin_over_user(public.storage_first_uuid(name)) OR public.legacy_admin_over_person(public.storage_first_uuid(name))));
ALTER POLICY "fag_delete" ON storage.objects USING ((bucket_id = 'fag-attachments') AND public.legacy_admin_in_company(public.fag_request_company_id(public.storage_first_uuid(name))));
ALTER POLICY "fag_read" ON storage.objects USING ((bucket_id = 'fag-attachments') AND (public.legacy_admin_in_company(public.fag_request_company_id(public.storage_first_uuid(name))) OR public.check_permission(auth.uid(), 'fag.view')));
ALTER POLICY "fag_write" ON storage.objects WITH CHECK ((bucket_id = 'fag-attachments') AND (public.legacy_admin_in_company(public.fag_request_company_id(public.storage_first_uuid(name))) OR public.check_permission(auth.uid(), 'fag.create')));

CREATE OR REPLACE FUNCTION public.can_view_planning_finance()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.legacy_admin_in_company(NULL) OR public.check_permission_v2(auth.uid(), 'jobs.view_pricing') $$;