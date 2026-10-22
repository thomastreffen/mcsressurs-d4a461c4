CREATE OR REPLACE FUNCTION public.resource_plan_tripletex_context(_company_id uuid)
RETURNS TABLE(economic_project_master boolean, test_search_enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS (SELECT 1 FROM public.tripletex_connections c WHERE c.company_id = _company_id AND c.environment = 'production' AND c.mode <> 'off' AND c.expected_tripletex_company_id IS NOT NULL AND 'projects_read' = ANY(c.capabilities)),
 EXISTS (SELECT 1 FROM public.tripletex_connections c WHERE c.company_id = _company_id AND c.environment = 'test' AND c.mode <> 'off' AND c.expected_tripletex_company_id IS NOT NULL AND 'projects_read' = ANY(c.capabilities))
 WHERE public.has_company_access(auth.uid(), _company_id, 'resource_plan', 'view')
$$;
REVOKE ALL ON FUNCTION public.resource_plan_tripletex_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resource_plan_tripletex_context(uuid) TO authenticated, service_role;