CREATE TABLE public.job_calendar_one_shot_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), target_id uuid NOT NULL REFERENCES public.job_outlook_app_pilot_targets(id), actor uuid NOT NULL,
 event_id uuid NOT NULL CHECK(event_id='0ecc7c59-c231-4102-8f0c-91d2091172e8'), technician_id uuid NOT NULL CHECK(technician_id='b0716dc3-ddf7-4501-92af-2397a5180085'),
 company_id uuid NOT NULL CHECK(company_id='a0000000-0000-0000-0000-000000000001'), mailbox text NOT NULL CHECK(mailbox='mats.lien.hansen@mcselektrotavler.no'), work_date date NOT NULL CHECK(work_date='2026-11-19'),
 idempotency_key uuid NOT NULL DEFAULT '3d5f38ae-63a7-4d23-8179-863e169a88f5' CHECK(idempotency_key='3d5f38ae-63a7-4d23-8179-863e169a88f5'),
 payload jsonb NOT NULL, payload_hash text NOT NULL, job_snapshot jsonb NOT NULL, schedule_signature text NOT NULL,
 state text NOT NULL DEFAULT 'prepared' CHECK(state IN('prepared','posting','succeeded','uncertain','failed')), expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
 graph_event_id text, graph_change_key text, http_status integer, created_at timestamptz NOT NULL DEFAULT now(), consumed_at timestamptz, finished_at timestamptz
);
GRANT ALL ON public.job_calendar_one_shot_runs TO service_role;
ALTER TABLE public.job_calendar_one_shot_runs ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX job_calendar_one_shot_consumed ON public.job_calendar_one_shot_runs(idempotency_key) WHERE consumed_at IS NOT NULL;
CREATE TABLE public.job_calendar_one_shot_audit (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),run_id uuid NOT NULL REFERENCES public.job_calendar_one_shot_runs(id),actor uuid NOT NULL,action text NOT NULL CHECK(action IN('preflight','consumed','receipt','reconcile')),state text NOT NULL,http_status integer,created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT ON public.job_calendar_one_shot_audit TO service_role;
ALTER TABLE public.job_calendar_one_shot_audit ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.claim_job_calendar_one_shot(_run uuid,_actor uuid,_hash text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.job_calendar_one_shot_runs; e public.events; t public.job_outlook_app_pilot_targets; tech public.technicians; a public.job_approvals; n integer;
BEGIN
 SELECT * INTO r FROM public.job_calendar_one_shot_runs WHERE id=_run FOR UPDATE;
 IF NOT FOUND OR r.actor<>_actor OR r.payload_hash<>_hash OR r.state<>'prepared' OR r.consumed_at IS NOT NULL OR r.expires_at<=now() OR now()>='2026-11-19 07:00Z'::timestamptz OR NOT public.is_global_superadmin(_actor) OR NOT public.has_company_access(_actor,r.company_id,'resource_plan','edit') THEN RETURN false; END IF;
 SELECT * INTO e FROM public.events WHERE id=r.event_id FOR UPDATE;
 IF NOT FOUND OR e.company_id<>r.company_id OR e.deleted_at IS NOT NULL OR e.status IN('cancelled','archived') OR to_jsonb(e) IS DISTINCT FROM r.job_snapshot THEN RETURN false; END IF;
 SELECT * INTO t FROM public.job_outlook_app_pilot_targets WHERE id=r.target_id FOR UPDATE;
 IF NOT FOUND OR t.revoked_at IS NOT NULL OR t.expires_at<=now() OR t.event_id<>r.event_id OR t.technician_id<>r.technician_id OR t.company_id<>r.company_id OR t.mailbox<>r.mailbox OR t.work_date<>r.work_date THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.job_outlook_app_sync_settings WHERE id=true AND enabled=false AND dry_run=true AND cardinality(pilot_mailboxes)=0 AND scope_verified_at IS NULL) THEN RETURN false; END IF;
 SELECT * INTO tech FROM public.technicians WHERE id=r.technician_id;
 IF NOT FOUND OR tech.deleted_at IS NOT NULL OR tech.archived_at IS NOT NULL OR lower(btrim(tech.email))<>r.mailbox OR NOT EXISTS(SELECT 1 FROM public.event_technicians WHERE event_id=r.event_id AND technician_id=r.technician_id) OR NOT EXISTS(SELECT 1 FROM public.user_accounts ua JOIN public.people p ON p.id=ua.person_id JOIN public.employment_profiles ep ON ep.person_id=ua.person_id WHERE ua.auth_user_id=tech.user_id AND ua.is_active AND p.is_active AND ep.company_id=r.company_id AND ep.archived_at IS NULL AND ep.relationship_type='employee') THEN RETURN false; END IF;
 SELECT * INTO a FROM public.job_approvals WHERE job_id=r.event_id AND technician_user_id=tech.user_id ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND OR a.status NOT IN('pending','approved') OR public.assignment_schedule_signature(r.event_id,tech.user_id) IS DISTINCT FROM r.schedule_signature THEN RETURN false; END IF;
 SELECT count(*) INTO n FROM public.schedule_blocks WHERE project_id=r.event_id AND technician_id=r.technician_id AND deleted_at IS NULL AND (start_at AT TIME ZONE 'Europe/Oslo')::date=r.work_date;
 IF n<>1 OR NOT EXISTS(SELECT 1 FROM public.schedule_blocks WHERE project_id=r.event_id AND technician_id=r.technician_id AND company_id=r.company_id AND source='manual' AND deleted_at IS NULL AND start_at='2026-11-19 07:00Z'::timestamptz AND end_at='2026-11-19 15:00Z'::timestamptz) THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.job_outlook_app_pilot_actions WHERE target_id=t.id AND action='probe_mailbox' AND created_at<=now() AND created_at>now()-interval '24 hours' AND result @> '{"http":200,"pass":true,"tid_match":true,"appid_match":true}'::jsonb AND created_at=(SELECT max(created_at) FROM public.job_outlook_app_pilot_actions WHERE target_id=t.id AND action='probe_mailbox')) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.job_outlook_app_links WHERE event_id=r.event_id AND technician_id=r.technician_id AND (work_date=r.work_date OR work_date IS NULL)) OR EXISTS(SELECT 1 FROM public.job_calendar_links WHERE job_id=r.event_id AND technician_id=r.technician_id AND calendar_event_id IS NOT NULL) OR EXISTS(SELECT 1 FROM public.m365_organizer_links WHERE event_id=r.event_id AND technician_id=r.technician_id AND graph_event_id IS NOT NULL) OR EXISTS(SELECT 1 FROM public.event_technicians WHERE event_id=r.event_id AND technician_id=r.technician_id AND calendar_event_id IS NOT NULL) OR EXISTS(SELECT 1 FROM public.job_approvals WHERE job_id=r.event_id AND technician_user_id=tech.user_id AND outlook_event_id IS NOT NULL) THEN RETURN false; END IF;
 INSERT INTO public.job_calendar_day_links(event_id,technician_id,work_date,start_at,end_at,status,idempotency_key,last_error) VALUES(r.event_id,r.technician_id,r.work_date,'2026-11-19 07:00Z','2026-11-19 15:00Z','pending','calday:'||r.event_id||':'||r.technician_id||':'||r.work_date,'one_shot_reserved') ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RETURN false; END IF;
 UPDATE public.job_calendar_one_shot_runs SET state='posting',consumed_at=now() WHERE id=r.id;
 INSERT INTO public.job_calendar_one_shot_audit(run_id,actor,action,state) VALUES(r.id,_actor,'consumed','posting'); RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_job_calendar_one_shot(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_job_calendar_one_shot(uuid,uuid,text) TO service_role;
CREATE FUNCTION public.finish_job_calendar_one_shot(_run uuid,_actor uuid,_state text,_event_id text,_http integer,_change_key text DEFAULT NULL,_reconcile boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.job_calendar_one_shot_runs;
BEGIN
 IF NOT public.is_global_superadmin(_actor) OR _state NOT IN('succeeded','uncertain','failed') OR (_state='succeeded' AND (NULLIF(_event_id,'') IS NULL OR _http NOT IN(200,201))) THEN RETURN false; END IF;
 SELECT * INTO r FROM public.job_calendar_one_shot_runs WHERE id=_run FOR UPDATE;
 IF NOT FOUND OR r.consumed_at IS NULL OR r.state NOT IN('posting','uncertain','failed') OR (_reconcile AND _state<>'succeeded') OR (NOT _reconcile AND r.actor<>_actor) THEN RETURN false; END IF;
 IF _state='succeeded' THEN
 INSERT INTO public.job_outlook_app_links(company_id,event_id,technician_id,mailbox,work_date,dedup_key,outlook_event_id,outlook_change_key,state,hub_version) VALUES(r.company_id,r.event_id,r.technician_id,r.mailbox,r.work_date,'mcs-jobday-'||r.event_id||'-'||r.technician_id||'-'||r.work_date||'-'||r.mailbox,_event_id,_change_key,'synced',NULL);
 END IF;
 UPDATE public.job_calendar_one_shot_runs SET state=_state,graph_event_id=_event_id,graph_change_key=_change_key,http_status=_http,finished_at=now() WHERE id=r.id;
 INSERT INTO public.job_calendar_one_shot_audit(run_id,actor,action,state,http_status) VALUES(r.id,_actor,CASE WHEN _reconcile THEN 'reconcile' ELSE 'receipt' END,_state,_http);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finish_job_calendar_one_shot(uuid,uuid,text,text,integer,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_job_calendar_one_shot(uuid,uuid,text,text,integer,text,boolean) TO service_role;