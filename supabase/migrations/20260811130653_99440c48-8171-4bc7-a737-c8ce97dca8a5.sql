CREATE OR REPLACE FUNCTION public.find_work_visit_conflicts(
  p_technician_ids uuid[],
  p_start timestamptz,
  p_end timestamptz,
  p_exclude_event_id uuid DEFAULT NULL
)
RETURNS TABLE(
  technician_id uuid,
  technician_name text,
  event_id uuid,
  event_title text,
  conflict_start timestamptz,
  conflict_end timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT DISTINCT ON (sb.technician_id, sb.id)
    sb.technician_id,
    t.name,
    e.id,
    COALESCE(NULLIF(e.title, ''), NULLIF(sb.title, ''), 'Planlagt aktivitet'),
    sb.start_at,
    sb.end_at
  FROM public.schedule_blocks sb
  JOIN public.technicians t ON t.id = sb.technician_id
  JOIN public.events e ON e.id = COALESCE(sb.job_id, sb.project_id)
  WHERE sb.technician_id = ANY(p_technician_ids)
    AND sb.deleted_at IS NULL
    AND e.deleted_at IS NULL
    AND e.status <> 'cancelled'
    AND (p_exclude_event_id IS NULL OR e.id <> p_exclude_event_id)
    AND sb.start_at < p_end
    AND sb.end_at > p_start
  ORDER BY sb.technician_id, sb.id;
$function$;

REVOKE ALL ON FUNCTION public.find_work_visit_conflicts(uuid[], timestamptz, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_work_visit_conflicts(uuid[], timestamptz, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_work_visit_conflicts(uuid[], timestamptz, timestamptz, uuid) TO service_role;