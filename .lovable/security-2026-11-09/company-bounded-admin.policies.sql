ALTER POLICY "Admins can create events" ON public.events WITH CHECK (public.legacy_admin_in_company(events.company_id));
ALTER POLICY "Admins can delete events" ON public.events USING (public.legacy_admin_in_company(events.company_id));
ALTER POLICY "Admins can manage event_technicians" ON public.event_technicians USING (public.legacy_admin_in_company(public.event_company_id(event_technicians.event_id))) WITH CHECK (public.legacy_admin_in_company(public.event_company_id(event_technicians.event_id)));
ALTER POLICY "Admins can manage calculations" ON public.calculations USING (public.legacy_admin_in_company(calculations.company_id)) WITH CHECK (public.legacy_admin_in_company(calculations.company_id));
ALTER POLICY "Admins can manage calculation_items" ON public.calculation_items USING (public.legacy_admin_in_company(public.calculation_company_id(calculation_items.calculation_id))) WITH CHECK (public.legacy_admin_in_company(public.calculation_company_id(calculation_items.calculation_id)));
ALTER POLICY "Admins can update all, technicians own" ON public.events USING ((public.legacy_admin_in_company(events.company_id) OR (id IN ( SELECT event_technicians.event_id
   FROM event_technicians
  WHERE (event_technicians.technician_id IN ( SELECT technicians.id
           FROM technicians
          WHERE (technicians.user_id = auth.uid())))))));
ALTER POLICY "Admins can manage offers" ON public.offers USING (public.legacy_admin_in_company(offers.company_id)) WITH CHECK (public.legacy_admin_in_company(offers.company_id));
ALTER POLICY "Admins can view event_logs" ON public.event_logs USING (public.legacy_admin_in_company(public.event_company_id(event_logs.event_id)));
ALTER POLICY "Admins can insert event_logs" ON public.event_logs WITH CHECK (public.legacy_admin_in_company(public.event_company_id(event_logs.event_id)));
ALTER POLICY "Admins can view approvals" ON public.job_approvals USING (public.legacy_admin_in_company(public.event_company_id(job_approvals.job_id)));
ALTER POLICY "Admins can insert notifications" ON public.notifications WITH CHECK (public.legacy_admin_in_company(notifications.company_id));
ALTER POLICY "Users can view job-scoped queries" ON public.regulation_queries USING (((scope_type = 'job'::regulation_scope_type) AND (scope_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = regulation_queries.scope_id) AND (public.legacy_admin_in_company(regulation_queries.company_id) OR (e.id IN ( SELECT et.event_id
           FROM (event_technicians et
             JOIN technicians t ON ((t.id = et.technician_id)))
          WHERE (t.user_id = auth.uid())))))))));
ALTER POLICY "Users can view own participations" ON public.job_participants USING (((user_id = auth.uid()) OR public.legacy_admin_in_company(public.event_company_id(job_participants.job_id))));
ALTER POLICY "Admins can manage lead_participants" ON public.lead_participants USING (public.legacy_admin_in_company(public.lead_company_id(lead_participants.lead_id))) WITH CHECK (public.legacy_admin_in_company(public.lead_company_id(lead_participants.lead_id)));
ALTER POLICY "Participants can view own lead_participants" ON public.lead_participants USING (((user_id = auth.uid()) OR public.legacy_admin_in_company(public.lead_company_id(lead_participants.lead_id))));
ALTER POLICY "Admins can manage lead_history" ON public.lead_history USING (public.legacy_admin_in_company(public.lead_company_id(lead_history.lead_id))) WITH CHECK (public.legacy_admin_in_company(public.lead_company_id(lead_history.lead_id)));
ALTER POLICY "Admins can view quote and lead scoped queries" ON public.regulation_queries USING (((scope_type = ANY (ARRAY['quote'::regulation_scope_type, 'lead'::regulation_scope_type])) AND public.legacy_admin_in_company(regulation_queries.company_id)));
ALTER POLICY "Lead participants can view lead_history" ON public.lead_history USING ((public.legacy_admin_in_company(public.lead_company_id(lead_history.lead_id)) OR (EXISTS ( SELECT 1
   FROM lead_participants lp
  WHERE ((lp.lead_id = lead_history.lead_id) AND (lp.user_id = auth.uid()))))));
