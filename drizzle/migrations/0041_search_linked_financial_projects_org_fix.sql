CREATE OR REPLACE FUNCTION public.search_linked_financial_projects(_company_id uuid, _q text)
RETURNS TABLE(event_id uuid, project_number text, title text, customer text, tripletex_project_id bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT e.id, e.project_number, e.title, COALESCE(c.name, e.customer),
         public.get_active_tripletex_project_id(e.id, e.company_id)
  FROM public.events e
  LEFT JOIN public.customers c ON c.id = e.customer_id
  WHERE e.company_id = _company_id
    AND e.entity_type = 'financial_project'
    AND e.deleted_at IS NULL
    AND public.has_active_tripletex_project_link(e.id, e.company_id)
    AND (
      COALESCE(btrim(_q), '') = ''
      OR e.project_number ILIKE '%' || btrim(_q) || '%'
      OR e.title ILIKE '%' || btrim(_q) || '%'
      OR e.customer ILIKE '%' || btrim(_q) || '%'
      OR c.name ILIKE '%' || btrim(_q) || '%'
      OR (length(regexp_replace(btrim(_q), '\D', '', 'g')) = 9
          AND regexp_replace(COALESCE(c.org_number, ''), '\D', '', 'g') = regexp_replace(btrim(_q), '\D', '', 'g'))
    )
  ORDER BY e.project_number NULLS LAST
  LIMIT 20
$$;