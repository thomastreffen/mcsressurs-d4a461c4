CREATE OR REPLACE FUNCTION public.has_active_tripletex_project_link(_event_id uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tripletex_links l
    JOIN public.tripletex_connections c ON c.id = l.connection_id
    WHERE l.mcs_entity_type = 'project' AND l.mcs_entity_id = _event_id
      AND l.status = 'active' AND l.company_id = _company_id AND c.company_id = _company_id
  )
$$;
REVOKE ALL ON FUNCTION public.has_active_tripletex_project_link(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_tripletex_project_link(uuid, uuid) TO authenticated, service_role;

-- Invoker: events visibility follows caller's RLS; only the link check is definer.
CREATE OR REPLACE FUNCTION public.get_visible_project_numbers(_event_ids uuid[])
RETURNS TABLE(event_id uuid, project_number text) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT e.id, NULLIF(btrim(src.project_number), '')
  FROM public.events e
  JOIN public.events src
    ON src.id = CASE WHEN e.entity_type = 'financial_project' THEN e.id ELSE e.parent_project_id END
  WHERE e.id = ANY(_event_ids)
    AND src.entity_type = 'financial_project'
    AND src.deleted_at IS NULL
    AND src.company_id = e.company_id
    AND NULLIF(btrim(src.project_number), '') IS NOT NULL
    AND public.has_active_tripletex_project_link(src.id, src.company_id)
$$;
REVOKE ALL ON FUNCTION public.get_visible_project_numbers(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_visible_project_numbers(uuid[]) TO authenticated, service_role;