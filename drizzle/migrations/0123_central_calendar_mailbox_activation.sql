CREATE TABLE public.central_calendar_activations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL,
 scope text NOT NULL CHECK (scope IN ('single','all_active')),
 technician_id uuid, mailbox text,
 effective_from timestamptz NOT NULL DEFAULT now(),
 activated_by uuid NOT NULL, confirmation jsonb NOT NULL DEFAULT '{}'::jsonb,
 revoked_at timestamptz, revoked_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((scope='single' AND technician_id IS NOT NULL AND mailbox IS NOT NULL) OR (scope='all_active' AND technician_id IS NULL AND mailbox IS NULL)),
 CHECK (technician_id IS NULL OR technician_id NOT IN ('ebc15ac7-fd4c-461d-a61c-06b97d705cc0','ba707f5e-0a7d-40b8-95f2-896d1c4c01c2'))
);
CREATE UNIQUE INDEX central_cal_act_single ON public.central_calendar_activations(company_id,technician_id) WHERE revoked_at IS NULL AND scope='single';
CREATE UNIQUE INDEX central_cal_act_all ON public.central_calendar_activations(company_id) WHERE revoked_at IS NULL AND scope='all_active';
GRANT SELECT ON public.central_calendar_activations TO authenticated;
GRANT ALL ON public.central_calendar_activations TO service_role;
ALTER TABLE public.central_calendar_activations ENABLE ROW LEVEL SECURITY;
CREATE POLICY cca_read ON public.central_calendar_activations FOR SELECT TO authenticated USING (public.is_global_superadmin(auth.uid()) OR public.has_company_access(auth.uid(),company_id,'resource_plan','edit'));

CREATE TABLE public.central_calendar_conflict_reviews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL, event_id uuid NOT NULL, technician_id uuid NOT NULL, mailbox text NOT NULL, work_date date NOT NULL,
 signature text NOT NULL, summary jsonb NOT NULL DEFAULT '[]'::jsonb,
 detected_at timestamptz NOT NULL DEFAULT now(), approved_by uuid, approved_at timestamptz,
 UNIQUE(event_id,technician_id,work_date,signature)
);
GRANT SELECT ON public.central_calendar_conflict_reviews TO authenticated;
GRANT ALL ON public.central_calendar_conflict_reviews TO service_role;
ALTER TABLE public.central_calendar_conflict_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY cccr_read ON public.central_calendar_conflict_reviews FOR SELECT TO authenticated USING (public.has_company_access(auth.uid(),company_id,'resource_plan','edit'));

CREATE FUNCTION public.central_calendar_mailbox_active(_company uuid,_tech uuid,_mailbox text,_day date,_changed timestamptz) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT _tech NOT IN ('ebc15ac7-fd4c-461d-a61c-06b97d705cc0','ba707f5e-0a7d-40b8-95f2-896d1c4c01c2') AND EXISTS(SELECT 1 FROM public.central_calendar_activations a WHERE a.company_id=_company AND a.revoked_at IS NULL
  AND ((a.scope='single' AND a.technician_id=_tech AND a.mailbox=_mailbox) OR a.scope='all_active')
  AND _day >= (a.effective_from AT TIME ZONE 'Europe/Oslo')::date AND (_changed IS NULL OR _changed >= a.effective_from))
