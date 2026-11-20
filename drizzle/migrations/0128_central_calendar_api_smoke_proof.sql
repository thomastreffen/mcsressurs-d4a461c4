CREATE OR REPLACE FUNCTION public.central_calendar_api_smoke_proven(_company uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.job_outlook_app_pilot_actions p
  JOIN public.central_calendar_activations a ON a.company_id=_company AND a.scope='single' AND a.revoked_at IS NULL
    AND a.technician_id::text=p.result->>'technician_id' AND lower(a.mailbox)=lower(p.result->>'mailbox')
  WHERE p.action='central_smoke_test' AND p.result->>'company_id'=_company::text AND p.result->>'pass'='true'
    AND p.result->>'stranded'='false' AND p.created_at>now()-interval '7 days')
$$;
REVOKE ALL ON FUNCTION public.central_calendar_api_smoke_proven(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.central_calendar_api_smoke_proven(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.activate_central_calendar_batch(_company uuid, _techs uuid[], _phrase text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n int := coalesce(array_length(_techs,1),0); x uuid; mb text; mbs text[] := '{}'; created int := 0; proof text;
BEGIN
 IF NOT public.is_global_superadmin(auth.uid()) OR NOT public.has_company_access(auth.uid(),_company,'resource_plan','edit') THEN RAISE EXCEPTION 'superadmin_required'; END IF;
 IF n < 1 OR n > 5 OR (SELECT count(DISTINCT v) FROM unnest(_techs) v) <> n THEN RAISE EXCEPTION 'batch_size_1_to_5'; END IF;
 IF _phrase IS DISTINCT FROM 'AKTIVER KALENDER PULJE '||n||' MONTØRER' THEN RAISE EXCEPTION 'phrase_mismatch'; END IF;
 proof := CASE WHEN public.central_calendar_automatic_pilot_proven() THEN 'automatic_readback' WHEN public.central_calendar_api_smoke_proven(_company) THEN 'api_smoke_test' ELSE NULL END;
 IF proof IS NULL THEN RAISE EXCEPTION 'automatic_pilot_not_proven'; END IF;
 FOREACH x IN ARRAY _techs LOOP
  mb := public._central_calendar_eligible(_company,x);
  IF mb IS NULL THEN RAISE EXCEPTION 'inactive_or_former_employee:%', x; END IF;
  IF mb LIKE 'probe:%' THEN RAISE EXCEPTION 'fresh_mailbox_probe_required:%', x; END IF;
  IF EXISTS(SELECT 1 FROM public.central_calendar_activations WHERE company_id=_company AND technician_id=x AND revoked_at IS NULL) THEN RAISE EXCEPTION 'already_active:%', x; END IF;
  mbs := mbs || mb;
 END LOOP;
 FOR i IN 1..n LOOP
  INSERT INTO public.central_calendar_activations(company_id,scope,technician_id,mailbox,activated_by,confirmation)
  VALUES(_company,'single',_techs[i],mbs[i],auth.uid(),jsonb_build_object('phrase',_phrase,'batch',to_jsonb(mbs),'proof',proof,'future_only',true));
  created := created+1;
 END LOOP;
 RETURN created;
END $$;
REVOKE ALL ON FUNCTION public.activate_central_calendar_batch(uuid,uuid[],text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_central_calendar_batch(uuid,uuid[],text) TO authenticated;