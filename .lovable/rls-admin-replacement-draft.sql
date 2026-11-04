-- UTKAST – IKKE KJØRT. Krever separat godkjenning (fase 3 D).
-- Erstatter is_admin() i policyer med selskapsbevisste kontroller. Gamle policyer droppes
-- først etter at nye er lagt inn og skygge-diff er godkjent, i samme transaksjon.

-- T1 Tilgangsstyring og systemoppsett → kun global superadmin
-- user_roles, user_roles_v2, user_role_assignments, user_permission_overrides(_v2),
-- user_memberships, permissions, user_scopes, cross_company_access_grants,
-- tenant_settings, settings, superoffice_settings, mailboxes, contract_cron_runs,
-- import_logs, import_results, ai_match_runs, audit_log
-- Mønster:
--   USING (public.is_global_superadmin(auth.uid()))
--   WITH CHECK (public.is_global_superadmin(auth.uid()) AND <mål-bruker> <> auth.uid())  -- ingen selv-tildeling

-- T2 Direkte company_id → selskapsadmin i radens selskap
-- calc_cases, calculations, case_items, case_routing_rules, cases, contract_alerts,
-- customer_accounts, customer_portal_users, documents, events, fag_answers,
-- fag_company_profiles, fag_requests, form_instances, form_templates, inbox_messages,
-- invoice_basis, job_document_links, leads, offers, order_form_catalog_settings,
-- order_form_categories, regulation_queries, service_jobs, work_orders, notifications
-- Mønster (UPDATE trenger begge for å hindre flytting til annet selskap):
--   USING (public.is_company_admin(auth.uid(), company_id))
--   WITH CHECK (public.is_company_admin(auth.uid(), company_id))

-- T3 Via forelder → selskap slås opp server-side
-- job_id/event_id/task_id → public.event_company_id(...):
--   document_analyses, event_logs, event_technicians, job_approvals, job_calendar_audit,
--   job_calendar_links, job_change_order_events, job_change_orders, job_participants,
--   job_risk_items, job_summaries, job_tasks, job_task_notes, task_assignees, task_attachments
-- lead_id → leads.company_id: lead_calendar_links, lead_history, lead_participants
-- calculation_id → calculations.company_id: calculation_items
-- project_id → events.company_id: customer_portal_project_access
-- portal_user_id → customer_portal_users.company_id: portal_notifications, portal_notification_preferences
-- entity_type/entity_id (polymorft): activity_log, communication_logs → ny resolver per entity_type
-- user_id → aktiv employment_profiles.company_id: technicians, user_documents
-- Uten anker (må få company_id eller forelder før migrering): form_pdf_imports,
--   form_signatures, form_template_versions
-- Mønster:
--   USING (public.is_company_admin(auth.uid(), public.event_company_id(job_id)))
-- Ukjent forelder → NULL → false (ingen tilgang).

-- Eksempel, ikke kjørt:
-- CREATE POLICY "Company admin manages job_tasks v2" ON public.job_tasks FOR ALL TO authenticated
--   USING (public.is_company_admin(auth.uid(), public.event_company_id(job_id)))
--   WITH CHECK (public.is_company_admin(auth.uid(), public.event_company_id(job_id)));
-- DROP POLICY "<gammel is_admin-policy>" ON public.job_tasks;

-- Aktiveringsrekkefølge mot lockout:
-- 1 A: Simen super_admin  2 kontroll Thomas+Simen  3 T1  4 T2  5 T3  6 B/C  7 etterkontroll