$$;
REVOKE ALL ON FUNCTION public.central_calendar_mailbox_active(uuid,uuid,text,date,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.central_calendar_mailbox_active(uuid,uuid,text,date,timestamptz) TO service_role;

CREATE FUNCTION public.activate_central_calendar(_company uuid,_tech uuid,_phrase text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.technicians; mb text; id uuid;
BEGIN
 IF NOT public.is_global_superadmin(auth.uid()) OR NOT public.has_company_access(auth.uid(),_company,'resource_plan','edit') THEN RAISE EXCEPTION 'superadmin_required'; END IF;
 IF _tech IS NULL THEN
  IF _phrase IS DISTINCT FROM 'AKTIVER KALENDER FOR ALLE AKTIVE MONTØRER' THEN RAISE EXCEPTION 'phrase_mismatch'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.job_calendar_daily_operations o JOIN public.central_calendar_activations a ON a.company_id=o.company_id AND a.technician_id=o.technician_id AND a.scope='single' WHERE o.company_id=_company AND o.kind='create' AND o.state='verified') THEN RAISE EXCEPTION 'pilot_copy_not_verified'; END IF;
  INSERT INTO public.central_calendar_activations(company_id,scope,activated_by,confirmation) VALUES(_company,'all_active',auth.uid(),jsonb_build_object('phrase',_phrase)) RETURNING central_calendar_activations.id INTO id;
  RETURN id;
 END IF;
 SELECT * INTO t FROM public.technicians WHERE technicians.id=_tech;
 mb := lower(btrim(t.email));
 IF NOT FOUND OR _tech IN('ebc15ac7-fd4c-461d-a61c-06b97d705cc0','ba707f5e-0a7d-40b8-95f2-896d1c4c01c2') OR t.deleted_at IS NOT NULL OR t.archived_at IS NOT NULL OR mb IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_accounts ua JOIN public.people p ON p.id=ua.person_id JOIN public.employment_profiles ep ON ep.person_id=p.id WHERE ua.auth_user_id=t.user_id AND ua.is_active AND p.is_active AND ep.company_id=_company AND ep.archived_at IS NULL AND ep.relationship_type='employee') THEN RAISE EXCEPTION 'inactive_or_former_employee'; END IF;
 IF _phrase IS DISTINCT FROM 'AKTIVER KALENDER '||mb THEN RAISE EXCEPTION 'phrase_mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.job_outlook_app_pilot_actions WHERE action='probe_technician_mailbox' AND result->>'pass'='true' AND result->>'technician_id'=_tech::text AND lower(result->>'mailbox')=mb AND created_at>now()-interval '7 days') THEN RAISE EXCEPTION 'fresh_mailbox_probe_required'; END IF;
 INSERT INTO public.central_calendar_activations(company_id,scope,technician_id,mailbox,activated_by,confirmation) VALUES(_company,'single',_tech,mb,auth.uid(),jsonb_build_object('phrase',_phrase)) RETURNING central_calendar_activations.id INTO id;
 RETURN id;
