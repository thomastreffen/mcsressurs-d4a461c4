REVOKE ALL ON TABLE public.compliance_requirement_assessments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.compliance_requirement_assessments TO authenticated;
GRANT ALL ON TABLE public.compliance_requirement_assessments TO service_role;
REVOKE ALL ON FUNCTION public.audit_requirement_assessment() FROM PUBLIC,anon,authenticated;
COMMENT ON TABLE public.compliance_requirement_assessments IS 'Append-only individual relevance decisions: authenticated reads through company RLS; writes exclusively through authorized assess_person_requirement; expiry/revocation never certify training.';