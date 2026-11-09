# Gjeldende policyklassifisering 09.11.2026

Hver policy er tilbakelest; klassifisering er ikke godkjenning av tilgangsendring.

| Tabell | Policy | Handling | Klasse/anker |
|---|---|---|---|
| employment_profiles | Admins can manage employment_profiles | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| permissions | Admins manage permissions | ALL | Sikkerhetskilde – kun global superadmin skriver; selvlesing beholdes |
| communication_logs | Admins can manage communication_logs | ALL | Uavklart/polymorf – ingen aktivering før sikker resolver |
| communication_logs | Users can view own communication_logs | SELECT | Uavklart/polymorf – ingen aktivering før sikker resolver |
| offer_activity_events | Users can read offer activity for their company | SELECT | Direkte company_id; operative erstatningstillatelser må avklares |
| company_reminder_settings | Admins manage company reminder settings | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| conversation_thread_invites | Admin can manage thread invites | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| event_technicians | Admins can manage event_technicians | ALL | Forelder: FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE; FOREIGN KEY (technician_id) REFERENCES technicians(id) ON DELETE CASCADE |
| task_message_attachments | Users can upload task message attachments | INSERT | Direkte company_id; operative erstatningstillatelser må avklares |
| task_message_attachments | Users can view task message attachments | SELECT | Direkte company_id; operative erstatningstillatelser må avklares |
| user_accounts | Admins can manage user_accounts | ALL | Sikkerhetskilde – kun global superadmin skriver; selvlesing beholdes |
| invoice_basis | Admins manage invoice_basis | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| invoice_basis | Members read invoice_basis | SELECT | Direkte company_id; operative erstatningstillatelser må avklares |
| customers | Admins can manage customers | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| offers | Admins can manage offers | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| events | Admins can create events | INSERT | Direkte company_id; operative erstatningstillatelser må avklares |
| events | Admins can delete events | DELETE | Direkte company_id; operative erstatningstillatelser må avklares |
| events | Admins can update all, technicians own | UPDATE | Direkte company_id; operative erstatningstillatelser må avklares |
| calc_cost_prices | Admins can manage cost prices | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| job_calendar_audit | Admins can manage calendar audit | ALL | Forelder: FOREIGN KEY (job_id) REFERENCES events(id) ON DELETE CASCADE |
| job_calendar_audit | Technicians can view own job audit | SELECT | Forelder: FOREIGN KEY (job_id) REFERENCES events(id) ON DELETE CASCADE |
| lead_participants | Admins can manage lead_participants | ALL | Forelder: FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE |
| lead_participants | Participants can view own lead_participants | SELECT | Forelder: FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE |
| lead_history | Admins can manage lead_history | ALL | Forelder: FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE |
| lead_history | Lead participants can view lead_history | SELECT | Forelder: FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE |
| task_messages | Users can insert internal messages | INSERT | Direkte company_id; operative erstatningstillatelser må avklares |
| task_messages | Users can soft-delete own messages | UPDATE | Direkte company_id; operative erstatningstillatelser må avklares |
| task_messages | Users can view task messages | SELECT | Direkte company_id; operative erstatningstillatelser må avklares |
| form_template_versions | Admins manage form_template_versions | ALL | Forelder: FOREIGN KEY (template_id) REFERENCES form_templates(id) ON DELETE CASCADE |
| contract_alerts | Contract alerts delete | DELETE | Direkte company_id; operative erstatningstillatelser må avklares |
| contract_alerts | Contract alerts insert | INSERT | Direkte company_id; operative erstatningstillatelser må avklares |
| contract_alerts | Contract alerts update | UPDATE | Direkte company_id; operative erstatningstillatelser må avklares |
| ai_match_runs | Admins can view ai_match_runs | SELECT | Forelder: FOREIGN KEY (schedule_block_id) REFERENCES schedule_blocks(id) ON DELETE CASCADE |
| fag_requests | Admins manage fag_requests | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| fag_requests | Users with fag.create can insert fag_requests | INSERT | Direkte company_id; operative erstatningstillatelser må avklares |
| fag_requests | Users with fag.create can update own fag_requests | UPDATE | Direkte company_id; operative erstatningstillatelser må avklares |
| fag_requests | Users with fag.view can read fag_requests | SELECT | Direkte company_id; operative erstatningstillatelser må avklares |
| calc_cases | Admins can manage calc_cases | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| contract_cron_runs | Admins can manage cron runs | ALL | Uavklart/polymorf – ingen aktivering før sikker resolver |
| job_tasks | Job tasks delete | DELETE | Forelder: FOREIGN KEY (job_id) REFERENCES events(id) ON DELETE CASCADE |
| job_tasks | Job tasks insert | INSERT | Forelder: FOREIGN KEY (job_id) REFERENCES events(id) ON DELETE CASCADE |
| job_tasks | Job tasks select | SELECT | Forelder: FOREIGN KEY (job_id) REFERENCES events(id) ON DELETE CASCADE |
| job_tasks | Job tasks update | UPDATE | Forelder: FOREIGN KEY (job_id) REFERENCES events(id) ON DELETE CASCADE |
| user_role_assignments | Admins can manage role assignments | ALL | Sikkerhetskilde – kun global superadmin skriver; selvlesing beholdes |
| user_role_assignments | Users can view own assignments | SELECT | Sikkerhetskilde – kun global superadmin skriver; selvlesing beholdes |
| order_form_template_fields | Admins can manage fields | ALL | Forelder: FOREIGN KEY (section_id) REFERENCES order_form_template_sections(id) ON DELETE CASCADE; FOREIGN KEY (template_id) REFERENCES order_form_templates(id) ON DELETE CASCADE |
| user_documents | Admins can manage user_documents | ALL | Forelder: FOREIGN KEY (user_id) REFERENCES technicians(id) ON DELETE CASCADE |
| calc_vendor_components | Admins can manage components | ALL | Forelder: FOREIGN KEY (series_id) REFERENCES calc_vendor_series(id) ON DELETE CASCADE |
| job_document_links | Admins can delete job_document_links | DELETE | Direkte company_id; operative erstatningstillatelser må avklares |
| task_assignees | Task assignees manage | ALL | Forelder: FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE |
| task_assignees | Task assignees select | SELECT | Forelder: FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE |
| cases | Admins can manage cases | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| cases | Postkontor users can view company cases | SELECT | Direkte company_id; operative erstatningstillatelser må avklares |
| cases | Private case access | SELECT | Direkte company_id; operative erstatningstillatelser må avklares |
| user_permission_overrides_v2 | Admins manage overrides_v2 | ALL | Sikkerhetskilde – kun global superadmin skriver; selvlesing beholdes |
| user_permission_overrides_v2 | Users read own permission overrides | SELECT | Sikkerhetskilde – kun global superadmin skriver; selvlesing beholdes |
| calc_vendors | Admins can manage vendors | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| task_attachments | Task attachments manage | ALL | Forelder: FOREIGN KEY (document_id) REFERENCES documents(id); FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE |
| task_attachments | Task attachments select | SELECT | Forelder: FOREIGN KEY (document_id) REFERENCES documents(id); FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE |
| leads | Leads access by scope | SELECT | Direkte company_id; operative erstatningstillatelser må avklares |
| leads | Leads delete by admin | DELETE | Direkte company_id; operative erstatningstillatelser må avklares |
| leads | Leads insert by permission | INSERT | Direkte company_id; operative erstatningstillatelser må avklares |
| leads | Leads update by permission | UPDATE | Direkte company_id; operative erstatningstillatelser må avklares |
| schedule_blocks | Admins can manage schedule blocks | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| schedule_blocks | Users can view schedule blocks in their company | SELECT | Direkte company_id; operative erstatningstillatelser må avklares |
| project_members | pm_manage_v3 | ALL | Forelder: FOREIGN KEY (project_id) REFERENCES events(id) ON DELETE CASCADE |
| project_members | pm_select_v3 | SELECT | Forelder: FOREIGN KEY (project_id) REFERENCES events(id) ON DELETE CASCADE |
| order_form_templates | Admins can manage templates | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| notifications | Admins can insert notifications | INSERT | Direkte company_id; operative erstatningstillatelser må avklares |
| notifications | Insert notifications | INSERT | Direkte company_id; operative erstatningstillatelser må avklares |
| work_orders | Admins can manage work_orders | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| work_orders | Company members can view work_orders | SELECT | Direkte company_id; operative erstatningstillatelser må avklares |
| superoffice_settings | Admins manage superoffice_settings | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| order_form_template_sections | Admins can manage sections | ALL | Forelder: FOREIGN KEY (template_id) REFERENCES order_form_templates(id) ON DELETE CASCADE |
| customer_portal_project_access | Account users can read account project access | SELECT | Forelder: FOREIGN KEY (account_id) REFERENCES customer_accounts(id); FOREIGN KEY (portal_user_id) REFERENCES customer_portal_users(id) ON DELETE CASCADE; FOREIGN KEY (project_id) REFERENCES events(id) ON DELETE CASCADE |
| customer_portal_project_access | Admins can manage project access | ALL | Forelder: FOREIGN KEY (account_id) REFERENCES customer_accounts(id); FOREIGN KEY (portal_user_id) REFERENCES customer_portal_users(id) ON DELETE CASCADE; FOREIGN KEY (project_id) REFERENCES events(id) ON DELETE CASCADE |
| customer_portal_project_access | Portal users can read own project access | SELECT | Forelder: FOREIGN KEY (account_id) REFERENCES customer_accounts(id); FOREIGN KEY (portal_user_id) REFERENCES customer_portal_users(id) ON DELETE CASCADE; FOREIGN KEY (project_id) REFERENCES events(id) ON DELETE CASCADE |
| tasks | tasks_delete_v2 | DELETE | Direkte company_id; operative erstatningstillatelser må avklares |
| tasks | tasks_select_v2 | SELECT | Direkte company_id; operative erstatningstillatelser må avklares |
| tasks | tasks_update_v2 | UPDATE | Direkte company_id; operative erstatningstillatelser må avklares |
| audit_log | Admins can read audit_log | SELECT | Forelder:  |
| settings | Admins can view settings | SELECT | Uavklart/polymorf – ingen aktivering før sikker resolver |
| regulation_queries | Admins can view quote and lead scoped queries | SELECT | Direkte company_id; operative erstatningstillatelser må avklares |
| regulation_queries | Admins full access regulation queries | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| regulation_queries | Users can view job-scoped queries | SELECT | Direkte company_id; operative erstatningstillatelser må avklares |
| confirmation_learnings | Company members can read confirmation_learnings | SELECT | Direkte company_id; operative erstatningstillatelser må avklares |
| import_logs | Admins can manage import_logs | ALL | Uavklart/polymorf – ingen aktivering før sikker resolver |
| task_threads | Users can insert task threads | INSERT | Direkte company_id; operative erstatningstillatelser må avklares |
| task_threads | Users can update task threads | UPDATE | Direkte company_id; operative erstatningstillatelser må avklares |
| task_threads | Users can view task threads | SELECT | Direkte company_id; operative erstatningstillatelser må avklares |
| customer_value_levels | Admins can manage value levels | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| cross_company_access_grants | Admins manage cross-company grants | ALL | Sikkerhetskilde – kun global superadmin skriver; selvlesing beholdes |
| absence_requests | Company admins or requester can delete absence requests | DELETE | Direkte company_id; operative erstatningstillatelser må avklares |
| absence_requests | Company admins or requester can update absence requests | UPDATE | Direkte company_id; operative erstatningstillatelser må avklares |
| absence_requests | Company members can insert absence requests | INSERT | Direkte company_id; operative erstatningstillatelser må avklares |
| conversation_email_dead_letters | Admin manages dead letters | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| calc_vendor_series | Admins can manage series | ALL | Forelder: FOREIGN KEY (vendor_id) REFERENCES calc_vendors(id) ON DELETE CASCADE |
| service_jobs | Admins can manage service_jobs | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| service_jobs | Company members can view service_jobs | SELECT | Direkte company_id; operative erstatningstillatelser må avklares |
| user_roles_v2 | Admins manage user_roles_v2 | ALL | Sikkerhetskilde – kun global superadmin skriver; selvlesing beholdes |
| user_roles_v2 | Users read own role assignments | SELECT | Sikkerhetskilde – kun global superadmin skriver; selvlesing beholdes |
| user_roles | Admins can view all roles | SELECT | Sikkerhetskilde – kun global superadmin skriver; selvlesing beholdes |
| customer_portal_users | Admins can manage portal users | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| customer_portal_users | Portal users can read account members | SELECT | Direkte company_id; operative erstatningstillatelser må avklares |
| customer_portal_users | Portal users can read own profile | SELECT | Direkte company_id; operative erstatningstillatelser må avklares |
| calculation_items | Admins can manage calculation_items | ALL | Forelder: FOREIGN KEY (calculation_id) REFERENCES calculations(id) ON DELETE CASCADE |
| fag_company_profiles | Admins can manage fag profiles | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| fag_company_profiles | Users can read own company fag profile | SELECT | Direkte company_id; operative erstatningstillatelser må avklares |
| people | Admins can manage people | ALL | Uavklart/polymorf – ingen aktivering før sikker resolver |
| people | Users can read people in their companies | SELECT | Uavklart/polymorf – ingen aktivering før sikker resolver |
| technicians | Admins can delete technicians | DELETE | Forelder:  |
| technicians | Admins can insert technicians | INSERT | Forelder:  |
| technicians | Admins can update technicians | UPDATE | Forelder:  |
| event_logs | Admins can insert event_logs | INSERT | Forelder: FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE |
| event_logs | Admins can view event_logs | SELECT | Forelder: FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE |
| order_form_catalog_settings | Admins can manage catalog settings | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| import_results | Admins can manage import_results | ALL | Forelder: FOREIGN KEY (import_log_id) REFERENCES import_logs(id) ON DELETE CASCADE |
| form_templates | Admins manage form_templates | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| case_items | Admins can manage case_items | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| case_items | Postkontor users can insert case_items | INSERT | Direkte company_id; operative erstatningstillatelser må avklares |
| case_items | Postkontor users can view case_items | SELECT | Direkte company_id; operative erstatningstillatelser må avklares |
| document_analyses | Doc analyses delete | DELETE | Forelder: FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE; FOREIGN KEY (job_id) REFERENCES events(id) |
| document_analyses | Doc analyses insert | INSERT | Forelder: FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE; FOREIGN KEY (job_id) REFERENCES events(id) |
| document_analyses | Doc analyses select | SELECT | Forelder: FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE; FOREIGN KEY (job_id) REFERENCES events(id) |
| portal_notification_preferences | Admins manage all preferences | ALL | Forelder: FOREIGN KEY (portal_user_id) REFERENCES customer_portal_users(id) ON DELETE CASCADE |
| inbox_messages | Admins can manage inbox_messages | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| inbox_messages | Users can view inbox_messages | SELECT | Direkte company_id; operative erstatningstillatelser må avklares |
| job_risk_items | risk_items_delete | DELETE | Forelder: FOREIGN KEY (job_id) REFERENCES events(id) ON DELETE CASCADE |
| job_risk_items | risk_items_insert | INSERT | Forelder: FOREIGN KEY (job_id) REFERENCES events(id) ON DELETE CASCADE |
| job_risk_items | risk_items_select | SELECT | Forelder: FOREIGN KEY (job_id) REFERENCES events(id) ON DELETE CASCADE |
| job_risk_items | risk_items_update | UPDATE | Forelder: FOREIGN KEY (job_id) REFERENCES events(id) ON DELETE CASCADE |
| ms_graph_subscriptions | Admin manages subscriptions | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| fag_answers | Admins manage fag_answers | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| fag_answers | System can insert fag_answers | INSERT | Direkte company_id; operative erstatningstillatelser må avklares |
| fag_answers | Users with fag.view can read fag_answers | SELECT | Direkte company_id; operative erstatningstillatelser må avklares |
| tenant_settings | Admins can manage tenant_settings | ALL | Uavklart/polymorf – ingen aktivering før sikker resolver |
| tenant_settings | Admins view tenant_settings | SELECT | Uavklart/polymorf – ingen aktivering før sikker resolver |
| user_memberships | Admins can manage memberships | ALL | Sikkerhetskilde – kun global superadmin skriver; selvlesing beholdes |
| user_memberships | Users can view own memberships | SELECT | Sikkerhetskilde – kun global superadmin skriver; selvlesing beholdes |
| lead_calendar_links | Admins can manage lead_calendar_links | ALL | Forelder: FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE |
| lead_calendar_links | Lead participants can view lead_calendar_links | SELECT | Forelder: FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE |
| offer_followup_tasks | Users can read followup tasks for their company | SELECT | Direkte company_id; operative erstatningstillatelser må avklares |
| offer_followup_tasks | Users can update their followup tasks | UPDATE | Direkte company_id; operative erstatningstillatelser må avklares |
| mailboxes | Admins can manage mailboxes | ALL | Uavklart/polymorf – ingen aktivering før sikker resolver |
| mailboxes | Admins can view mailboxes | SELECT | Uavklart/polymorf – ingen aktivering før sikker resolver |
| documents | Documents delete | DELETE | Direkte company_id; operative erstatningstillatelser må avklares |
| documents | Documents insert | INSERT | Direkte company_id; operative erstatningstillatelser må avklares |
| documents | Documents select | SELECT | Direkte company_id; operative erstatningstillatelser må avklares |
| documents | Documents update | UPDATE | Direkte company_id; operative erstatningstillatelser må avklares |
| case_routing_rules | Admins can manage routing rules | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| case_routing_rules | Postkontor users can view routing rules | SELECT | Direkte company_id; operative erstatningstillatelser må avklares |
| conversation_threads | threads_update | UPDATE | Direkte company_id; operative erstatningstillatelser må avklares |
| user_permission_overrides | Admins can manage overrides | ALL | Sikkerhetskilde – kun global superadmin skriver; selvlesing beholdes |
| user_permission_overrides | Users can view own overrides | SELECT | Sikkerhetskilde – kun global superadmin skriver; selvlesing beholdes |
| form_pdf_imports | Admins manage form_pdf_imports | ALL | Forelder: FOREIGN KEY (source_document_id) REFERENCES documents(id); FOREIGN KEY (template_id) REFERENCES form_templates(id) |
| customer_tags | Admins can manage customer tags | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| job_summaries | job_summaries_delete | DELETE | Forelder: FOREIGN KEY (job_id) REFERENCES events(id) ON DELETE CASCADE |
| job_summaries | job_summaries_insert | INSERT | Forelder: FOREIGN KEY (job_id) REFERENCES events(id) ON DELETE CASCADE |
| job_summaries | job_summaries_select | SELECT | Forelder: FOREIGN KEY (job_id) REFERENCES events(id) ON DELETE CASCADE |
| job_summaries | job_summaries_update | UPDATE | Forelder: FOREIGN KEY (job_id) REFERENCES events(id) ON DELETE CASCADE |
| user_scopes | Admins manage user_scopes | ALL | Sikkerhetskilde – kun global superadmin skriver; selvlesing beholdes |
| user_scopes | Users read own scopes | SELECT | Sikkerhetskilde – kun global superadmin skriver; selvlesing beholdes |
| portal_notifications | System can insert notifications | ALL | Forelder: FOREIGN KEY (portal_user_id) REFERENCES customer_portal_users(id) ON DELETE CASCADE |
| job_approvals | Admins can view approvals | SELECT | Forelder: FOREIGN KEY (job_id) REFERENCES events(id) ON DELETE CASCADE |
| customer_contacts | Admins can manage customer_contacts | ALL | Forelder: FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE |
| activity_log | Admins can manage activity_log | ALL | Forelder: FOREIGN KEY (commercial_case_id) REFERENCES commercial_cases(id) ON DELETE SET NULL |
| activity_log | Lead participants can view activity_log | SELECT | Forelder: FOREIGN KEY (commercial_case_id) REFERENCES commercial_cases(id) ON DELETE SET NULL |
| job_change_orders | change_orders_delete | DELETE | Forelder: FOREIGN KEY (job_id) REFERENCES events(id) ON DELETE CASCADE; FOREIGN KEY (linked_risk_id) REFERENCES job_risk_items(id) ON DELETE SET NULL |
| job_change_orders | change_orders_insert | INSERT | Forelder: FOREIGN KEY (job_id) REFERENCES events(id) ON DELETE CASCADE; FOREIGN KEY (linked_risk_id) REFERENCES job_risk_items(id) ON DELETE SET NULL |
| job_change_orders | change_orders_select | SELECT | Forelder: FOREIGN KEY (job_id) REFERENCES events(id) ON DELETE CASCADE; FOREIGN KEY (linked_risk_id) REFERENCES job_risk_items(id) ON DELETE SET NULL |
| job_change_orders | change_orders_update | UPDATE | Forelder: FOREIGN KEY (job_id) REFERENCES events(id) ON DELETE CASCADE; FOREIGN KEY (linked_risk_id) REFERENCES job_risk_items(id) ON DELETE SET NULL |
| project_sharepoint_category_mappings | Admins can manage project mappings | ALL | Forelder: FOREIGN KEY (project_id) REFERENCES events(id) ON DELETE CASCADE |
| job_change_order_events | co_events_insert | INSERT | Forelder: FOREIGN KEY (change_order_id) REFERENCES job_change_orders(id) ON DELETE CASCADE; FOREIGN KEY (job_id) REFERENCES events(id) ON DELETE CASCADE |
| job_change_order_events | co_events_select | SELECT | Forelder: FOREIGN KEY (change_order_id) REFERENCES job_change_orders(id) ON DELETE CASCADE; FOREIGN KEY (job_id) REFERENCES events(id) ON DELETE CASCADE |
| job_task_notes | Task notes delete | DELETE | Forelder: FOREIGN KEY (task_id) REFERENCES job_tasks(id) ON DELETE CASCADE |
| job_task_notes | Task notes insert | INSERT | Forelder: FOREIGN KEY (task_id) REFERENCES job_tasks(id) ON DELETE CASCADE |
| job_task_notes | Task notes select | SELECT | Forelder: FOREIGN KEY (task_id) REFERENCES job_tasks(id) ON DELETE CASCADE |
| form_instances | Admins manage form_instances | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| calculations | Admins can manage calculations | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| job_participants | Users can view own participations | SELECT | Forelder: FOREIGN KEY (job_id) REFERENCES events(id) ON DELETE CASCADE |
| job_calendar_links | Admins can manage calendar links | ALL | Forelder: FOREIGN KEY (job_id) REFERENCES events(id) ON DELETE CASCADE; FOREIGN KEY (technician_id) REFERENCES technicians(id) ON DELETE CASCADE |
| job_calendar_links | Technicians can view own calendar links | SELECT | Forelder: FOREIGN KEY (job_id) REFERENCES events(id) ON DELETE CASCADE; FOREIGN KEY (technician_id) REFERENCES technicians(id) ON DELETE CASCADE |
| order_form_categories | Admins can manage categories | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| form_signatures | Admins manage form_signatures | ALL | Forelder: FOREIGN KEY (instance_id) REFERENCES form_instances(id) ON DELETE CASCADE |
| form_signatures | Members read form_signatures | SELECT | Forelder: FOREIGN KEY (instance_id) REFERENCES form_instances(id) ON DELETE CASCADE |
| customer_accounts | Admins can manage accounts | ALL | Direkte company_id; operative erstatningstillatelser må avklares |
| customer_accounts | Portal users can read own account | SELECT | Direkte company_id; operative erstatningstillatelser må avklares |
