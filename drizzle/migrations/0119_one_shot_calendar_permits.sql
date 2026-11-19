-- see /tmp/permits.sql content
CREATE TABLE IF NOT EXISTS public.job_calendar_one_shot_permits (
  idempotency_key uuid PRIMARY KEY,
  permit_id text NOT NULL UNIQUE,
  event_id uuid NOT NULL, technician_id uuid NOT NULL, company_id uuid NOT NULL,
  mailbox text NOT NULL CHECK (mailbox = lower(btrim(mailbox))),
  work_date date NOT NULL, start_at timestamptz NOT NULL, end_at timestamptz NOT NULL CHECK (end_at > start_at),
  phrase text NOT NULL, override_phrase text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
  UNIQUE (event_id, technician_id, work_date)
);
REVOKE ALL ON public.job_calendar_one_shot_permits FROM anon, authenticated;
GRANT SELECT ON public.job_calendar_one_shot_permits TO service_role;
ALTER TABLE public.job_calendar_one_shot_permits ENABLE ROW LEVEL SECURITY;
INSERT INTO public.job_calendar_one_shot_permits(idempotency_key,permit_id,event_id,technician_id,company_id,mailbox,work_date,start_at,end_at,phrase,override_phrase) VALUES
 ('3d5f38ae-63a7-4d23-8179-863e169a88f5','mats_60570','0ecc7c59-c231-4102-8f0c-91d2091172e8','b0716dc3-ddf7-4501-92af-2397a5180085','a0000000-0000-0000-0000-000000000001','mats.lien.hansen@mcselektrotavler.no','2026-11-19','2026-11-19 07:00Z','2026-11-19 15:00Z','OPPRETT MATS 19.11.2026 08–16','OPPRETT LIKEVEL MATS 19.11.2026 08–16 – TIDSKONFLIKT KJENT'),
 ('8c0e2f6a-5b7d-4f4e-9a61-2d3c60576026','mats_60576','1be4a135-c18d-43e8-8290-93eda534cca2','b0716dc3-ddf7-4501-92af-2397a5180085','a0000000-0000-0000-0000-000000000001','mats.lien.hansen@mcselektrotavler.no','2026-11-26','2026-11-26 07:00Z','2026-11-26 15:00Z','OPPRETT MATS 26.11.2026 08–16','OPPRETT LIKEVEL MATS 26.11.2026 08–16 – TIDSKONFLIKT KJENT')
ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.claim_job_calendar_one_shot(_run uuid, _actor uuid, _hash text, _calendar_signature text, _override boolean, _resource_plan_confirmed boolean, _confirm text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE pm public.job_calendar_one_shot_permits; r public.job_calendar_one_shot_runs; e public.events; t public.job_outlook_app_pilot_targets; tech public.technicians; a public.job_approvals; n integer;
BEGIN
 SELECT * INTO r FROM public.job_calendar_one_shot_runs WHERE id=_run FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO pm FROM public.job_calendar_one_shot_permits WHERE idempotency_key=r.idempotency_key AND revoked_at IS NULL;
 IF NOT FOUND OR pm.event_id<>r.event_id OR pm.technician_id<>r.technician_id OR pm.company_id<>r.company_id OR pm.mailbox<>r.mailbox OR pm.work_date<>r.work_date OR r.actor<>_actor OR r.payload_hash<>_hash OR r.state<>'prepared' OR r.consumed_at IS NOT NULL OR r.expires_at<=now() OR now()>=pm.start_at OR NOT public.is_global_superadmin(_actor) OR NOT public.has_company_access(_actor,r.company_id,'resource_plan','edit') THEN RETURN false; END IF;
 IF r.calendar_signature IS NULL OR r.calendar_signature IS DISTINCT FROM _calendar_signature OR _resource_plan_confirmed IS DISTINCT FROM true OR COALESCE(r.conflict_summary->>'category','unknown') NOT IN('clear','other') OR _confirm IS NULL OR _override IS NULL THEN RETURN false; END IF;
 IF r.conflict_summary->>'category'='other' THEN
 IF _override IS DISTINCT FROM true OR _confirm<>pm.override_phrase THEN RETURN false; END IF;
 ELSIF _confirm<>pm.phrase THEN RETURN false; END IF;
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
 IF n<>1 OR NOT EXISTS(SELECT 1 FROM public.schedule_blocks WHERE project_id=r.event_id AND technician_id=r.technician_id AND company_id=r.company_id AND source='manual' AND deleted_at IS NULL AND start_at=pm.start_at AND end_at=pm.end_at) THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.job_outlook_app_pilot_actions WHERE target_id=t.id AND action='probe_mailbox' AND created_at<=now() AND created_at>now()-interval '24 hours' AND result @> '{"http":200,"pass":true,"tid_match":true,"appid_match":true}'::jsonb AND created_at=(SELECT max(created_at) FROM public.job_outlook_app_pilot_actions WHERE target_id=t.id AND action='probe_mailbox')) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.job_outlook_app_links WHERE event_id=r.event_id AND technician_id=r.technician_id AND (work_date=r.work_date OR work_date IS NULL)) OR EXISTS(SELECT 1 FROM public.job_calendar_links WHERE job_id=r.event_id AND technician_id=r.technician_id AND calendar_event_id IS NOT NULL) OR EXISTS(SELECT 1 FROM public.m365_organizer_links WHERE event_id=r.event_id AND technician_id=r.technician_id AND graph_event_id IS NOT NULL) OR EXISTS(SELECT 1 FROM public.event_technicians WHERE event_id=r.event_id AND technician_id=r.technician_id AND calendar_event_id IS NOT NULL) OR EXISTS(SELECT 1 FROM public.job_approvals WHERE job_id=r.event_id AND technician_user_id=tech.user_id AND outlook_event_id IS NOT NULL) THEN RETURN false; END IF;
 INSERT INTO public.job_calendar_day_links(event_id,technician_id,work_date,start_at,end_at,status,idempotency_key,last_error) VALUES(r.event_id,r.technician_id,r.work_date,pm.start_at,pm.end_at,'pending','calday:'||r.event_id||':'||r.technician_id||':'||r.work_date,'one_shot_reserved') ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RETURN false; END IF;
 UPDATE public.job_calendar_one_shot_runs SET conflict_override_confirmed=_override,resource_plan_confirmed=true,confirmation_text=_confirm,state='posting',consumed_at=now() WHERE id=r.id;
 INSERT INTO public.job_calendar_one_shot_audit(run_id,actor,action,state,detail) VALUES(r.id,_actor,'consumed','posting',jsonb_build_object('conflict_override',_override,'resource_plan_confirmed',true,'confirmation',_confirm,'conflicts',r.conflict_summary,'calendar_signature',r.calendar_signature)); RETURN true;
END $function$;