CREATE OR REPLACE FUNCTION public.is_active_hub_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.user_memberships um WHERE um.user_id = auth.uid() AND um.is_active = true)
    OR public.is_global_superadmin(auth.uid()))
$$;

CREATE OR REPLACE FUNCTION public.can_access_conversation_post(_post_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.conversation_posts p
    WHERE p.id = _post_id AND public.has_thread_access(auth.uid(), p.thread_id))
$$;

CREATE OR REPLACE FUNCTION public.storage_company_folder_access(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
    AND split_part(_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.user_has_company_access(auth.uid(), split_part(_name, '/', 1)::uuid)
$$;

DROP POLICY IF EXISTS "Authenticated can view role_permissions" ON public.role_permissions;
CREATE POLICY "Active users can view role_permissions" ON public.role_permissions FOR SELECT TO authenticated USING (public.is_active_hub_user());
DROP POLICY IF EXISTS "Authenticated can view roles" ON public.roles;
CREATE POLICY "Active users can view roles" ON public.roles FOR SELECT TO authenticated USING (public.is_active_hub_user());
DROP POLICY IF EXISTS "Anyone can read permissions" ON public.permissions;
CREATE POLICY "Active users can read permissions" ON public.permissions FOR SELECT TO authenticated USING (public.is_active_hub_user());
DROP POLICY IF EXISTS "Authenticated users can read module_settings" ON public.module_settings;
CREATE POLICY "Active users can read module_settings" ON public.module_settings FOR SELECT TO authenticated USING (public.is_active_hub_user());
DROP POLICY IF EXISTS "hms_area_catalog readable by authenticated" ON public.hms_area_catalog;
CREATE POLICY "hms_area_catalog readable by active users" ON public.hms_area_catalog FOR SELECT TO authenticated USING (public.is_active_hub_user());
DROP POLICY IF EXISTS "hms_area_suggestion_rules readable by authenticated" ON public.hms_area_suggestion_rules;
CREATE POLICY "hms_area_suggestion_rules readable by active users" ON public.hms_area_suggestion_rules FOR SELECT TO authenticated USING (public.is_active_hub_user());

DROP POLICY IF EXISTS "Authenticated users can view customer tags" ON public.customer_tags;
CREATE POLICY "Company members can view customer tags" ON public.customer_tags FOR SELECT TO authenticated USING (public.user_has_company_access(auth.uid(), company_id));
DROP POLICY IF EXISTS "Authenticated users can view value levels" ON public.customer_value_levels;
CREATE POLICY "Company members can view value levels" ON public.customer_value_levels FOR SELECT TO authenticated USING (public.user_has_company_access(auth.uid(), company_id));
DROP POLICY IF EXISTS "Authenticated users can read category mappings" ON public.document_category_mappings;
CREATE POLICY "Company members can read category mappings" ON public.document_category_mappings FOR SELECT TO authenticated USING ((company_id IS NULL AND public.is_active_hub_user()) OR public.user_has_company_access(auth.uid(), company_id));
DROP POLICY IF EXISTS "Authenticated can view catalog settings" ON public.order_form_catalog_settings;
CREATE POLICY "Company members can view catalog settings" ON public.order_form_catalog_settings FOR SELECT TO authenticated USING (public.user_has_company_access(auth.uid(), company_id));
DROP POLICY IF EXISTS "Authenticated users can view categories" ON public.order_form_categories;
CREATE POLICY "Company members can view categories" ON public.order_form_categories FOR SELECT TO authenticated USING (is_active = true OR public.user_has_company_access(auth.uid(), company_id));
DROP POLICY IF EXISTS "Auth users view form_template_versions" ON public.form_template_versions;
CREATE POLICY "Company members view form_template_versions" ON public.form_template_versions FOR SELECT TO authenticated USING (public.user_has_company_access(auth.uid(), public.form_template_company_id(template_id)));
DROP POLICY IF EXISTS "Authenticated users can view sync runs" ON public.schedule_sync_runs;
CREATE POLICY "Admins can view sync runs" ON public.schedule_sync_runs FOR SELECT TO authenticated USING (public.is_global_superadmin(auth.uid()) OR public.check_permission_v2(auth.uid(), 'admin.manage_users'));

DROP POLICY IF EXISTS "tasks_insert_v2" ON public.tasks;
CREATE POLICY "tasks_insert_v2" ON public.tasks FOR INSERT TO authenticated WITH CHECK (public.user_has_company_access(auth.uid(), company_id));
DROP POLICY IF EXISTS "Users can insert offer activity events" ON public.offer_activity_events;
CREATE POLICY "Users can insert offer activity events" ON public.offer_activity_events FOR INSERT TO authenticated WITH CHECK (public.user_has_company_access(auth.uid(), company_id));
DROP POLICY IF EXISTS "Authenticated users can insert followup tasks" ON public.offer_followup_tasks;
CREATE POLICY "Authenticated users can insert followup tasks" ON public.offer_followup_tasks FOR INSERT TO authenticated WITH CHECK (public.user_has_company_access(auth.uid(), company_id));

DROP POLICY IF EXISTS "Authenticated users can view project mappings" ON public.project_sharepoint_category_mappings;
CREATE POLICY "Project members can view project mappings" ON public.project_sharepoint_category_mappings FOR SELECT TO authenticated USING (public.is_project_member(auth.uid(), project_id) OR public.check_permission_v2(auth.uid(), 'admin.manage_users'));
DROP POLICY IF EXISTS "Users can insert drawing assets" ON public.drawing_assets;
DROP POLICY IF EXISTS "Users can view drawing assets" ON public.drawing_assets;
CREATE POLICY "Project members can insert drawing assets" ON public.drawing_assets FOR INSERT TO authenticated WITH CHECK (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "Project members can view drawing assets" ON public.drawing_assets FOR SELECT TO authenticated USING (public.is_project_member(auth.uid(), project_id));
DROP POLICY IF EXISTS "Users can insert objects" ON public.objects_catalog;
DROP POLICY IF EXISTS "Users can update objects" ON public.objects_catalog;
DROP POLICY IF EXISTS "Users can view objects in accessible projects" ON public.objects_catalog;
CREATE POLICY "Project members can insert objects" ON public.objects_catalog FOR INSERT TO authenticated WITH CHECK (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "Project members can update objects" ON public.objects_catalog FOR UPDATE TO authenticated USING (public.is_project_member(auth.uid(), project_id)) WITH CHECK (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "Project members can view objects" ON public.objects_catalog FOR SELECT TO authenticated USING (public.is_project_member(auth.uid(), project_id));

DROP POLICY IF EXISTS "Users can insert image text extracts" ON public.image_text_extracts;
DROP POLICY IF EXISTS "Users can view image text extracts" ON public.image_text_extracts;
CREATE POLICY "Thread members can insert image text extracts" ON public.image_text_extracts FOR INSERT TO authenticated WITH CHECK (public.can_access_conversation_post(post_id));
CREATE POLICY "Thread members can view image text extracts" ON public.image_text_extracts FOR SELECT TO authenticated USING (public.can_access_conversation_post(post_id));
DROP POLICY IF EXISTS "Users can insert media annotations" ON public.media_annotations;
DROP POLICY IF EXISTS "Users can update media annotations" ON public.media_annotations;
DROP POLICY IF EXISTS "Users can view media annotations" ON public.media_annotations;
CREATE POLICY "Thread members can insert media annotations" ON public.media_annotations FOR INSERT TO authenticated WITH CHECK (public.can_access_conversation_post(post_id));
CREATE POLICY "Thread members can update media annotations" ON public.media_annotations FOR UPDATE TO authenticated USING (public.can_access_conversation_post(post_id)) WITH CHECK (public.can_access_conversation_post(post_id));
CREATE POLICY "Thread members can view media annotations" ON public.media_annotations FOR SELECT TO authenticated USING (public.can_access_conversation_post(post_id));
DROP POLICY IF EXISTS "Authenticated users can read reactions" ON public.message_reactions;
CREATE POLICY "Thread members can read reactions" ON public.message_reactions FOR SELECT TO authenticated USING (public.can_access_conversation_post(post_id));
DROP POLICY IF EXISTS "Thread members can view reads" ON public.message_reads;
CREATE POLICY "Thread members can view reads" ON public.message_reads FOR SELECT TO authenticated USING (public.can_access_conversation_post(post_id));

DROP POLICY IF EXISTS "Contract docs storage select" ON storage.objects;
DROP POLICY IF EXISTS "Contract docs storage insert" ON storage.objects;
DROP POLICY IF EXISTS "Contract docs storage update" ON storage.objects;
DROP POLICY IF EXISTS "Contract docs storage delete" ON storage.objects;
CREATE POLICY "Contract docs storage select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'contract-documents' AND public.storage_company_folder_access(name));
CREATE POLICY "Contract docs storage insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'contract-documents' AND owner_id = (select auth.uid()::text) AND public.storage_company_folder_access(name));
CREATE POLICY "Contract docs storage update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'contract-documents' AND owner_id = (select auth.uid()::text) AND public.storage_company_folder_access(name)) WITH CHECK (bucket_id = 'contract-documents' AND public.storage_company_folder_access(name));
CREATE POLICY "Contract docs storage delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'contract-documents' AND owner_id = (select auth.uid()::text) AND public.storage_company_folder_access(name));
DROP POLICY IF EXISTS "Authenticated users can read task thread files" ON storage.objects;
CREATE POLICY "Company members can read task thread files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'task-thread-files' AND public.storage_company_folder_access(name));
DROP POLICY IF EXISTS "Authenticated users can upload job attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload job attachments" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'job-attachments' AND owner_id = (select auth.uid()::text) AND public.is_active_hub_user());
DROP POLICY IF EXISTS "Authenticated users can view job attachments" ON storage.objects;
CREATE POLICY "Authenticated users can view job attachments" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'job-attachments' AND public.is_active_hub_user());