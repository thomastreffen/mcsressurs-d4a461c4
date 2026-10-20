CREATE OR REPLACE FUNCTION public.resource_plan_tripletex_context(_company_id uuid)
RETURNS TABLE(economic_project_master boolean, test_search_enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS (SELECT 1 FROM public.tripletex_connections c WHERE c.company_id = _company_id AND c.mode <> 'off' AND c.expected_tripletex_company_id IS NOT NULL AND 'projects_read' = ANY(c.capabilities)),
 EXISTS (SELECT 1 FROM public.tripletex_connections c WHERE c.company_id = _company_id AND c.environment = 'test' AND c.mode <> 'off' AND c.expected_tripletex_company_id IS NOT NULL AND 'projects_read' = ANY(c.capabilities))
 WHERE public.has_company_access(auth.uid(), _company_id, 'resource_plan', 'view')
$$;
REVOKE ALL ON FUNCTION public.resource_plan_tripletex_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resource_plan_tripletex_context(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.search_resource_plan_projects(_company_id uuid, _q text)
RETURNS TABLE(event_id uuid, project_number text, title text, customer text, tripletex_project_id bigint, internal_number text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT e.id, e.project_number, e.title, COALESCE(c.name, e.customer), public.get_active_tripletex_project_id(e.id, e.company_id), e.internal_number
 FROM public.events e LEFT JOIN public.customers c ON c.id = e.customer_id AND c.company_id = e.company_id
 WHERE e.company_id = _company_id AND e.deleted_at IS NULL AND e.parent_project_id IS NULL
 AND (e.project_type IS NULL OR e.project_type <> 'task')
 AND public.has_company_access(auth.uid(), _company_id, 'resource_plan', 'view')
 AND (COALESCE(btrim(_q), '') = '' OR e.project_number ILIKE '%' || btrim(_q) || '%' OR e.title ILIKE '%' || btrim(_q) || '%' OR e.customer ILIKE '%' || btrim(_q) || '%' OR c.name ILIKE '%' || btrim(_q) || '%' OR e.internal_number ILIKE '%' || btrim(_q) || '%' OR (length(regexp_replace(btrim(_q), '\D', '', 'g')) = 9 AND regexp_replace(COALESCE(c.org_number,''), '\D', '', 'g') = regexp_replace(btrim(_q), '\D', '', 'g')))
 ORDER BY e.start_time DESC NULLS LAST, e.id LIMIT 30
$$;
REVOKE ALL ON FUNCTION public.search_resource_plan_projects(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_resource_plan_projects(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resource_plan_parent_context(_event_id uuid, _company_id uuid)
RETURNS TABLE(event_id uuid, linked boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT e.id, public.has_active_tripletex_project_link(e.id, e.company_id)
 FROM public.events e WHERE e.id = _event_id AND e.company_id = _company_id AND e.deleted_at IS NULL
 AND public.has_company_access(auth.uid(), _company_id, 'resource_plan', 'view')
$$;
REVOKE ALL ON FUNCTION public.resource_plan_parent_context(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resource_plan_parent_context(uuid, uuid) TO authenticated, service_role;