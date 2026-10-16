
-- hms_incidents: let a reporter/assignee/project member see, create and progress their own deviation report
-- even without the company's hms.view/hms.edit module grant. The restrictive phase2_* policies were
-- ANDing with the existing permissive self-service policies and silently blocking ordinary employees.
ALTER POLICY "phase2_module_view" ON public.hms_incidents
  USING (
    has_company_access(auth.uid(), company_id, 'hms', 'view')
    OR reported_by = auth.uid()
    OR assigned_to = auth.uid()
    OR (project_id IS NOT NULL AND is_project_member(auth.uid(), project_id))
  );

ALTER POLICY "phase2_module_insert" ON public.hms_incidents
  WITH CHECK (
    has_company_access(auth.uid(), company_id, 'hms', 'edit')
    OR user_has_company_access(auth.uid(), company_id)
  );

ALTER POLICY "phase2_module_update" ON public.hms_incidents
  USING (
    has_company_access(auth.uid(), company_id, 'hms', 'edit')
    OR assigned_to = auth.uid()
    OR (reported_by = auth.uid() AND status = 'open')
  )
  WITH CHECK (
    has_company_access(auth.uid(), company_id, 'hms', 'edit')
    OR assigned_to = auth.uid()
    OR (reported_by = auth.uid() AND status = 'open')
  );

-- hms_incident_comments: same self-service exception, mirroring has_hms_incident_access
ALTER POLICY "phase2_module_view" ON public.hms_incident_comments
  USING (
    has_company_access(auth.uid(), company_id, 'hms', 'view')
    OR has_hms_incident_access(auth.uid(), incident_id)
  );

ALTER POLICY "phase2_module_insert" ON public.hms_incident_comments
  WITH CHECK (
    has_company_access(auth.uid(), company_id, 'hms', 'edit')
    OR (author_id = auth.uid() AND has_hms_incident_access(auth.uid(), incident_id))
  );

-- hms_incident_status_log: let someone with access to the incident see its history
ALTER POLICY "phase2_module_view" ON public.hms_incident_status_log
  USING (
    has_company_access(auth.uid(), company_id, 'hms', 'view')
    OR has_hms_incident_access(auth.uid(), incident_id)
  );
