CREATE OR REPLACE FUNCTION public.normalize_project_search(_value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public
AS $$ SELECT regexp_replace(lower(COALESCE(_value, '')), '[^[:alnum:]]', '', 'g') $$;
CREATE OR REPLACE FUNCTION public.matches_project_search(_fields text[], _query text)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public
AS $$
 SELECT public.normalize_project_search(_query) = ''
 OR EXISTS (SELECT 1 FROM unnest(_fields) f WHERE strpos(public.normalize_project_search(f), public.normalize_project_search(_query)) > 0)
 OR NOT EXISTS (
   SELECT 1 FROM regexp_split_to_table(lower(COALESCE(_query, '')), '[^[:alnum:]]+') token
   WHERE token <> '' AND NOT EXISTS (SELECT 1 FROM unnest(_fields) f WHERE strpos(public.normalize_project_search(f), token) > 0)
 )
$$;
REVOKE ALL ON FUNCTION public.normalize_project_search(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.matches_project_search(text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_project_search(text), public.matches_project_search(text[], text) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.search_resource_plan_projects(_company_id uuid, _q text)
RETURNS TABLE(event_id uuid, project_number text, title text, customer text, tripletex_project_id bigint, internal_number text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
 WITH candidates AS (
 SELECT e.id, e.project_number, e.title, COALESCE(c.name, e.customer) AS customer,
 public.get_active_tripletex_project_id(e.id, e.company_id) AS tripletex_id, e.internal_number, e.start_time,
 public.normalize_project_search(e.project_number) AS number_search,
 public.normalize_project_search(e.title) AS name_search,
 public.normalize_project_search(COALESCE(c.name, e.customer)) AS customer_search,
 public.normalize_project_search(_q) AS term
 FROM public.events e LEFT JOIN public.customers c ON c.id = e.customer_id AND c.company_id = e.company_id
 WHERE e.company_id = _company_id AND e.deleted_at IS NULL AND e.parent_project_id IS NULL
 AND (e.project_type IS NULL OR e.project_type <> 'task')
 AND public.has_company_access(auth.uid(), _company_id, 'resource_plan', 'view')
 AND public.matches_project_search(ARRAY[e.project_number, e.title, e.customer, c.name, e.internal_number, c.org_number], _q)
 )
 SELECT id, project_number, title, customer, tripletex_id, internal_number FROM candidates
 ORDER BY (tripletex_id IS NOT NULL) DESC,
 CASE WHEN term = '' THEN 5 WHEN number_search = term THEN 0
 WHEN name_search = term OR customer_search = term THEN 1
 WHEN starts_with(number_search, term) OR starts_with(name_search, term) THEN 2
 WHEN strpos(customer_search, term) > 0 THEN 3 ELSE 4 END,
 start_time DESC NULLS LAST, id LIMIT 30
$$;
REVOKE ALL ON FUNCTION public.search_resource_plan_projects(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_resource_plan_projects(uuid, text) TO authenticated, service_role;
COMMENT ON FUNCTION public.matches_project_search(text[], text) IS 'Discovery-only separator-insensitive/token matching; never use for project linking or deduplication.';