ALTER POLICY "Leads access by scope" ON public.leads USING ((public.legacy_admin_in_company(leads.company_id) OR
CASE get_user_scope(auth.uid())
    WHEN 'all'::text THEN true
    WHEN 'company'::text THEN (EXISTS ( SELECT 1
       FROM user_memberships um
      WHERE ((um.user_id = auth.uid()) AND (um.company_id = leads.company_id) AND (um.is_active = true))))
    ELSE ((assigned_owner_user_id = auth.uid()) OR (owner_id = auth.uid()) OR (EXISTS ( SELECT 1
       FROM lead_participants lp
      WHERE ((lp.lead_id = leads.id) AND (lp.user_id = auth.uid())))))
END));
ALTER POLICY "Leads insert by permission" ON public.leads WITH CHECK ((public.legacy_admin_in_company(leads.company_id) OR check_permission(auth.uid(), 'leads.create'::text)));
ALTER POLICY "Leads update by permission" ON public.leads USING ((public.legacy_admin_in_company(leads.company_id) OR (check_permission(auth.uid(), 'leads.edit'::text) AND
CASE get_user_scope(auth.uid())
    WHEN 'all'::text THEN true
    WHEN 'company'::text THEN (EXISTS ( SELECT 1
       FROM user_memberships um
      WHERE ((um.user_id = auth.uid()) AND (um.company_id = leads.company_id) AND (um.is_active = true))))
    ELSE ((assigned_owner_user_id = auth.uid()) OR (owner_id = auth.uid()) OR (EXISTS ( SELECT 1
       FROM lead_participants lp
      WHERE ((lp.lead_id = leads.id) AND (lp.user_id = auth.uid())))))
END)));
ALTER POLICY "Leads delete by admin" ON public.leads USING (public.legacy_admin_in_company(leads.company_id));
ALTER POLICY "Admins can manage lead_calendar_links" ON public.lead_calendar_links USING (public.legacy_admin_in_company(public.lead_company_id(lead_calendar_links.lead_id))) WITH CHECK (public.legacy_admin_in_company(public.lead_company_id(lead_calendar_links.lead_id)));
ALTER POLICY "Lead participants can view lead_calendar_links" ON public.lead_calendar_links USING ((public.legacy_admin_in_company(public.lead_company_id(lead_calendar_links.lead_id)) OR (EXISTS ( SELECT 1
   FROM lead_participants lp
  WHERE ((lp.lead_id = lead_calendar_links.lead_id) AND (lp.user_id = auth.uid()))))));
ALTER POLICY "Technicians can view own calendar links" ON public.job_calendar_links USING (((user_id = auth.uid()) OR public.legacy_admin_in_company(public.event_company_id(job_calendar_links.job_id))));
ALTER POLICY "Admins can manage calendar links" ON public.job_calendar_links USING (public.legacy_admin_in_company(public.event_company_id(job_calendar_links.job_id))) WITH CHECK (public.legacy_admin_in_company(public.event_company_id(job_calendar_links.job_id)));
ALTER POLICY "Admins can manage calendar audit" ON public.job_calendar_audit USING (public.legacy_admin_in_company(public.event_company_id(job_calendar_audit.job_id))) WITH CHECK (public.legacy_admin_in_company(public.event_company_id(job_calendar_audit.job_id)));
ALTER POLICY "Technicians can view own job audit" ON public.job_calendar_audit USING ((public.legacy_admin_in_company(public.event_company_id(job_calendar_audit.job_id)) OR (EXISTS ( SELECT 1
   FROM (event_technicians et
     JOIN technicians t ON ((t.id = et.technician_id)))
  WHERE ((et.event_id = job_calendar_audit.job_id) AND (t.user_id = auth.uid()))))));
ALTER POLICY "Admins full access regulation queries" ON public.regulation_queries USING (public.legacy_admin_in_company(regulation_queries.company_id)) WITH CHECK (public.legacy_admin_in_company(regulation_queries.company_id));
ALTER POLICY "job_summaries_insert" ON public.job_summaries WITH CHECK (public.legacy_admin_in_company(public.event_company_id(job_summaries.job_id)));
ALTER POLICY "Contract alerts insert" ON public.contract_alerts WITH CHECK (public.legacy_admin_in_company(contract_alerts.company_id));
ALTER POLICY "Contract alerts update" ON public.contract_alerts USING (((target_user_id = auth.uid()) OR public.legacy_admin_in_company(contract_alerts.company_id)));
ALTER POLICY "Contract alerts delete" ON public.contract_alerts USING (public.legacy_admin_in_company(contract_alerts.company_id));
ALTER POLICY "job_summaries_update" ON public.job_summaries USING (public.legacy_admin_in_company(public.event_company_id(job_summaries.job_id)));
ALTER POLICY "job_summaries_delete" ON public.job_summaries USING (public.legacy_admin_in_company(public.event_company_id(job_summaries.job_id)));
ALTER POLICY "Documents select" ON public.documents USING ((public.legacy_admin_in_company(documents.company_id) OR ((entity_type = 'job'::text) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = documents.entity_id) AND (public.legacy_admin_in_company(documents.company_id) OR (e.id IN ( SELECT et.event_id
           FROM (event_technicians et
             JOIN technicians t ON ((t.id = et.technician_id)))
          WHERE (t.user_id = auth.uid()))))))))));
