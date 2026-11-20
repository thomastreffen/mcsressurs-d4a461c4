ALTER TABLE public.job_calendar_daily_operations ADD COLUMN IF NOT EXISTS verification_source text CHECK (verification_source IN ('automatic_readback','manual_link'));

CREATE OR REPLACE FUNCTION public.central_calendar_automatic_pilot_proven()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.job_calendar_daily_operations o
  JOIN public.central_calendar_activations a ON a.company_id=o.company_id AND a.technician_id=o.technician_id AND a.scope='single' AND a.revoked_at IS NULL
  WHERE o.kind='create' AND o.state='verified' AND o.verification_source='automatic_readback' AND o.created_at>=a.effective_from
   AND NOT EXISTS(SELECT 1 FROM public.job_outlook_app_pilot_actions p WHERE p.action LIKE 'retry_central_assignment%' AND p.result->>'event_id'=o.event_id::text AND p.result->>'technician_id'=o.technician_id::text)
   AND NOT EXISTS(SELECT 1 FROM public.job_outlook_app_pilot_actions p WHERE p.action IN ('link_central_operation','inspect_central_operation') AND p.result->>'operation_id'=o.id::text))
$$;
REVOKE ALL ON FUNCTION public.central_calendar_automatic_pilot_proven() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.central_calendar_automatic_pilot_proven() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._central_calendar_eligible(_company uuid, _tech uuid)
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.technicians; mb text;
BEGIN
 SELECT * INTO t FROM public.technicians WHERE id=_tech;
 IF NOT FOUND OR _tech IN('ebc15ac7-fd4c-461d-a61c-06b97d705cc0','ba707f5e-0a7d-40b8-95f2-896d1c4c01c2') OR t.deleted_at IS NOT NULL OR t.archived_at IS NOT NULL THEN RETURN NULL; END IF;
 mb := lower(btrim(t.email));
 IF mb IS NULL OR mb='' THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_accounts ua JOIN public.people p ON p.id=ua.person_id JOIN public.employment_profiles ep ON ep.person_id=p.id
   WHERE ua.auth_user_id=t.user_id AND ua.is_active AND ua.verified_at IS NOT NULL AND p.is_active AND ep.company_id=_company AND ep.archived_at IS NULL AND ep.relationship_type='employee') THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.job_outlook_app_pilot_actions WHERE action='probe_technician_mailbox' AND result->>'pass'='true' AND result->>'technician_id'=_tech::text AND lower(result->>'mailbox')=mb AND result->>'company_id'=_company::text AND created_at>now()-interval '7 days') THEN RETURN 'probe:'||mb; END IF;
 -- A newer failed probe always blocks exactly this person.
 IF EXISTS(SELECT 1 FROM public.job_outlook_app_pilot_actions f WHERE f.action='probe_technician_mailbox' AND f.result->>'technician_id'=_tech::text AND f.result->>'pass' IS DISTINCT FROM 'true'
   AND f.created_at>(SELECT max(created_at) FROM public.job_outlook_app_pilot_actions s WHERE s.action='probe_technician_mailbox' AND s.result->>'pass'='true' AND s.result->>'technician_id'=_tech::text)) THEN RETURN 'probe:'||mb; END IF;
 RETURN mb;
