CREATE TABLE public.compliance_requirement_assessments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.internal_companies(id), person_id uuid NOT NULL REFERENCES public.people(id), requirement_id uuid NOT NULL REFERENCES public.compliance_competence_requirements(id), competence_type_id uuid NOT NULL REFERENCES public.compliance_competence_types(id), decision text NOT NULL CHECK (decision IN ('not_relevant','revoke')), reason text NOT NULL CHECK (length(trim(reason)) > 0), assessed_by uuid NOT NULL, assessor_name text NOT NULL, assessed_at timestamptz NOT NULL DEFAULT now(), valid_until date, requirement_updated_at timestamptz NOT NULL, employment_context jsonb NOT NULL, revoked_assessment_id uuid REFERENCES public.compliance_requirement_assessments(id), client_request_id uuid NOT NULL UNIQUE, CHECK ((decision='revoke') = (revoked_assessment_id IS NOT NULL))
);
GRANT SELECT ON public.compliance_requirement_assessments TO authenticated;
GRANT ALL ON public.compliance_requirement_assessments TO service_role;
ALTER TABLE public.compliance_requirement_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY assessment_view ON public.compliance_requirement_assessments FOR SELECT TO authenticated USING (public.has_company_access(auth.uid(),company_id,'hms','view'));
CREATE UNIQUE INDEX one_assessment_revocation ON public.compliance_requirement_assessments(revoked_assessment_id) WHERE revoked_assessment_id IS NOT NULL;
CREATE INDEX assessment_person_requirement ON public.compliance_requirement_assessments(company_id,person_id,requirement_id,assessed_at DESC);
CREATE FUNCTION public.compliance_active_requirement_assessment(_company_id uuid,_person_id uuid,_requirement_id uuid) RETURNS SETOF public.compliance_requirement_assessments LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT a.* FROM public.compliance_requirement_assessments a JOIN public.compliance_competence_requirements r ON r.id=a.requirement_id AND r.company_id=a.company_id
 WHERE a.company_id=_company_id AND a.person_id=_person_id AND a.requirement_id=_requirement_id AND a.decision='not_relevant'
 AND (a.valid_until IS NULL OR a.valid_until >= CURRENT_DATE) AND r.updated_at=a.requirement_updated_at
 AND a.employment_context = COALESCE((SELECT jsonb_agg(jsonb_build_object('id',ep.id,'department_id',ep.department_id,'job_role_id',ep.job_role_id) ORDER BY ep.id) FROM public.employment_profiles ep WHERE ep.company_id=a.company_id AND ep.person_id=a.person_id AND ep.archived_at IS NULL AND ep.include_in_hms_people), '[]'::jsonb)
 AND NOT EXISTS (SELECT 1 FROM public.compliance_requirement_assessments v WHERE v.revoked_assessment_id=a.id)
 ORDER BY a.assessed_at DESC,a.id DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.compliance_active_requirement_assessment(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.compliance_active_requirement_assessment(uuid,uuid,uuid) TO authenticated,service_role;
CREATE FUNCTION public.audit_requirement_assessment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Vurderingshistorikken kan ikke endres eller slettes'; END IF;
 INSERT INTO public.hms_audit_log(company_id,entity_type,entity_id,action,performed_by,payload) VALUES (NEW.company_id,'competence_requirement_assessment',NEW.id,CASE WHEN NEW.decision='revoke' THEN 'requirement.relevance_revoked' ELSE 'requirement.not_relevant' END,NEW.assessed_by,to_jsonb(NEW));
 RETURN NEW;
END; $$;
CREATE TRIGGER audit_requirement_assessment BEFORE INSERT OR UPDATE OR DELETE ON public.compliance_requirement_assessments FOR EACH ROW EXECUTE FUNCTION public.audit_requirement_assessment();
CREATE FUNCTION public.assess_person_requirement(_company_id uuid,_person_id uuid,_requirement_id uuid,_reason text,_valid_until date DEFAULT NULL,_revoke_id uuid DEFAULT NULL,_client_request_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE req public.compliance_competence_requirements; previous public.compliance_requirement_assessments; existing public.compliance_requirement_assessments; context jsonb; actor_name text; result uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_access(auth.uid(),_company_id,'hms','edit') THEN RAISE EXCEPTION 'Ingen tilgang til HMS-endring i selskapet' USING ERRCODE='42501'; END IF;
 IF nullif(trim(_reason),'') IS NULL THEN RAISE EXCEPTION 'Begrunnelse er påkrevd'; END IF;
 IF _client_request_id IS NULL THEN RAISE EXCEPTION 'Forespørsels-ID er påkrevd'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_company_id::text || _person_id::text || _requirement_id::text,0));
 SELECT * INTO existing FROM public.compliance_requirement_assessments WHERE client_request_id=_client_request_id;
 IF FOUND THEN
  IF existing.company_id<>_company_id OR existing.person_id<>_person_id OR existing.requirement_id<>_requirement_id OR existing.assessed_by<>auth.uid() OR existing.reason<>trim(_reason) OR existing.valid_until IS DISTINCT FROM _valid_until OR existing.revoked_assessment_id IS DISTINCT FROM _revoke_id THEN RAISE EXCEPTION 'Forespørsels-ID er allerede brukt'; END IF;
  RETURN existing.id;
 END IF;
 SELECT * INTO req FROM public.compliance_competence_requirements WHERE id=_requirement_id AND company_id=_company_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Kravet finnes ikke i selskapet'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',ep.id,'department_id',ep.department_id,'job_role_id',ep.job_role_id) ORDER BY ep.id),'[]'::jsonb) INTO context FROM public.employment_profiles ep JOIN public.people p ON p.id=ep.person_id WHERE ep.company_id=_company_id AND ep.person_id=_person_id AND ep.archived_at IS NULL AND ep.include_in_hms_people AND p.is_active IS NOT FALSE;
 IF context='[]'::jsonb THEN RAISE EXCEPTION 'Personen er ikke aktiv i selskapets HMS-grunnlag'; END IF;
 IF _revoke_id IS NULL THEN
  IF _valid_until IS NOT NULL AND _valid_until < CURRENT_DATE THEN RAISE EXCEPTION 'Revurderingsdato kan ikke være passert'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.compliance_effective_requirements(_company_id,_person_id) e WHERE e.requirement_id=_requirement_id AND e.required) THEN RAISE EXCEPTION 'Kravet er ikke et gjeldende påkrevd personkrav'; END IF;
  IF EXISTS (SELECT 1 FROM public.compliance_active_requirement_assessment(_company_id,_person_id,_requirement_id)) THEN RAISE EXCEPTION 'Opphev eksisterende vurdering før en ny registreres'; END IF;
 ELSE
  SELECT * INTO previous FROM public.compliance_requirement_assessments WHERE id=_revoke_id AND company_id=_company_id AND person_id=_person_id AND requirement_id=_requirement_id AND decision='not_relevant';
  IF NOT FOUND THEN RAISE EXCEPTION 'Vurderingen finnes ikke på dette personkravet'; END IF;
  IF EXISTS (SELECT 1 FROM public.compliance_requirement_assessments WHERE revoked_assessment_id=_revoke_id) THEN RAISE EXCEPTION 'Vurderingen er allerede opphevet'; END IF;
 END IF;
 SELECT p.full_name INTO actor_name FROM public.user_accounts ua JOIN public.people p ON p.id=ua.person_id WHERE ua.auth_user_id=auth.uid() AND ua.is_active LIMIT 1;
 INSERT INTO public.compliance_requirement_assessments(company_id,person_id,requirement_id,competence_type_id,decision,reason,assessed_by,assessor_name,valid_until,requirement_updated_at,employment_context,revoked_assessment_id,client_request_id)
 VALUES (_company_id,_person_id,_requirement_id,req.competence_type_id,CASE WHEN _revoke_id IS NULL THEN 'not_relevant' ELSE 'revoke' END,trim(_reason),auth.uid(),COALESCE(actor_name,'HMS-ansvarlig'),CASE WHEN _revoke_id IS NULL THEN _valid_until ELSE NULL END,req.updated_at,context,_revoke_id,_client_request_id) RETURNING id INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.assess_person_requirement(uuid,uuid,uuid,text,date,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assess_person_requirement(uuid,uuid,uuid,text,date,uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.compliance_requirement_status(_company_id uuid,_person_id uuid DEFAULT NULL) RETURNS TABLE(person_id uuid,competence_type_id uuid,requirement_id uuid,required boolean,document_required boolean,validity_months integer,warning_days integer,reason text,source_scope text,source_label text,competence_id uuid,expires_at date,has_document boolean,days_until integer,status text) LANGUAGE sql STABLE SET search_path=public AS $$
 WITH eff AS (SELECT * FROM public.compliance_effective_requirements(_company_id,_person_id)), best AS (
 SELECT DISTINCT ON (e.person_id,e.competence_type_id) e.person_id,e.competence_type_id,c.id competence_id,c.expires_at,(c.document_id IS NOT NULL) has_document FROM eff e JOIN public.compliance_competences c ON c.person_id=e.person_id AND c.competence_type_id=e.competence_type_id AND c.company_id=_company_id AND c.deleted_at IS NULL ORDER BY e.person_id,e.competence_type_id,(c.document_id IS NOT NULL) DESC,(c.expires_at IS NULL) DESC,c.expires_at DESC NULLS LAST)
 SELECT e.person_id,e.competence_type_id,e.requirement_id,e.required,e.document_required,e.validity_months,e.warning_days,e.reason,e.source_scope,e.source_label,b.competence_id,b.expires_at,COALESCE(b.has_document,false),CASE WHEN b.expires_at IS NULL THEN NULL ELSE (b.expires_at-CURRENT_DATE)::int END,
 CASE WHEN NOT e.required THEN 'not_required' WHEN EXISTS (SELECT 1 FROM public.compliance_active_requirement_assessment(_company_id,e.person_id,e.requirement_id)) THEN 'not_relevant' WHEN b.competence_id IS NULL THEN 'missing' WHEN e.document_required AND NOT COALESCE(b.has_document,false) THEN 'missing_document' WHEN b.expires_at<CURRENT_DATE THEN 'expired' WHEN b.expires_at<=CURRENT_DATE+e.warning_days THEN 'expiring_soon' ELSE 'fulfilled' END FROM eff e LEFT JOIN best b ON b.person_id=e.person_id AND b.competence_type_id=e.competence_type_id;
$$;