CREATE FUNCTION public.compliance_requirement_status_details(_company_id uuid,_person_id uuid DEFAULT NULL) RETURNS SETOF jsonb LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT to_jsonb(s) || jsonb_build_object('assessment_id',a.id,'assessment_reason',a.reason,'assessed_by',a.assessed_by,'assessor_name',a.assessor_name,'assessed_at',a.assessed_at,'assessment_valid_until',a.valid_until)
 FROM public.compliance_requirement_status(_company_id,_person_id) s LEFT JOIN LATERAL public.compliance_active_requirement_assessment(_company_id,s.person_id,s.requirement_id) a ON s.status='not_relevant';
$$;
REVOKE ALL ON FUNCTION public.compliance_requirement_status_details(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.compliance_requirement_status_details(uuid,uuid) TO authenticated,service_role;
COMMENT ON TABLE public.compliance_requirement_assessments IS 'Append-only individual relevance decisions and revocations. Does not certify training; invalidated by expiry, requirement or employment context changes.';