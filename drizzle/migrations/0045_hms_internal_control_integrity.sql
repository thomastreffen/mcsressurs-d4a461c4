ALTER TABLE public.hms_risk_register ADD COLUMN rest_sannsynlighet integer, ADD COLUMN rest_konsekvens integer, ADD COLUMN rest_score integer GENERATED ALWAYS AS (rest_sannsynlighet * rest_konsekvens) STORED, ADD COLUMN residual_review_required boolean NOT NULL DEFAULT true, ADD COLUMN residual_reviewed_at timestamptz, ADD COLUMN residual_reviewed_by uuid, ADD COLUMN residual_comment text;
ALTER TABLE public.hms_internal_reviews ADD COLUMN previous_review_id uuid REFERENCES public.hms_internal_reviews(id);
CREATE UNIQUE INDEX hms_review_revision_once ON public.hms_internal_reviews(previous_review_id) WHERE previous_review_id IS NOT NULL;
ALTER TABLE public.hms_year_activities ADD COLUMN previous_activity_id uuid REFERENCES public.hms_year_activities(id), ADD COLUMN linked_submission_id uuid REFERENCES public.hms_submissions(id), ADD COLUMN linked_risk_id uuid REFERENCES public.hms_risk_register(id);
CREATE UNIQUE INDEX hms_activity_recurrence_once ON public.hms_year_activities(previous_activity_id) WHERE previous_activity_id IS NOT NULL;
ALTER TABLE public.hms_action_items ADD COLUMN client_request_id uuid;
CREATE UNIQUE INDEX hms_action_request_once ON public.hms_action_items(company_id,client_request_id) WHERE client_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.hms_control_snapshot(_company_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb := jsonb_build_object('generatedAt',now(),'schemaVersion',2,'errors','{}'::jsonb); metric record; n bigint;
BEGIN
 IF NOT public.has_company_access(auth.uid(),_company_id,'hms','edit') THEN RAISE EXCEPTION 'Ingen HMS-tilgang'; END IF;
 FOR metric IN SELECT * FROM (VALUES
 ('yearActivitiesOverdue','SELECT count(*) FROM public.hms_year_activities WHERE company_id=$1 AND deleted_at IS NULL AND status=''planned'' AND due_date<current_date'),
 ('openActions','SELECT count(*) FROM public.hms_action_items WHERE company_id=$1 AND deleted_at IS NULL AND status<>''done'''),
 ('overdueActions','SELECT count(*) FROM public.hms_action_items WHERE company_id=$1 AND deleted_at IS NULL AND status<>''done'' AND due_date<current_date'),
 ('openIncidents','SELECT count(*) FROM public.hms_incidents WHERE company_id=$1 AND deleted_at IS NULL AND status<>''closed'''),
 ('seriousIncidents','SELECT count(*) FROM public.hms_incidents WHERE company_id=$1 AND deleted_at IS NULL AND severity IN (''high'',''critical'',''serious'') AND status<>''closed'''),
 ('repeatedIncidents','SELECT coalesce(sum(c-1),0) FROM (SELECT count(*) c FROM public.hms_incidents WHERE company_id=$1 AND deleted_at IS NULL AND occurred_at>=date_trunc(''year'',current_date) GROUP BY incident_type,coalesce(chemical_id::text,lower(regexp_replace(trim(title),''\s+'','' '',''g''))) HAVING count(*)>1) g'),
 ('vernerunderDone','SELECT count(*) FROM public.hms_submissions s JOIN public.hms_templates t ON t.id=s.template_id AND t.company_id=s.company_id WHERE s.company_id=$1 AND s.deleted_at IS NULL AND s.status IN (''submitted'',''approved'') AND s.submitted_at>=date_trunc(''year'',current_date) AND (t.category ILIKE ''%vernerunde%'' OR t.name ILIKE ''%vernerunde%'')'),
 ('missingHandbookAcks','SELECT count(DISTINCT e.person_id) FROM public.employment_profiles e JOIN public.people p ON p.id=e.person_id CROSS JOIN public.hms_handbooks h JOIN public.hms_handbook_versions v ON v.id=h.current_version_id AND v.company_id=h.company_id WHERE e.company_id=$1 AND e.archived_at IS NULL AND e.include_in_hms_people AND p.is_active IS DISTINCT FROM false AND h.company_id=$1 AND h.deleted_at IS NULL AND v.status=''published'' AND v.requires_acknowledgement AND NOT EXISTS(SELECT 1 FROM public.hms_handbook_acknowledgements a WHERE a.company_id=$1 AND a.version_id=v.id AND a.person_id=e.person_id AND a.ack_scope=''whole_handbook'')'),
 ('expiredFse','SELECT count(*) FROM public.compliance_requirement_status($1,NULL) r JOIN public.compliance_competence_types t ON t.id=r.competence_type_id AND t.company_id=$1 WHERE r.required AND r.status IN (''missing'',''expired'',''missing_document'') AND (t.key ILIKE ''%fse%'' OR t.name ILIKE ''%fse%'')'),
 ('expiredFirstAid','SELECT count(*) FROM public.compliance_requirement_status($1,NULL) r JOIN public.compliance_competence_types t ON t.id=r.competence_type_id AND t.company_id=$1 WHERE r.required AND r.status IN (''missing'',''expired'',''missing_document'') AND (t.key ILIKE ''%first%'' OR t.name ILIKE ''%førstehjelp%'')'),
 ('sdsMissing','SELECT count(*) FROM public.hms_chemicals WHERE company_id=$1 AND deleted_at IS NULL AND (sds_path IS NULL OR sds_revision_date IS NULL)'),
 ('risksNeedingReview','SELECT count(*) FROM public.hms_risk_register WHERE company_id=$1 AND deleted_at IS NULL AND (residual_review_required OR (status<>''closed'' AND next_review_date<current_date))')
 ) AS m(key,sql) LOOP
  BEGIN EXECUTE metric.sql INTO n USING _company_id; result := result || jsonb_build_object(metric.key,n);
  EXCEPTION WHEN OTHERS THEN result := result || jsonb_build_object(metric.key,NULL); result := jsonb_set(result,ARRAY['errors',metric.key],to_jsonb('Kunne ikke kontrolleres ('||SQLSTATE||')'::text),true); END;
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.hms_control_snapshot(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hms_control_snapshot(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hms_review_integrity() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE cp record; answer jsonb; previous public.hms_internal_reviews;
BEGIN
 IF TG_OP='DELETE' THEN IF OLD.status='completed' OR OLD.signed_at IS NOT NULL THEN RAISE EXCEPTION 'Signert gjennomgang er uforanderlig'; END IF; RETURN OLD; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.status='completed' OR OLD.signed_at IS NOT NULL THEN RAISE EXCEPTION 'Signert gjennomgang er uforanderlig. Opprett ny revisjon.'; END IF;
  IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.previous_review_id IS DISTINCT FROM OLD.previous_review_id OR NEW.version IS DISTINCT FROM OLD.version THEN RAISE EXCEPTION 'Selskaps- og versjonsreferanse er låst'; END IF;
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.previous_review_id IS NOT NULL THEN
   SELECT * INTO previous FROM public.hms_internal_reviews WHERE id=NEW.previous_review_id AND company_id=NEW.company_id AND status='completed';
   IF NOT FOUND THEN RAISE EXCEPTION 'Forrige signerte versjon finnes ikke i selskapet'; END IF;
   NEW.version:=previous.version+1;
  ELSE NEW.version:=1; END IF;
  IF NEW.status='completed' OR NEW.signed_at IS NOT NULL THEN RAISE EXCEPTION 'Opprett utkast før signering'; END IF;
  NEW.auto_snapshot:=public.hms_control_snapshot(NEW.company_id);
 ELSIF NEW.auto_snapshot IS DISTINCT FROM OLD.auto_snapshot THEN NEW.auto_snapshot:=public.hms_control_snapshot(NEW.company_id); END IF;
 IF NEW.status='completed' THEN
  IF NOT public.has_company_access(auth.uid(),NEW.company_id,'hms','edit') THEN RAISE EXCEPTION 'Ingen HMS-tilgang'; END IF;
  FOR cp IN SELECT * FROM (VALUES ('year_wheel','yearActivitiesOverdue'),('actions','overdueActions'),('incidents','openIncidents'),('repeated_incidents','repeatedIncidents'),('serious_incidents','seriousIncidents'),('vernerunder','vernerunderDone'),('handbook_acks','missingHandbookAcks'),('fse','expiredFse'),('first_aid','expiredFirstAid'),('sds','sdsMissing'),('organisation',NULL),('new_methods',NULL),('risk_register','risksNeedingReview'),('hms_goals',NULL)) AS x(key,metric) LOOP
   answer:=NEW.answers->cp.key;
   IF coalesce(answer->>'answer','') NOT IN ('yes','no','na') THEN RAISE EXCEPTION 'Alle kontrollpunkter må besvares'; END IF;
   IF cp.metric IS NOT NULL AND jsonb_typeof(NEW.auto_snapshot->cp.metric) IS DISTINCT FROM 'number' AND (coalesce(answer->>'error_approved','false')<>'true' OR length(trim(coalesce(answer->>'comment','')))=0) THEN RAISE EXCEPTION 'Ukjente systemfakta må kommenteres og godkjennes'; END IF;
  END LOOP;
  NEW.signed_by:=auth.uid(); NEW.signed_at:=now(); NEW.completed_at:=now();
 ELSIF NEW.signed_at IS NOT NULL OR NEW.signed_by IS NOT NULL OR NEW.completed_at IS NOT NULL THEN RAISE EXCEPTION 'Signatur krever fullføring'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hms_review_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.hms_internal_reviews FOR EACH ROW EXECUTE FUNCTION public.hms_review_integrity();

CREATE OR REPLACE FUNCTION public.hms_risk_integrity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.probability IS DISTINCT FROM OLD.probability OR NEW.consequence IS DISTINCT FROM OLD.consequence THEN RAISE EXCEPTION 'Opprinnelig risiko og selskap er historisk låst'; END IF;
 END IF;
 IF NEW.probability NOT BETWEEN 1 AND 5 OR NEW.consequence NOT BETWEEN 1 AND 5 OR (NEW.rest_sannsynlighet IS NOT NULL AND NEW.rest_sannsynlighet NOT BETWEEN 1 AND 5) OR (NEW.rest_konsekvens IS NOT NULL AND NEW.rest_konsekvens NOT BETWEEN 1 AND 5) THEN RAISE EXCEPTION 'Risiko må være mellom 1 og 5'; END IF;
 IF NEW.status NOT IN ('active','mitigated','closed') THEN RAISE EXCEPTION 'Ugyldig risikostatus'; END IF;
 IF NEW.status IN ('mitigated','closed') AND (NEW.rest_sannsynlighet IS NULL OR NEW.rest_konsekvens IS NULL OR NEW.residual_review_required) THEN RAISE EXCEPTION 'Rest-risiko må vurderes eksplisitt før Redusert/Lukket'; END IF;
 IF TG_OP='UPDATE' AND (NEW.rest_sannsynlighet IS DISTINCT FROM OLD.rest_sannsynlighet OR NEW.rest_konsekvens IS DISTINCT FROM OLD.rest_konsekvens OR NEW.residual_reviewed_at IS DISTINCT FROM OLD.residual_reviewed_at OR NEW.status IS DISTINCT FROM OLD.status) THEN
  IF NEW.residual_reviewed_at IS NULL OR NEW.rest_sannsynlighet IS NULL OR NEW.rest_konsekvens IS NULL OR length(trim(coalesce(NEW.residual_comment,'')))=0 THEN RAISE EXCEPTION 'Dokumenter eksplisitt rest-risikovurdering'; END IF;
  IF NOT public.has_company_access(auth.uid(),NEW.company_id,'hms','edit') OR (NEW.responsible_user_id IS NOT NULL AND NEW.responsible_user_id<>auth.uid() AND NOT public.is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'Ansvarlig må vurdere rest-risiko'; END IF;
  NEW.residual_reviewed_by:=auth.uid(); NEW.residual_reviewed_at:=now(); NEW.residual_review_required:=false;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hms_risk_integrity BEFORE INSERT OR UPDATE ON public.hms_risk_register FOR EACH ROW EXECUTE FUNCTION public.hms_risk_integrity();

CREATE OR REPLACE FUNCTION public.hms_action_integrity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid; r public.hms_risk_register; other_id uuid; tenant uuid;
BEGIN
 IF TG_OP='UPDATE' AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN RAISE EXCEPTION 'Selskap er låst'; END IF;
 IF TG_OP<>'DELETE' THEN
  IF NEW.risk_register_id IS NOT NULL THEN
   SELECT * INTO r FROM public.hms_risk_register WHERE id=NEW.risk_register_id FOR UPDATE;
   IF NOT FOUND OR r.company_id<>NEW.company_id OR r.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Risiko tilhører ikke selskapet'; END IF;
   IF TG_OP='INSERT' THEN
    SELECT id INTO other_id FROM public.hms_action_items WHERE company_id=NEW.company_id AND risk_register_id=NEW.risk_register_id AND title=NEW.title AND coalesce(description,'')=coalesce(NEW.description,'') AND deleted_at IS NULL LIMIT 1;
    IF other_id IS NOT NULL THEN RAISE EXCEPTION 'Identisk tiltak finnes allerede'; END IF;
   END IF;
  END IF;
  IF NEW.year_activity_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.hms_year_activities WHERE id=NEW.year_activity_id AND company_id=NEW.company_id) THEN RAISE EXCEPTION 'Årshjul tilhører ikke selskapet'; END IF;
  IF NEW.internal_review_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.hms_internal_reviews WHERE id=NEW.internal_review_id AND company_id=NEW.company_id AND status<>'completed') THEN RAISE EXCEPTION 'Gjennomgang tilhører ikke selskapet eller er signert'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.has_company_access(auth.uid(),NEW.company_id,'hms','edit') THEN
   IF TG_OP<>'UPDATE' OR OLD.assignee_user_id IS DISTINCT FROM auth.uid() OR (to_jsonb(NEW)-ARRAY['status','completed_at','completed_by','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','completed_at','completed_by','updated_at']) OR NEW.status<>'done' THEN RAISE EXCEPTION 'Montør kan kun fullføre eget tiltak'; END IF;
   NEW.completed_by:=auth.uid(); NEW.completed_at:=now();
  END IF;
 END IF;
 rid:=CASE WHEN TG_OP='DELETE' THEN OLD.risk_register_id ELSE NEW.risk_register_id END;
 IF rid IS NOT NULL AND (TG_OP<>'UPDATE' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) THEN
  UPDATE public.hms_risk_register SET residual_review_required=true,updated_at=now() WHERE id=rid;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER hms_action_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.hms_action_items FOR EACH ROW EXECUTE FUNCTION public.hms_action_integrity();

CREATE OR REPLACE FUNCTION public.hms_complete_own_action(_company_id uuid,_action_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Innlogging kreves'; END IF;
 UPDATE public.hms_action_items SET status='done',completed_by=auth.uid(),completed_at=now(),updated_at=now() WHERE id=_action_id AND company_id=_company_id AND assignee_user_id=auth.uid() AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Eget tiltak finnes ikke i selskapet'; END IF;
 RETURN _action_id;
END $$;
REVOKE ALL ON FUNCTION public.hms_complete_own_action(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hms_complete_own_action(uuid,uuid) TO authenticated;
ALTER POLICY phase2_module_view ON public.hms_action_items USING (public.has_company_access(auth.uid(),company_id,'hms','view') OR assignee_user_id=auth.uid());

CREATE OR REPLACE FUNCTION public.hms_control_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_value jsonb; new_value jsonb; changed jsonb; row_value jsonb;
BEGIN
 old_value:=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
 new_value:=CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
 SELECT coalesce(jsonb_object_agg(k,jsonb_build_object('old',old_value->k,'new',new_value->k)),'{}'::jsonb) INTO changed FROM (SELECT jsonb_object_keys(old_value||new_value) k) keys WHERE old_value->k IS DISTINCT FROM new_value->k AND k NOT IN ('updated_at');
 row_value:=CASE WHEN TG_OP='DELETE' THEN old_value ELSE new_value END;
 IF changed<>'{}'::jsonb THEN INSERT INTO public.hms_audit_log(company_id,entity_type,entity_id,action,performed_by,payload) VALUES ((row_value->>'company_id')::uuid,TG_TABLE_NAME,(row_value->>'id')::uuid,lower(TG_OP),auth.uid(),jsonb_build_object('changes',changed,'summary',TG_TABLE_NAME||' '||lower(TG_OP))); END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER hms_risk_audit AFTER INSERT OR UPDATE OR DELETE ON public.hms_risk_register FOR EACH ROW EXECUTE FUNCTION public.hms_control_audit();
CREATE TRIGGER hms_year_audit AFTER INSERT OR UPDATE OR DELETE ON public.hms_year_activities FOR EACH ROW EXECUTE FUNCTION public.hms_control_audit();
CREATE TRIGGER hms_review_audit AFTER INSERT OR UPDATE OR DELETE ON public.hms_internal_reviews FOR EACH ROW EXECUTE FUNCTION public.hms_control_audit();
CREATE TRIGGER hms_action_audit AFTER INSERT OR UPDATE OR DELETE ON public.hms_action_items FOR EACH ROW EXECUTE FUNCTION public.hms_control_audit();
CREATE OR REPLACE FUNCTION public.hms_audit_append_only() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'Revisjonsspor er uforanderlig'; END $$;
CREATE TRIGGER hms_audit_append_only BEFORE UPDATE OR DELETE ON public.hms_audit_log FOR EACH ROW EXECUTE FUNCTION public.hms_audit_append_only();

CREATE OR REPLACE FUNCTION public.hms_complete_year_activity(_company_id uuid,_activity_id uuid,_documentation text,_submission_id uuid DEFAULT NULL,_audit_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a public.hms_year_activities; next_id uuid; next_due date; months integer; last_day integer; old_last integer;
BEGIN
 IF NOT public.has_company_access(auth.uid(),_company_id,'hms','edit') THEN RAISE EXCEPTION 'Ingen HMS-tilgang'; END IF;
 SELECT * INTO a FROM public.hms_year_activities WHERE id=_activity_id AND company_id=_company_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Aktivitet finnes ikke i selskapet'; END IF;
 IF a.status='done' THEN SELECT id INTO next_id FROM public.hms_year_activities WHERE previous_activity_id=a.id AND company_id=_company_id; RETURN next_id; END IF;
 IF _submission_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.hms_submissions WHERE id=_submission_id AND company_id=_company_id AND deleted_at IS NULL AND status IN ('submitted','approved')) THEN RAISE EXCEPTION 'Velg en gjennomført innsending fra selskapet'; END IF;
 IF _audit_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.compliance_audits WHERE id=_audit_id AND company_id=_company_id AND deleted_at IS NULL AND status='completed') THEN RAISE EXCEPTION 'Velg en gjennomført internrevisjon fra selskapet'; END IF;
 IF length(trim(coalesce(_documentation,'')))=0 AND _submission_id IS NULL AND _audit_id IS NULL THEN RAISE EXCEPTION 'Dokumentasjon eller gjennomført aktivitet kreves'; END IF;
 UPDATE public.hms_year_activities SET status='done',completed_by=auth.uid(),completed_at=now(),documentation=_documentation,linked_submission_id=_submission_id,linked_audit_id=coalesce(_audit_id,linked_audit_id),updated_at=now() WHERE id=a.id AND company_id=_company_id;
 IF a.frequency='custom' THEN next_due:=a.due_date+greatest(1,coalesce(a.custom_interval_days,30));
 ELSE
  months:=CASE a.frequency WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 3 WHEN 'semiannual' THEN 6 WHEN 'annual' THEN 12 ELSE NULL END;
  IF months IS NULL THEN RAISE EXCEPTION 'Ugyldig frekvens'; END IF;
  next_due:=(date_trunc('month',a.due_date)+make_interval(months=>months))::date;
  last_day:=extract(day FROM (next_due+interval '1 month - 1 day'));
  old_last:=extract(day FROM (date_trunc('month',a.due_date)+interval '1 month - 1 day'));
  next_due:=next_due+(CASE WHEN extract(day FROM a.due_date)=old_last THEN last_day ELSE least(extract(day FROM a.due_date)::integer,last_day) END)-1;
 END IF;
 INSERT INTO public.hms_year_activities(company_id,name,category,responsible_user_id,deputy_user_id,frequency,custom_interval_days,due_date,status,created_by,previous_activity_id,linked_template_id,linked_risk_id) VALUES (_company_id,a.name,a.category,a.responsible_user_id,a.deputy_user_id,a.frequency,a.custom_interval_days,next_due,'planned',auth.uid(),a.id,a.linked_template_id,a.linked_risk_id) RETURNING id INTO next_id;
 RETURN next_id;
END $$;
REVOKE ALL ON FUNCTION public.hms_complete_year_activity(uuid,uuid,text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hms_complete_year_activity(uuid,uuid,text,uuid,uuid) TO authenticated;