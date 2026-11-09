-- Company-bounded legacy admin: global superadmin everywhere; legacy admin/admin.manage_users only in companies with active membership.
-- Rows without a resolvable company keep the previous admin behaviour (documented residual).
CREATE OR REPLACE FUNCTION public.legacy_admin_in_company(_company uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.has_role(auth.uid(),'super_admin'::app_role)
   OR (public.is_admin() AND (_company IS NULL OR public.is_active_member_of(_company))) $$;
CREATE OR REPLACE FUNCTION public.lead_company_id(_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT company_id FROM public.leads WHERE id=_id $$;
CREATE OR REPLACE FUNCTION public.calculation_company_id(_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT company_id FROM public.calculations WHERE id=_id $$;
CREATE OR REPLACE FUNCTION public.customer_company_id(_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT company_id FROM public.customers WHERE id=_id $$;
CREATE OR REPLACE FUNCTION public.document_company_id(_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT company_id FROM public.documents WHERE id=_id $$;
CREATE OR REPLACE FUNCTION public.form_instance_company_id(_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT company_id FROM public.form_instances WHERE id=_id $$;
CREATE OR REPLACE FUNCTION public.form_template_company_id(_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT company_id FROM public.form_templates WHERE id=_id $$;
CREATE OR REPLACE FUNCTION public.schedule_block_company_id(_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT company_id FROM public.schedule_blocks WHERE id=_id $$;
CREATE OR REPLACE FUNCTION public.portal_user_company_id(_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT company_id FROM public.customer_portal_users WHERE id=_id $$;
CREATE OR REPLACE FUNCTION public.task_company_id(_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT company_id FROM public.tasks WHERE id=_id $$;
CREATE OR REPLACE FUNCTION public.job_task_company_id(_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT e.company_id FROM public.job_tasks jt JOIN public.events e ON e.id=jt.job_id WHERE jt.id=_id $$;
REVOKE ALL ON FUNCTION public.legacy_admin_in_company(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.legacy_admin_in_company(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.lead_company_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lead_company_id(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.calculation_company_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculation_company_id(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.customer_company_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_company_id(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.document_company_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.document_company_id(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.form_instance_company_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.form_instance_company_id(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.form_template_company_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.form_template_company_id(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.schedule_block_company_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.schedule_block_company_id(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_user_company_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_user_company_id(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_company_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.task_company_id(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.job_task_company_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.job_task_company_id(uuid) TO anon, authenticated, service_role;