END $$;
REVOKE ALL ON FUNCTION public._central_calendar_eligible(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._central_calendar_eligible(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.activate_central_calendar(_company uuid, _tech uuid, _phrase text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE mb text; id uuid;
BEGIN
 IF NOT public.is_global_superadmin(auth.uid()) OR NOT public.has_company_access(auth.uid(),_company,'resource_plan','edit') THEN RAISE EXCEPTION 'superadmin_required'; END IF;
 -- Blanket activation would include unprobed and future mailboxes; rollout is only via verified batches.
 IF _tech IS NULL THEN RAISE EXCEPTION 'all_active_disabled_use_verified_batches'; END IF;
 mb := public._central_calendar_eligible(_company,_tech);
 IF mb IS NULL THEN RAISE EXCEPTION 'inactive_or_former_employee'; END IF;
 IF mb LIKE 'probe:%' THEN RAISE EXCEPTION 'fresh_mailbox_probe_required'; END IF;
 IF _phrase IS DISTINCT FROM 'AKTIVER KALENDER '||mb THEN RAISE EXCEPTION 'phrase_mismatch'; END IF;
 -- Only the very first pilot may be activated before a fully automatic create+verify is proven.
 IF EXISTS(SELECT 1 FROM public.central_calendar_activations WHERE revoked_at IS NULL) AND NOT public.central_calendar_automatic_pilot_proven() THEN RAISE EXCEPTION 'automatic_pilot_not_proven'; END IF;
 INSERT INTO public.central_calendar_activations(company_id,scope,technician_id,mailbox,activated_by,confirmation) VALUES(_company,'single',_tech,mb,auth.uid(),jsonb_build_object('phrase',_phrase)) RETURNING central_calendar_activations.id INTO id;
 RETURN id;
END $function$;

CREATE OR REPLACE FUNCTION public.activate_central_calendar_batch(_company uuid, _techs uuid[], _phrase text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n int := coalesce(array_length(_techs,1),0); x uuid; mb text; mbs text[] := '{}'; created int := 0;
BEGIN
 IF NOT public.is_global_superadmin(auth.uid()) OR NOT public.has_company_access(auth.uid(),_company,'resource_plan','edit') THEN RAISE EXCEPTION 'superadmin_required'; END IF;
 IF n < 1 OR n > 5 OR (SELECT count(DISTINCT v) FROM unnest(_techs) v) <> n THEN RAISE EXCEPTION 'batch_size_1_to_5'; END IF;
 IF _phrase IS DISTINCT FROM 'AKTIVER KALENDER PULJE '||n||' MONTØRER' THEN RAISE EXCEPTION 'phrase_mismatch'; END IF;
 IF NOT public.central_calendar_automatic_pilot_proven() THEN RAISE EXCEPTION 'automatic_pilot_not_proven'; END IF;
 FOREACH x IN ARRAY _techs LOOP
  mb := public._central_calendar_eligible(_company,x);
  IF mb IS NULL THEN RAISE EXCEPTION 'inactive_or_former_employee:%', x; END IF;
  IF mb LIKE 'probe:%' THEN RAISE EXCEPTION 'fresh_mailbox_probe_required:%', x; END IF;
  IF EXISTS(SELECT 1 FROM public.central_calendar_activations WHERE company_id=_company AND technician_id=x AND revoked_at IS NULL) THEN RAISE EXCEPTION 'already_active:%', x; END IF;
  mbs := mbs || mb;
 END LOOP;
 FOR i IN 1..n LOOP
  INSERT INTO public.central_calendar_activations(company_id,scope,technician_id,mailbox,activated_by,confirmation)
  VALUES(_company,'single',_techs[i],mbs[i],auth.uid(),jsonb_build_object('phrase',_phrase,'batch',to_jsonb(mbs)));
  created := created+1;
 END LOOP;
 RETURN created;
END $$;
REVOKE ALL ON FUNCTION public.activate_central_calendar_batch(uuid,uuid[],text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_central_calendar_batch(uuid,uuid[],text) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_all_central_calendar(_company uuid, _phrase text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c int;
BEGIN
 IF NOT public.is_global_superadmin(auth.uid()) THEN RAISE EXCEPTION 'superadmin_required'; END IF;
 IF _phrase IS DISTINCT FROM 'STOPP KALENDER' THEN RAISE EXCEPTION 'phrase_mismatch'; END IF;
 UPDATE public.central_calendar_activations SET revoked_at=now(),revoked_by=auth.uid() WHERE company_id=_company AND revoked_at IS NULL;
 GET DIAGNOSTICS c = ROW_COUNT;
 RETURN c;
END $$;
REVOKE ALL ON FUNCTION public.revoke_all_central_calendar(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_all_central_calendar(uuid,text) TO authenticated;