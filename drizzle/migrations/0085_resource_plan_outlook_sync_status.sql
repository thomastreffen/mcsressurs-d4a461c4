CREATE OR REPLACE FUNCTION public.resource_plan_outlook_sync_status(_company_ids uuid[])
RETURNS TABLE(technician_id uuid, status text, last_synced_at timestamptz, last_error_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
SELECT r.id,
  CASE WHEN s.technician_id IS NULL THEN 'unknown'
       WHEN bool_or(s.last_status='access_denied') THEN 'access_missing'
       WHEN bool_or(s.consecutive_failures>0) THEN 'error'
       ELSE 'ok' END,
  max(s.last_synced_at), max(s.last_error_at)
FROM public.resource_plan_personnel(_company_ids) r
LEFT JOIN public.schedule_sync_state s ON s.technician_id=r.id
GROUP BY r.id, s.technician_id
$$;
REVOKE ALL ON FUNCTION public.resource_plan_outlook_sync_status(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resource_plan_outlook_sync_status(uuid[]) TO authenticated;