END $$;
CREATE FUNCTION public.revoke_central_calendar(_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_global_superadmin(auth.uid()) THEN RAISE EXCEPTION 'superadmin_required'; END IF;
 UPDATE public.central_calendar_activations SET revoked_at=now(),revoked_by=auth.uid() WHERE id=_id AND revoked_at IS NULL;
 RETURN FOUND;
END $$;
CREATE FUNCTION public.approve_central_calendar_conflict(_review uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.central_calendar_conflict_reviews;
BEGIN
 SELECT * INTO r FROM public.central_calendar_conflict_reviews WHERE id=_review FOR UPDATE;
 IF NOT FOUND OR NOT public.has_company_access(auth.uid(),r.company_id,'resource_plan','edit') THEN RAISE EXCEPTION 'resource_plan_edit_required'; END IF;
 UPDATE public.central_calendar_conflict_reviews SET approved_by=auth.uid(),approved_at=now() WHERE id=_review AND approved_at IS NULL;
 RETURN true;
END $$;
CREATE FUNCTION public.central_calendar_status(_company uuid) RETURNS TABLE(event_id uuid,technician_id uuid,mailbox text,work_date date,link_state text,has_outlook_copy boolean,last_operation text,updated_at timestamptz) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_company_access(auth.uid(),_company,'resource_plan','edit') THEN RAISE EXCEPTION 'resource_plan_edit_required'; END IF;
 RETURN QUERY SELECT l.event_id,l.technician_id,l.mailbox,l.work_date,l.state,l.outlook_event_id IS NOT NULL,
  (SELECT o.kind||':'||o.state FROM public.job_calendar_daily_operations o WHERE o.event_id=l.event_id AND o.technician_id=l.technician_id AND o.work_date=l.work_date ORDER BY o.created_at DESC LIMIT 1), l.updated_at
  FROM public.job_outlook_app_links l WHERE l.company_id=_company AND l.work_date IS NOT NULL ORDER BY l.work_date DESC LIMIT 200;
END $$;
REVOKE ALL ON FUNCTION public.activate_central_calendar(uuid,uuid,text),public.revoke_central_calendar(uuid),public.approve_central_calendar_conflict(uuid),public.central_calendar_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.activate_central_calendar(uuid,uuid,text),public.revoke_central_calendar(uuid),public.approve_central_calendar_conflict(uuid),public.central_calendar_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_central_calendar_day(_key text,_event uuid,_tech uuid,_company uuid,_mailbox text,_day date,_kind text,_start timestamptz,_end timestamptz,_payload jsonb,_graph_id text,_change_key text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE op uuid; e public.events; t public.technicians; l public.job_outlook_app_links; n integer; changed timestamptz; legacy boolean;
BEGIN
 IF _kind NOT IN('create','update','delete') OR _mailbox IS DISTINCT FROM lower(btrim(_mailbox)) THEN RETURN NULL; END IF;
 SELECT * INTO e FROM public.events WHERE id=_event FOR UPDATE;
 IF NOT FOUND OR e.company_id IS DISTINCT FROM _company THEN RETURN NULL; END IF;
 SELECT * INTO t FROM public.technicians WHERE id=_tech;
 IF NOT FOUND OR t.id IN('ebc15ac7-fd4c-461d-a61c-06b97d705cc0','ba707f5e-0a7d-40b8-95f2-896d1c4c01c2') OR t.deleted_at IS NOT NULL OR t.archived_at IS NOT NULL OR lower(btrim(t.email)) IS DISTINCT FROM _mailbox OR NOT EXISTS(SELECT 1 FROM public.user_accounts ua JOIN public.people p ON p.id=ua.person_id JOIN public.employment_profiles ep ON ep.person_id=p.id WHERE ua.auth_user_id=t.user_id AND ua.is_active AND p.is_active AND ep.company_id=_company AND ep.archived_at IS NULL AND ep.relationship_type='employee') THEN RETURN NULL; END IF;
 legacy := EXISTS(SELECT 1 FROM public.job_outlook_app_sync_settings WHERE id=true AND enabled=true AND dry_run=false AND scope_verified_at IS NOT NULL AND _mailbox=ANY(pilot_mailboxes))
  AND EXISTS(SELECT 1 FROM public.job_outlook_app_pilot_targets pt WHERE pt.event_id=_event AND pt.technician_id=_tech AND pt.company_id=_company AND pt.mailbox=_mailbox AND pt.work_date=_day AND pt.revoked_at IS NULL AND pt.expires_at>now());
 IF _kind<>'delete' THEN SELECT max(greatest(created_at,updated_at)) INTO changed FROM public.schedule_blocks WHERE project_id=_event AND technician_id=_tech AND company_id=_company AND source='manual' AND deleted_at IS NULL AND start_at=_start AND end_at=_end; END IF;
 -- No backfill: only days planned/changed after an explicit per-mailbox (or all-active) activation.
 IF NOT legacy AND NOT public.central_calendar_mailbox_active(_company,_tech,_mailbox,_day,CASE WHEN _kind='delete' THEN NULL ELSE coalesce(changed,'-infinity'::timestamptz) END) THEN RETURN NULL; END IF;
 SELECT * INTO l FROM public.job_outlook_app_links WHERE event_id=_event AND technician_id=_tech AND company_id=_company AND mailbox=_mailbox AND work_date=_day FOR UPDATE;
 IF _kind IN('update','delete') AND (NOT FOUND OR l.outlook_event_id IS DISTINCT FROM _graph_id OR l.outlook_change_key IS DISTINCT FROM _change_key OR _graph_id IS NULL OR _change_key IS NULL OR l.adopted_from_day_link_id IS NOT NULL) THEN RETURN NULL; END IF;
 SELECT count(*) INTO n FROM public.schedule_blocks WHERE project_id=_event AND technician_id=_tech AND company_id=_company AND source='manual' AND deleted_at IS NULL AND (start_at AT TIME ZONE 'Europe/Oslo')::date=_day;
 IF _kind='delete' THEN
  IF e.deleted_at IS NULL AND e.status NOT IN('cancelled','archived') AND EXISTS(SELECT 1 FROM public.event_technicians WHERE event_id=_event AND technician_id=_tech) AND n>0 THEN RETURN NULL; END IF;
 ELSE
  IF e.deleted_at IS NOT NULL OR e.status IN('cancelled','archived') OR n<>1 OR changed IS NULL OR NOT EXISTS(SELECT 1 FROM public.event_technicians WHERE event_id=_event AND technician_id=_tech) THEN RETURN NULL; END IF;
 END IF;
 IF _kind='create' AND (EXISTS(SELECT 1 FROM public.job_outlook_app_links WHERE event_id=_event AND technician_id=_tech AND (work_date=_day OR work_date IS NULL) AND outlook_event_id IS NOT NULL) OR EXISTS(SELECT 1 FROM public.job_calendar_day_links WHERE event_id=_event AND technician_id=_tech AND work_date=_day) OR EXISTS(SELECT 1 FROM public.event_technicians WHERE event_id=_event AND technician_id=_tech AND calendar_event_id IS NOT NULL) OR EXISTS(SELECT 1 FROM public.job_calendar_links WHERE job_id=_event AND technician_id=_tech AND calendar_event_id IS NOT NULL) OR EXISTS(SELECT 1 FROM public.m365_organizer_links WHERE event_id=_event AND technician_id=_tech AND graph_event_id IS NOT NULL)) THEN RETURN NULL; END IF;
 INSERT INTO public.job_calendar_daily_operations(operation_key,company_id,event_id,technician_id,mailbox,work_date,kind,payload,graph_event_id,graph_change_key) VALUES(_key,_company,_event,_tech,_mailbox,_day,_kind,_payload,_graph_id,_change_key) ON CONFLICT DO NOTHING RETURNING id INTO op;
 RETURN op;
END $$;