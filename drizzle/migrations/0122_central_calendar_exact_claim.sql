CREATE FUNCTION public.claim_central_calendar_day(_key text,_event uuid,_tech uuid,_company uuid,_mailbox text,_day date,_kind text,_start timestamptz,_end timestamptz,_payload jsonb,_graph_id text,_change_key text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE op uuid; e public.events; t public.technicians; l public.job_outlook_app_links; n integer;
BEGIN
 IF _kind NOT IN('create','update','delete') OR _mailbox IS DISTINCT FROM lower(btrim(_mailbox)) THEN RETURN NULL; END IF;
 SELECT * INTO e FROM public.events WHERE id=_event FOR UPDATE;
 IF NOT FOUND OR e.company_id IS DISTINCT FROM _company THEN RETURN NULL; END IF;
 SELECT * INTO t FROM public.technicians WHERE id=_tech;
 IF NOT FOUND OR t.id IN('ebc15ac7-fd4c-461d-a61c-06b97d705cc0','ba707f5e-0a7d-40b8-95f2-896d1c4c01c2') OR t.deleted_at IS NOT NULL OR t.archived_at IS NOT NULL OR lower(btrim(t.email)) IS DISTINCT FROM _mailbox OR NOT EXISTS(SELECT 1 FROM public.user_accounts ua JOIN public.people p ON p.id=ua.person_id JOIN public.employment_profiles ep ON ep.person_id=p.id WHERE ua.auth_user_id=t.user_id AND ua.is_active AND p.is_active AND ep.company_id=_company AND ep.archived_at IS NULL AND ep.relationship_type='employee') THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.job_outlook_app_sync_settings WHERE id=true AND enabled=true AND dry_run=false AND scope_verified_at IS NOT NULL AND _mailbox=ANY(pilot_mailboxes)) THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.job_outlook_app_pilot_targets pt WHERE pt.event_id=_event AND pt.technician_id=_tech AND pt.company_id=_company AND pt.mailbox=_mailbox AND pt.work_date=_day AND pt.revoked_at IS NULL AND pt.expires_at>now()) THEN RETURN NULL; END IF;
 SELECT * INTO l FROM public.job_outlook_app_links WHERE event_id=_event AND technician_id=_tech AND company_id=_company AND mailbox=_mailbox AND work_date=_day FOR UPDATE;
 IF _kind IN('update','delete') AND (NOT FOUND OR l.outlook_event_id IS DISTINCT FROM _graph_id OR l.outlook_change_key IS DISTINCT FROM _change_key OR _graph_id IS NULL OR _change_key IS NULL OR l.adopted_from_day_link_id IS NOT NULL) THEN RETURN NULL; END IF;
 SELECT count(*) INTO n FROM public.schedule_blocks WHERE project_id=_event AND technician_id=_tech AND company_id=_company AND source='manual' AND deleted_at IS NULL AND (start_at AT TIME ZONE 'Europe/Oslo')::date=_day;
 IF _kind='delete' THEN
 IF e.deleted_at IS NULL AND e.status NOT IN('cancelled','archived') AND EXISTS(SELECT 1 FROM public.event_technicians WHERE event_id=_event AND technician_id=_tech) AND n>0 THEN RETURN NULL; END IF;
 ELSE
 IF e.deleted_at IS NOT NULL OR e.status IN('cancelled','archived') OR n<>1 OR NOT EXISTS(SELECT 1 FROM public.event_technicians WHERE event_id=_event AND technician_id=_tech) OR NOT EXISTS(SELECT 1 FROM public.schedule_blocks WHERE project_id=_event AND technician_id=_tech AND company_id=_company AND source='manual' AND deleted_at IS NULL AND start_at=_start AND end_at=_end) THEN RETURN NULL; END IF;
 END IF;
 IF _kind='create' AND (EXISTS(SELECT 1 FROM public.job_outlook_app_links WHERE event_id=_event AND technician_id=_tech AND (work_date=_day OR work_date IS NULL) AND outlook_event_id IS NOT NULL) OR EXISTS(SELECT 1 FROM public.job_calendar_day_links WHERE event_id=_event AND technician_id=_tech AND work_date=_day) OR EXISTS(SELECT 1 FROM public.event_technicians WHERE event_id=_event AND technician_id=_tech AND calendar_event_id IS NOT NULL) OR EXISTS(SELECT 1 FROM public.job_calendar_links WHERE job_id=_event AND technician_id=_tech AND calendar_event_id IS NOT NULL) OR EXISTS(SELECT 1 FROM public.m365_organizer_links WHERE event_id=_event AND technician_id=_tech AND graph_event_id IS NOT NULL)) THEN RETURN NULL; END IF;
 INSERT INTO public.job_calendar_daily_operations(operation_key,company_id,event_id,technician_id,mailbox,work_date,kind,payload,graph_event_id,graph_change_key) VALUES(_key,_company,_event,_tech,_mailbox,_day,_kind,_payload,_graph_id,_change_key) ON CONFLICT DO NOTHING RETURNING id INTO op;
 RETURN op;
END $$;
REVOKE ALL ON FUNCTION public.claim_central_calendar_day(text,uuid,uuid,uuid,text,date,text,timestamptz,timestamptz,jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_central_calendar_day(text,uuid,uuid,uuid,text,date,text,timestamptz,timestamptz,jsonb,text,text) TO service_role;