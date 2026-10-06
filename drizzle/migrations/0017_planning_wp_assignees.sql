CREATE OR REPLACE FUNCTION public.get_planning_wp_assignees(_project_id uuid)
RETURNS TABLE(work_package_id uuid, technician_id uuid, name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_planning_project_access(_project_id) THEN RETURN; END IF;
  RETURN QUERY
  SELECT DISTINCT w.id, t.id, t.name::text
  FROM public.planning_work_packages w
  JOIN public.events e ON e.id = w.linked_event_id AND e.deleted_at IS NULL
  JOIN LATERAL (
    SELECT et.technician_id AS tid FROM public.event_technicians et WHERE et.event_id = e.id
    UNION SELECT e.technician_id WHERE e.technician_id IS NOT NULL
  ) x ON true
  JOIN public.technicians t ON t.id = x.tid
  WHERE w.planning_project_id = _project_id;
END $$;
GRANT EXECUTE ON FUNCTION public.get_planning_wp_assignees(uuid) TO authenticated;