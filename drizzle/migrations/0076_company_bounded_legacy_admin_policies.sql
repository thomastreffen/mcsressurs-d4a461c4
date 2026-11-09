-- Bound the legacy is_admin() branch to the row's own company (direct column or validated parent) on 59 tables.
-- Global superadmin keeps full access; legacy admin/admin.manage_users only where the caller is an active member.
-- Only the is_admin() branch is rewritten; all other branches of each policy are unchanged.
-- Exact pre-change definitions and rollback: .lovable/security-2026-11-09/company-bounded-admin.rollback.sql
DO $mig$
DECLARE m record; p record; q text; w text; stmt text; n int := 0;
BEGIN
  FOR m IN SELECT * FROM (VALUES
    ('absence_requests', $e$absence_requests.company_id$e$),
    ('ai_match_runs', $e$public.schedule_block_company_id(ai_match_runs.schedule_block_id)$e$),
    ('calc_cases', $e$calc_cases.company_id$e$),
    ('calculation_items', $e$public.calculation_company_id(calculation_items.calculation_id)$e$),
    ('calculations', $e$calculations.company_id$e$),
    ('case_items', $e$case_items.company_id$e$),
    ('case_routing_rules', $e$case_routing_rules.company_id$e$),
    ('cases', $e$cases.company_id$e$),
    ('company_reminder_settings', $e$company_reminder_settings.company_id$e$),
    ('confirmation_learnings', $e$confirmation_learnings.company_id$e$),
    ('contract_alerts', $e$contract_alerts.company_id$e$),
    ('cross_company_access_grants', $e$cross_company_access_grants.source_company_id$e$),
    ('customer_accounts', $e$customer_accounts.company_id$e$),
    ('customer_contacts', $e$public.customer_company_id(customer_contacts.customer_id)$e$),
    ('customer_portal_project_access', $e$public.event_company_id(customer_portal_project_access.project_id)$e$),
    ('customer_portal_users', $e$customer_portal_users.company_id$e$),
    ('customers', $e$customers.company_id$e$),
    ('document_analyses', $e$public.document_company_id(document_analyses.document_id)$e$),
    ('documents', $e$documents.company_id$e$),
    ('employment_profiles', $e$employment_profiles.company_id$e$),
    ('event_logs', $e$public.event_company_id(event_logs.event_id)$e$),
    ('event_technicians', $e$public.event_company_id(event_technicians.event_id)$e$),
    ('events', $e$events.company_id$e$),
    ('fag_answers', $e$fag_answers.company_id$e$),
    ('fag_company_profiles', $e$fag_company_profiles.company_id$e$),
    ('fag_requests', $e$fag_requests.company_id$e$),
    ('form_instances', $e$form_instances.company_id$e$),
    ('form_signatures', $e$public.form_instance_company_id(form_signatures.instance_id)$e$),
    ('form_template_versions', $e$public.form_template_company_id(form_template_versions.template_id)$e$),
    ('form_templates', $e$form_templates.company_id$e$),
    ('inbox_messages', $e$inbox_messages.company_id$e$),
    ('invoice_basis', $e$invoice_basis.company_id$e$),
    ('job_approvals', $e$public.event_company_id(job_approvals.job_id)$e$),
    ('job_calendar_audit', $e$public.event_company_id(job_calendar_audit.job_id)$e$),
    ('job_calendar_links', $e$public.event_company_id(job_calendar_links.job_id)$e$),
    ('job_change_order_events', $e$public.event_company_id(job_change_order_events.job_id)$e$),
    ('job_change_orders', $e$public.event_company_id(job_change_orders.job_id)$e$),
    ('job_document_links', $e$job_document_links.company_id$e$),
    ('job_participants', $e$public.event_company_id(job_participants.job_id)$e$),
    ('job_risk_items', $e$public.event_company_id(job_risk_items.job_id)$e$),
    ('job_summaries', $e$public.event_company_id(job_summaries.job_id)$e$),
    ('job_task_notes', $e$public.job_task_company_id(job_task_notes.task_id)$e$),
    ('job_tasks', $e$public.event_company_id(job_tasks.job_id)$e$),
    ('lead_calendar_links', $e$public.lead_company_id(lead_calendar_links.lead_id)$e$),
    ('lead_history', $e$public.lead_company_id(lead_history.lead_id)$e$),
    ('lead_participants', $e$public.lead_company_id(lead_participants.lead_id)$e$),
    ('leads', $e$leads.company_id$e$),
    ('notifications', $e$notifications.company_id$e$),
    ('offers', $e$offers.company_id$e$),
    ('order_form_catalog_settings', $e$order_form_catalog_settings.company_id$e$),
    ('order_form_categories', $e$order_form_categories.company_id$e$),
    ('portal_notification_preferences', $e$public.portal_user_company_id(portal_notification_preferences.portal_user_id)$e$),
    ('portal_notifications', $e$public.portal_user_company_id(portal_notifications.portal_user_id)$e$),
    ('regulation_queries', $e$regulation_queries.company_id$e$),
    ('service_jobs', $e$service_jobs.company_id$e$),
    ('superoffice_settings', $e$superoffice_settings.company_id$e$),
    ('task_assignees', $e$public.task_company_id(task_assignees.task_id)$e$),
    ('task_attachments', $e$public.task_company_id(task_attachments.task_id)$e$),
    ('work_orders', $e$work_orders.company_id$e$)
  ) AS v(tbl, expr) LOOP
    FOR p IN SELECT pol.polname, pg_get_expr(pol.polqual, pol.polrelid) AS q, pg_get_expr(pol.polwithcheck, pol.polrelid) AS w
             FROM pg_policy pol WHERE pol.polrelid = ('public.' || m.tbl)::regclass
               AND (coalesce(pg_get_expr(pol.polqual, pol.polrelid),'') || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid),'')) ~ '\mis_admin\(\)' LOOP
      q := regexp_replace(p.q, '\mis_admin\(\)', 'public.legacy_admin_in_company(' || m.expr || ')', 'g');
      w := regexp_replace(p.w, '\mis_admin\(\)', 'public.legacy_admin_in_company(' || m.expr || ')', 'g');
      stmt := format('ALTER POLICY %I ON public.%I', p.polname, m.tbl);
      IF q IS NOT NULL THEN stmt := stmt || ' USING (' || q || ')'; END IF;
      IF w IS NOT NULL THEN stmt := stmt || ' WITH CHECK (' || w || ')'; END IF;
      EXECUTE stmt; n := n + 1;
    END LOOP;
  END LOOP;
  IF n <> 120 THEN RAISE EXCEPTION 'Expected 120 policies, rewrote %', n; END IF;
END $mig$;