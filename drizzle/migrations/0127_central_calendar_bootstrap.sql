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
 -- Personally access-restricted people (company_access.* deny) are never activated.
 IF EXISTS(SELECT 1 FROM public.user_permission_overrides_v2 o JOIN public.user_accounts ua ON ua.id=o.user_account_id
   WHERE ua.auth_user_id=t.user_id AND o.permission_key LIKE 'company_access.%' AND o.mode='deny') THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.job_outlook_app_pilot_actions WHERE action='probe_technician_mailbox' AND result->>'pass'='true' AND result->>'technician_id'=_tech::text AND lower(result->>'mailbox')=mb AND result->>'company_id'=_company::text AND created_at>now()-interval '7 days') THEN RETURN 'probe:'||mb; END IF;
 IF EXISTS(SELECT 1 FROM public.job_outlook_app_pilot_actions f WHERE f.action='probe_technician_mailbox' AND f.result->>'technician_id'=_tech::text AND f.result->>'pass' IS DISTINCT FROM 'true'
   AND f.created_at>(SELECT max(created_at) FROM public.job_outlook_app_pilot_actions s WHERE s.action='probe_technician_mailbox' AND s.result->>'pass'='true' AND s.result->>'technician_id'=_tech::text)) THEN RETURN 'probe:'||mb; END IF;
 RETURN mb;
END $$;
REVOKE ALL ON FUNCTION public._central_calendar_eligible(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._central_calendar_eligible(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.bootstrap_central_calendar(_company uuid, _tech uuid, _phrase text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE mb text; id uuid;
BEGIN
 IF NOT public.is_global_superadmin(auth.uid()) OR NOT public.has_company_access(auth.uid(),_company,'resource_plan','edit') THEN RAISE EXCEPTION 'superadmin_required'; END IF;
 IF _tech IS NULL THEN RAISE EXCEPTION 'named_technician_required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('central_calendar_bootstrap'));
 IF public.central_calendar_automatic_pilot_proven() THEN RAISE EXCEPTION 'bootstrap_not_needed_use_batches'; END IF;
 IF EXISTS(SELECT 1 FROM public.central_calendar_activations WHERE confirmation->>'bootstrap'='true') THEN RAISE EXCEPTION 'bootstrap_already_used'; END IF;
 IF EXISTS(SELECT 1 FROM public.central_calendar_activations WHERE technician_id=_tech AND revoked_at IS NULL) THEN RAISE EXCEPTION 'already_active'; END IF;
 mb := public._central_calendar_eligible(_company,_tech);
 IF mb IS NULL THEN RAISE EXCEPTION 'not_eligible_inactive_or_restricted'; END IF;
 IF mb LIKE 'probe:%' OR NOT EXISTS(SELECT 1 FROM public.job_outlook_app_pilot_actions WHERE action='probe_technician_mailbox' AND result->>'pass'='true' AND result->>'technician_id'=_tech::text AND lower(result->>'mailbox')=mb AND result->>'company_id'=_company::text AND created_at>now()-interval '24 hours') THEN RAISE EXCEPTION 'fresh_mailbox_probe_24h_required'; END IF;
 IF _phrase IS DISTINCT FROM 'BOOTSTRAP KALENDER '||mb THEN RAISE EXCEPTION 'phrase_mismatch'; END IF;
 INSERT INTO public.central_calendar_activations(company_id,scope,technician_id,mailbox,activated_by,confirmation)
 VALUES(_company,'single',_tech,mb,auth.uid(),jsonb_build_object('phrase',_phrase,'bootstrap',true,'future_only',true,'no_backfill',true,'no_queue_release',true))
 RETURNING central_calendar_activations.id INTO id;
 RETURN id;
END $$;
REVOKE ALL ON FUNCTION public.bootstrap_central_calendar(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_central_calendar(uuid,uuid,text) TO authenticated;