ALTER POLICY "Documents insert" ON public.documents WITH CHECK ((public.legacy_admin_in_company(documents.company_id) OR check_permission(auth.uid(), 'jobs.edit'::text)));
ALTER POLICY "Documents update" ON public.documents USING ((public.legacy_admin_in_company(documents.company_id) OR (uploaded_by = auth.uid())));
ALTER POLICY "Documents delete" ON public.documents USING (public.legacy_admin_in_company(documents.company_id));
ALTER POLICY "Doc analyses select" ON public.document_analyses USING ((public.legacy_admin_in_company(public.document_company_id(document_analyses.document_id)) OR ((job_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = document_analyses.job_id) AND (public.legacy_admin_in_company(public.document_company_id(document_analyses.document_id)) OR (e.id IN ( SELECT et.event_id
           FROM (event_technicians et
             JOIN technicians t ON ((t.id = et.technician_id)))
          WHERE (t.user_id = auth.uid()))))))))));
ALTER POLICY "Doc analyses insert" ON public.document_analyses WITH CHECK (public.legacy_admin_in_company(public.document_company_id(document_analyses.document_id)));
ALTER POLICY "Doc analyses delete" ON public.document_analyses USING (public.legacy_admin_in_company(public.document_company_id(document_analyses.document_id)));
ALTER POLICY "job_summaries_select" ON public.job_summaries USING ((public.legacy_admin_in_company(public.event_company_id(job_summaries.job_id)) OR (EXISTS ( SELECT 1
   FROM (event_technicians et
     JOIN technicians t ON ((t.id = et.technician_id)))
  WHERE ((et.event_id = job_summaries.job_id) AND (t.user_id = auth.uid()))))));
ALTER POLICY "change_orders_select" ON public.job_change_orders USING ((public.legacy_admin_in_company(public.event_company_id(job_change_orders.job_id)) OR (EXISTS ( SELECT 1
   FROM (event_technicians et
     JOIN technicians t ON ((t.id = et.technician_id)))
  WHERE ((et.event_id = job_change_orders.job_id) AND (t.user_id = auth.uid()))))));
ALTER POLICY "change_orders_insert" ON public.job_change_orders WITH CHECK (public.legacy_admin_in_company(public.event_company_id(job_change_orders.job_id)));
ALTER POLICY "change_orders_update" ON public.job_change_orders USING (public.legacy_admin_in_company(public.event_company_id(job_change_orders.job_id)));
ALTER POLICY "change_orders_delete" ON public.job_change_orders USING (public.legacy_admin_in_company(public.event_company_id(job_change_orders.job_id)));
ALTER POLICY "co_events_select" ON public.job_change_order_events USING ((public.legacy_admin_in_company(public.event_company_id(job_change_order_events.job_id)) OR (EXISTS ( SELECT 1
   FROM (event_technicians et
     JOIN technicians t ON ((t.id = et.technician_id)))
  WHERE ((et.event_id = job_change_order_events.job_id) AND (t.user_id = auth.uid()))))));
ALTER POLICY "co_events_insert" ON public.job_change_order_events WITH CHECK (public.legacy_admin_in_company(public.event_company_id(job_change_order_events.job_id)));
ALTER POLICY "risk_items_select" ON public.job_risk_items USING ((public.legacy_admin_in_company(public.event_company_id(job_risk_items.job_id)) OR (EXISTS ( SELECT 1
   FROM (event_technicians et
     JOIN technicians t ON ((t.id = et.technician_id)))
  WHERE ((et.event_id = job_risk_items.job_id) AND (t.user_id = auth.uid()))))));
