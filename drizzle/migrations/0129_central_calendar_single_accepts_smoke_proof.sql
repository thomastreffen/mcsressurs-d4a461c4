CREATE OR REPLACE FUNCTION public.activate_central_calendar(_company uuid, _tech uuid, _phrase text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE mb text; id uuid;
BEGIN
 IF NOT public.is_global_superadmin(auth.uid()) OR NOT public.has_company_access(auth.uid(),_company,'resource_plan','edit') THEN RAISE EXCEPTION 'superadmin_required'; END IF;
 IF _tech IS NULL THEN RAISE EXCEPTION 'all_active_disabled_use_verified_batches'; END IF;
 mb := public._central_calendar_eligible(_company,_tech);
 IF mb IS NULL THEN RAISE EXCEPTION 'inactive_or_former_employee'; END IF;
 IF mb LIKE 'probe:%' THEN RAISE EXCEPTION 'fresh_mailbox_probe_required'; END IF;
 IF _phrase IS DISTINCT FROM 'AKTIVER KALENDER '||mb THEN RAISE EXCEPTION 'phrase_mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM public.central_calendar_activations WHERE revoked_at IS NULL)
    AND NOT public.central_calendar_automatic_pilot_proven() AND NOT public.central_calendar_api_smoke_proven(_company) THEN RAISE EXCEPTION 'automatic_pilot_not_proven'; END IF;
 INSERT INTO public.central_calendar_activations(company_id,scope,technician_id,mailbox,activated_by,confirmation) VALUES(_company,'single',_tech,mb,auth.uid(),jsonb_build_object('phrase',_phrase,'future_only',true)) RETURNING central_calendar_activations.id INTO id;
 RETURN id;
END $function$;