ALTER POLICY "risk_items_insert" ON public.job_risk_items WITH CHECK (public.legacy_admin_in_company(public.event_company_id(job_risk_items.job_id)));
ALTER POLICY "risk_items_update" ON public.job_risk_items USING (public.legacy_admin_in_company(public.event_company_id(job_risk_items.job_id)));
ALTER POLICY "risk_items_delete" ON public.job_risk_items USING (public.legacy_admin_in_company(public.event_company_id(job_risk_items.job_id)));
ALTER POLICY "Task notes delete" ON public.job_task_notes USING ((public.legacy_admin_in_company(public.job_task_company_id(job_task_notes.task_id)) OR (created_by = auth.uid())));
ALTER POLICY "Job tasks select" ON public.job_tasks USING ((public.legacy_admin_in_company(public.event_company_id(job_tasks.job_id)) OR (EXISTS ( SELECT 1
   FROM (event_technicians et
     JOIN technicians t ON ((t.id = et.technician_id)))
  WHERE ((et.event_id = job_tasks.job_id) AND (t.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM job_participants jp
  WHERE ((jp.job_id = job_tasks.job_id) AND (jp.user_id = auth.uid()))))));
ALTER POLICY "Job tasks insert" ON public.job_tasks WITH CHECK ((public.legacy_admin_in_company(public.event_company_id(job_tasks.job_id)) OR (EXISTS ( SELECT 1
   FROM (event_technicians et
     JOIN technicians t ON ((t.id = et.technician_id)))
  WHERE ((et.event_id = job_tasks.job_id) AND (t.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM job_participants jp
  WHERE ((jp.job_id = job_tasks.job_id) AND (jp.user_id = auth.uid()))))));
ALTER POLICY "Job tasks update" ON public.job_tasks USING ((public.legacy_admin_in_company(public.event_company_id(job_tasks.job_id)) OR (EXISTS ( SELECT 1
   FROM (event_technicians et
     JOIN technicians t ON ((t.id = et.technician_id)))
  WHERE ((et.event_id = job_tasks.job_id) AND (t.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM job_participants jp
  WHERE ((jp.job_id = job_tasks.job_id) AND (jp.user_id = auth.uid())))))) WITH CHECK ((public.legacy_admin_in_company(public.event_company_id(job_tasks.job_id)) OR (EXISTS ( SELECT 1
   FROM (event_technicians et
     JOIN technicians t ON ((t.id = et.technician_id)))
  WHERE ((et.event_id = job_tasks.job_id) AND (t.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM job_participants jp
  WHERE ((jp.job_id = job_tasks.job_id) AND (jp.user_id = auth.uid()))))));
ALTER POLICY "Job tasks delete" ON public.job_tasks USING (public.legacy_admin_in_company(public.event_company_id(job_tasks.job_id)));
ALTER POLICY "Task notes select" ON public.job_task_notes USING ((public.legacy_admin_in_company(public.job_task_company_id(job_task_notes.task_id)) OR (EXISTS ( SELECT 1
   FROM ((job_tasks jt
     JOIN event_technicians et ON ((et.event_id = jt.job_id)))
     JOIN technicians t ON ((t.id = et.technician_id)))
  WHERE ((jt.id = job_task_notes.task_id) AND (t.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (job_tasks jt
     JOIN job_participants jp ON ((jp.job_id = jt.job_id)))
  WHERE ((jt.id = job_task_notes.task_id) AND (jp.user_id = auth.uid()))))));
ALTER POLICY "Task notes insert" ON public.job_task_notes WITH CHECK ((public.legacy_admin_in_company(public.job_task_company_id(job_task_notes.task_id)) OR (EXISTS ( SELECT 1
   FROM ((job_tasks jt
     JOIN event_technicians et ON ((et.event_id = jt.job_id)))
     JOIN technicians t ON ((t.id = et.technician_id)))
  WHERE ((jt.id = job_task_notes.task_id) AND (t.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (job_tasks jt
     JOIN job_participants jp ON ((jp.job_id = jt.job_id)))
  WHERE ((jt.id = job_task_notes.task_id) AND (jp.user_id = auth.uid()))))));
ALTER POLICY "Admins can manage inbox_messages" ON public.inbox_messages USING (public.legacy_admin_in_company(inbox_messages.company_id)) WITH CHECK (public.legacy_admin_in_company(inbox_messages.company_id));
ALTER POLICY "Admins manage form_templates" ON public.form_templates USING (public.legacy_admin_in_company(form_templates.company_id)) WITH CHECK (public.legacy_admin_in_company(form_templates.company_id));
ALTER POLICY "Admins manage form_template_versions" ON public.form_template_versions USING (public.legacy_admin_in_company(public.form_template_company_id(form_template_versions.template_id))) WITH CHECK (public.legacy_admin_in_company(public.form_template_company_id(form_template_versions.template_id)));
ALTER POLICY "Admins manage form_instances" ON public.form_instances USING (public.legacy_admin_in_company(form_instances.company_id)) WITH CHECK (public.legacy_admin_in_company(form_instances.company_id));
ALTER POLICY "Admins manage form_signatures" ON public.form_signatures USING (public.legacy_admin_in_company(public.form_instance_company_id(form_signatures.instance_id))) WITH CHECK (public.legacy_admin_in_company(public.form_instance_company_id(form_signatures.instance_id)));
ALTER POLICY "Admins can manage cases" ON public.cases USING (public.legacy_admin_in_company(cases.company_id)) WITH CHECK (public.legacy_admin_in_company(cases.company_id));
ALTER POLICY "Admins can manage case_items" ON public.case_items USING (public.legacy_admin_in_company(case_items.company_id)) WITH CHECK (public.legacy_admin_in_company(case_items.company_id));
ALTER POLICY "Admins can manage routing rules" ON public.case_routing_rules USING (public.legacy_admin_in_company(case_routing_rules.company_id)) WITH CHECK (public.legacy_admin_in_company(case_routing_rules.company_id));
ALTER POLICY "Admins can manage work_orders" ON public.work_orders USING (public.legacy_admin_in_company(work_orders.company_id)) WITH CHECK (public.legacy_admin_in_company(work_orders.company_id));
ALTER POLICY "Company members can view work_orders" ON public.work_orders USING ((public.legacy_admin_in_company(work_orders.company_id) OR (EXISTS ( SELECT 1
   FROM user_memberships um
  WHERE ((um.user_id = auth.uid()) AND (um.company_id = work_orders.company_id) AND (um.is_active = true))))));
ALTER POLICY "Admins can manage service_jobs" ON public.service_jobs USING (public.legacy_admin_in_company(service_jobs.company_id)) WITH CHECK (public.legacy_admin_in_company(service_jobs.company_id));
ALTER POLICY "Company members can view service_jobs" ON public.service_jobs USING ((public.legacy_admin_in_company(service_jobs.company_id) OR (EXISTS ( SELECT 1
   FROM user_memberships um
  WHERE ((um.user_id = auth.uid()) AND (um.company_id = service_jobs.company_id) AND (um.is_active = true))))));
ALTER POLICY "Admins manage superoffice_settings" ON public.superoffice_settings USING (public.legacy_admin_in_company(superoffice_settings.company_id)) WITH CHECK (public.legacy_admin_in_company(superoffice_settings.company_id));
ALTER POLICY "Postkontor users can view company cases" ON public.cases USING (((scope = 'company'::case_scope) AND (public.legacy_admin_in_company(cases.company_id) OR (check_permission(auth.uid(), 'postkontor.view'::text) AND (EXISTS ( SELECT 1
   FROM user_memberships um
  WHERE ((um.user_id = auth.uid()) AND (um.company_id = cases.company_id) AND (um.is_active = true))))))));
ALTER POLICY "Private case access" ON public.cases USING (((scope = 'private'::case_scope) AND (public.legacy_admin_in_company(cases.company_id) OR (owner_user_id = auth.uid()) OR (auth.uid() = ANY (participant_user_ids)))));
ALTER POLICY "Postkontor users can view case_items" ON public.case_items USING ((EXISTS ( SELECT 1
   FROM cases c
  WHERE ((c.id = case_items.case_id) AND (public.legacy_admin_in_company(case_items.company_id) OR ((c.scope = 'company'::case_scope) AND check_permission(auth.uid(), 'postkontor.view'::text) AND (EXISTS ( SELECT 1
           FROM user_memberships um
          WHERE ((um.user_id = auth.uid()) AND (um.company_id = c.company_id) AND (um.is_active = true))))) OR ((c.scope = 'private'::case_scope) AND ((c.owner_user_id = auth.uid()) OR (auth.uid() = ANY (c.participant_user_ids)))))))));
ALTER POLICY "Postkontor users can insert case_items" ON public.case_items WITH CHECK ((EXISTS ( SELECT 1
   FROM cases c
  WHERE ((c.id = case_items.case_id) AND (public.legacy_admin_in_company(case_items.company_id) OR (check_permission(auth.uid(), 'postkontor.view'::text) AND ((c.owner_user_id = auth.uid()) OR (auth.uid() = ANY (c.participant_user_ids)) OR ((c.scope = 'company'::case_scope) AND (EXISTS ( SELECT 1
           FROM user_memberships um
          WHERE ((um.user_id = auth.uid()) AND (um.company_id = c.company_id) AND (um.is_active = true))))))))))));
ALTER POLICY "Postkontor users can view routing rules" ON public.case_routing_rules USING ((public.legacy_admin_in_company(case_routing_rules.company_id) OR check_permission(auth.uid(), 'postkontor.view'::text)));
ALTER POLICY "Admins manage fag_requests" ON public.fag_requests USING (public.legacy_admin_in_company(fag_requests.company_id)) WITH CHECK (public.legacy_admin_in_company(fag_requests.company_id));
ALTER POLICY "Users with fag.view can read fag_requests" ON public.fag_requests USING ((public.legacy_admin_in_company(fag_requests.company_id) OR (check_permission(auth.uid(), 'fag.view'::text) AND (EXISTS ( SELECT 1
   FROM user_memberships um
  WHERE ((um.user_id = auth.uid()) AND (um.company_id = fag_requests.company_id) AND (um.is_active = true)))))));
ALTER POLICY "Users with fag.create can insert fag_requests" ON public.fag_requests WITH CHECK ((public.legacy_admin_in_company(fag_requests.company_id) OR (check_permission(auth.uid(), 'fag.create'::text) AND (EXISTS ( SELECT 1
   FROM user_memberships um
  WHERE ((um.user_id = auth.uid()) AND (um.company_id = fag_requests.company_id) AND (um.is_active = true)))))));
ALTER POLICY "Users with fag.create can update own fag_requests" ON public.fag_requests USING ((public.legacy_admin_in_company(fag_requests.company_id) OR ((created_by_user_id = auth.uid()) AND check_permission(auth.uid(), 'fag.create'::text))));
ALTER POLICY "Admins manage fag_answers" ON public.fag_answers USING (public.legacy_admin_in_company(fag_answers.company_id)) WITH CHECK (public.legacy_admin_in_company(fag_answers.company_id));
ALTER POLICY "Users with fag.view can read fag_answers" ON public.fag_answers USING ((public.legacy_admin_in_company(fag_answers.company_id) OR (check_permission(auth.uid(), 'fag.view'::text) AND (EXISTS ( SELECT 1
   FROM user_memberships um
  WHERE ((um.user_id = auth.uid()) AND (um.company_id = fag_answers.company_id) AND (um.is_active = true)))))));
ALTER POLICY "System can insert fag_answers" ON public.fag_answers WITH CHECK (public.legacy_admin_in_company(fag_answers.company_id));
ALTER POLICY "Insert notifications" ON public.notifications WITH CHECK ((public.legacy_admin_in_company(notifications.company_id) OR (user_id = auth.uid())));
ALTER POLICY "Task assignees select" ON public.task_assignees USING ((public.legacy_admin_in_company(public.task_company_id(task_assignees.task_id)) OR (EXISTS ( SELECT 1
   FROM (tasks t
     JOIN user_memberships um ON ((um.company_id = t.company_id)))
  WHERE ((t.id = task_assignees.task_id) AND (um.user_id = auth.uid()) AND (um.is_active = true))))));
ALTER POLICY "Task assignees manage" ON public.task_assignees USING ((public.legacy_admin_in_company(public.task_company_id(task_assignees.task_id)) OR (EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = task_assignees.task_id) AND (t.created_by = auth.uid())))))) WITH CHECK ((public.legacy_admin_in_company(public.task_company_id(task_assignees.task_id)) OR (EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = task_assignees.task_id) AND (t.created_by = auth.uid()))))));
ALTER POLICY "Task attachments select" ON public.task_attachments USING ((public.legacy_admin_in_company(public.task_company_id(task_attachments.task_id)) OR (EXISTS ( SELECT 1
   FROM (tasks t
     JOIN user_memberships um ON ((um.company_id = t.company_id)))
  WHERE ((t.id = task_attachments.task_id) AND (um.user_id = auth.uid()) AND (um.is_active = true))))));
ALTER POLICY "Task attachments manage" ON public.task_attachments USING ((public.legacy_admin_in_company(public.task_company_id(task_attachments.task_id)) OR (EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = task_attachments.task_id) AND (t.created_by = auth.uid())))))) WITH CHECK ((public.legacy_admin_in_company(public.task_company_id(task_attachments.task_id)) OR (EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = task_attachments.task_id) AND (t.created_by = auth.uid()))))));
ALTER POLICY "Admins can delete job_document_links" ON public.job_document_links USING (public.legacy_admin_in_company(job_document_links.company_id));
ALTER POLICY "Company members can insert absence requests" ON public.absence_requests WITH CHECK ((is_company_member(auth.uid(), company_id) AND ((requested_by = auth.uid()) OR public.legacy_admin_in_company(absence_requests.company_id))));
ALTER POLICY "Portal users can read own profile" ON public.customer_portal_users USING (((auth_user_id = auth.uid()) OR public.legacy_admin_in_company(customer_portal_users.company_id)));
ALTER POLICY "Admins can manage portal users" ON public.customer_portal_users USING (public.legacy_admin_in_company(customer_portal_users.company_id)) WITH CHECK (public.legacy_admin_in_company(customer_portal_users.company_id));
ALTER POLICY "Portal users can read own project access" ON public.customer_portal_project_access USING (((portal_user_id IN ( SELECT customer_portal_users.id
   FROM customer_portal_users
  WHERE (customer_portal_users.auth_user_id = auth.uid()))) OR public.legacy_admin_in_company(public.event_company_id(customer_portal_project_access.project_id))));
ALTER POLICY "Admins can manage project access" ON public.customer_portal_project_access USING (public.legacy_admin_in_company(public.event_company_id(customer_portal_project_access.project_id))) WITH CHECK (public.legacy_admin_in_company(public.event_company_id(customer_portal_project_access.project_id)));
ALTER POLICY "Portal users can read own account" ON public.customer_accounts USING (((id IN ( SELECT customer_portal_users.account_id
   FROM customer_portal_users
  WHERE (customer_portal_users.auth_user_id = auth.uid()))) OR public.legacy_admin_in_company(customer_accounts.company_id)));
ALTER POLICY "Admins can manage accounts" ON public.customer_accounts USING (public.legacy_admin_in_company(customer_accounts.company_id)) WITH CHECK (public.legacy_admin_in_company(customer_accounts.company_id));
ALTER POLICY "Portal users can read account members" ON public.customer_portal_users USING (((auth_user_id = auth.uid()) OR ((account_id IS NOT NULL) AND (account_id IN ( SELECT cpu2.account_id
   FROM customer_portal_users cpu2
  WHERE ((cpu2.auth_user_id = auth.uid()) AND (cpu2.portal_role = 'customer_admin'::text))))) OR public.legacy_admin_in_company(customer_portal_users.company_id)));
ALTER POLICY "Account users can read account project access" ON public.customer_portal_project_access USING (((portal_user_id IN ( SELECT customer_portal_users.id
   FROM customer_portal_users
  WHERE (customer_portal_users.auth_user_id = auth.uid()))) OR ((account_id IS NOT NULL) AND (account_id IN ( SELECT customer_portal_users.account_id
   FROM customer_portal_users
  WHERE (customer_portal_users.auth_user_id = auth.uid())))) OR public.legacy_admin_in_company(public.event_company_id(customer_portal_project_access.project_id))));
ALTER POLICY "Admins manage all preferences" ON public.portal_notification_preferences USING (public.legacy_admin_in_company(public.portal_user_company_id(portal_notification_preferences.portal_user_id))) WITH CHECK (public.legacy_admin_in_company(public.portal_user_company_id(portal_notification_preferences.portal_user_id)));
ALTER POLICY "System can insert notifications" ON public.portal_notifications USING (public.legacy_admin_in_company(public.portal_user_company_id(portal_notifications.portal_user_id))) WITH CHECK (public.legacy_admin_in_company(public.portal_user_company_id(portal_notifications.portal_user_id)));
ALTER POLICY "Admins manage invoice_basis" ON public.invoice_basis USING (public.legacy_admin_in_company(invoice_basis.company_id)) WITH CHECK (public.legacy_admin_in_company(invoice_basis.company_id));
ALTER POLICY "Users can read own company fag profile" ON public.fag_company_profiles USING (((EXISTS ( SELECT 1
   FROM user_memberships um
  WHERE ((um.user_id = auth.uid()) AND (um.company_id = fag_company_profiles.company_id) AND (um.is_active = true)))) OR public.legacy_admin_in_company(fag_company_profiles.company_id)));
ALTER POLICY "Admins can manage fag profiles" ON public.fag_company_profiles USING (public.legacy_admin_in_company(fag_company_profiles.company_id)) WITH CHECK (public.legacy_admin_in_company(fag_company_profiles.company_id));
ALTER POLICY "Admins can manage categories" ON public.order_form_categories USING (public.legacy_admin_in_company(order_form_categories.company_id));
ALTER POLICY "Admins can manage catalog settings" ON public.order_form_catalog_settings USING (public.legacy_admin_in_company(order_form_catalog_settings.company_id));
ALTER POLICY "Company admins or requester can update absence requests" ON public.absence_requests USING ((is_company_member(auth.uid(), company_id) AND ((requested_by = auth.uid()) OR public.legacy_admin_in_company(absence_requests.company_id)))) WITH CHECK (is_company_member(auth.uid(), company_id));
ALTER POLICY "Admins can view ai_match_runs" ON public.ai_match_runs USING (public.legacy_admin_in_company(public.schedule_block_company_id(ai_match_runs.schedule_block_id)));
ALTER POLICY "Company members can read confirmation_learnings" ON public.confirmation_learnings USING (((company_id IS NULL) OR is_company_member(auth.uid(), company_id) OR public.legacy_admin_in_company(confirmation_learnings.company_id)));
ALTER POLICY "Users can view inbox_messages" ON public.inbox_messages USING ((public.legacy_admin_in_company(inbox_messages.company_id) OR (owner_user_id = auth.uid()) OR (auth.uid() = ANY (participant_user_ids)) OR (fetched_by = auth.uid()) OR ((visibility = 'team'::text) AND (company_id IS NOT NULL) AND is_company_member(auth.uid(), company_id))));
ALTER POLICY "Admins manage cross-company grants" ON public.cross_company_access_grants USING (public.legacy_admin_in_company(cross_company_access_grants.source_company_id));
ALTER POLICY "Company admins or requester can delete absence requests" ON public.absence_requests USING ((is_company_member(auth.uid(), company_id) AND ((requested_by = auth.uid()) OR public.legacy_admin_in_company(absence_requests.company_id))));
ALTER POLICY "Admins can manage calc_cases" ON public.calc_cases USING (public.legacy_admin_in_company(calc_cases.company_id)) WITH CHECK (public.legacy_admin_in_company(calc_cases.company_id));
ALTER POLICY "Admins manage company reminder settings" ON public.company_reminder_settings USING ((public.legacy_admin_in_company(company_reminder_settings.company_id) AND user_has_company_access(auth.uid(), company_id))) WITH CHECK ((public.legacy_admin_in_company(company_reminder_settings.company_id) AND user_has_company_access(auth.uid(), company_id)));
ALTER POLICY "Members read form_signatures" ON public.form_signatures USING ((public.legacy_admin_in_company(public.form_instance_company_id(form_signatures.instance_id)) OR (EXISTS ( SELECT 1
   FROM form_instances fi
  WHERE ((fi.id = form_signatures.instance_id) AND ((fi.assigned_to = auth.uid()) OR (fi.created_by = auth.uid()) OR ((fi.company_id IS NOT NULL) AND (is_company_member(auth.uid(), fi.company_id) OR user_has_company_access(auth.uid(), fi.company_id)))))))));
ALTER POLICY "Members read invoice_basis" ON public.invoice_basis USING ((public.legacy_admin_in_company(invoice_basis.company_id) OR ((company_id IS NOT NULL) AND (is_company_member(auth.uid(), company_id) OR user_has_company_access(auth.uid(), company_id)))));
ALTER POLICY "Admins can manage customers" ON public.customers USING ((public.legacy_admin_in_company(customers.company_id) AND (is_super_admin(auth.uid()) OR is_active_member_of(company_id)))) WITH CHECK ((public.legacy_admin_in_company(customers.company_id) AND (is_super_admin(auth.uid()) OR is_active_member_of(company_id))));
ALTER POLICY "Admins can manage customer_contacts" ON public.customer_contacts USING ((public.legacy_admin_in_company(public.customer_company_id(customer_contacts.customer_id)) AND (is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM customers c
  WHERE ((c.id = customer_contacts.customer_id) AND is_active_member_of(c.company_id))))))) WITH CHECK ((public.legacy_admin_in_company(public.customer_company_id(customer_contacts.customer_id)) AND (is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM customers c
  WHERE ((c.id = customer_contacts.customer_id) AND is_active_member_of(c.company_id)))))));
ALTER POLICY "Admins can manage employment_profiles" ON public.employment_profiles USING ((public.legacy_admin_in_company(employment_profiles.company_id) AND (is_super_admin(auth.uid()) OR is_active_member_of(company_id)))) WITH CHECK ((public.legacy_admin_in_company(employment_profiles.company_id) AND (is_super_admin(auth.uid()) OR is_active_member_of(company_id))));
