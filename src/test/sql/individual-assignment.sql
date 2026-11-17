-- Definitions only. No existing job, response, queue or calendar row is changed.
ALTER TABLE public.job_approvals ADD COLUMN IF NOT EXISTS schedule_signature text;

CREATE OR REPLACE FUNCTION public.assignment_schedule_signature(_event uuid,_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT md5(concat(e.start_time::text,'|',e.end_time::text,'|',et.start_at::text,'|',et.end_at::text,'|',
   COALESCE((SELECT string_agg(concat(sb.id,':',sb.start_at,':',sb.end_at),'|' ORDER BY sb.id)
   FROM public.schedule_blocks sb WHERE (sb.project_id=e.id OR sb.job_id=e.id)
   AND sb.technician_id=t.id AND sb.deleted_at IS NULL AND sb.source IN ('manual','system')),'')))
 FROM public.events e JOIN public.event_technicians et ON et.event_id=e.id
 JOIN public.technicians t ON t.id=et.technician_id WHERE e.id=_event AND t.user_id=_user LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.assignment_schedule_signature(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assignment_schedule_signature(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.stamp_assignment_response_schedule()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' OR NEW.token IS DISTINCT FROM OLD.token OR (NEW.status='pending' AND OLD.status<>'pending') THEN
  NEW.schedule_signature:=public.assignment_schedule_signature(NEW.job_id,NEW.technician_user_id);
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER stamp_assignment_response_schedule BEFORE INSERT OR UPDATE ON public.job_approvals
FOR EACH ROW EXECUTE FUNCTION public.stamp_assignment_response_schedule();
REVOKE ALL ON FUNCTION public.stamp_assignment_response_schedule() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.respond_to_job_assignment(_token uuid,_action text,_comment text DEFAULT NULL,_start timestamptz DEFAULT NULL,_end timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.job_approvals%ROWTYPE; e public.events%ROWTYPE; tech public.technicians%ROWTYPE; current_signature text;
BEGIN
 IF _action IS NULL OR _action NOT IN ('approve','reject','reschedule') OR length(COALESCE(_comment,''))>4000 THEN
  RETURN jsonb_build_object('error','invalid_response','http_status',400); END IF;
 SELECT * INTO a FROM public.job_approvals WHERE token=_token;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','invalid_token','http_status',404); END IF;
 -- Lock order shared with planner edits: event first, then individual response.
 SELECT * INTO e FROM public.events WHERE id=a.job_id FOR UPDATE;
 IF NOT FOUND OR e.deleted_at IS NOT NULL OR e.status IN ('cancelled','archived') THEN
  RETURN jsonb_build_object('error','job_no_longer_active','http_status',409); END IF;
 SELECT * INTO a FROM public.job_approvals WHERE id=a.id AND token=_token FOR UPDATE;
 IF NOT FOUND OR a.status<>'pending' THEN RETURN jsonb_build_object('error','already_answered_or_replaced','http_status',409); END IF;
 IF a.expires_at IS NULL OR a.expires_at<=now() THEN RETURN jsonb_build_object('error','expired_token','http_status',410); END IF;
 SELECT t.* INTO tech FROM public.technicians t JOIN public.event_technicians et ON et.technician_id=t.id
 WHERE et.event_id=e.id AND t.user_id=a.technician_user_id AND t.archived_at IS NULL AND t.deleted_at IS NULL;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.user_accounts ua WHERE ua.auth_user_id=a.technician_user_id AND ua.is_active)
 OR NOT public.is_employee_of(a.technician_user_id,e.company_id) THEN
  RETURN jsonb_build_object('error','assignment_no_longer_active','http_status',403); END IF;
 current_signature:=public.assignment_schedule_signature(e.id,a.technician_user_id);
 IF a.schedule_signature IS NOT NULL AND a.schedule_signature IS DISTINCT FROM current_signature THEN
  RETURN jsonb_build_object('error','schedule_changed','http_status',409); END IF;
 IF _action='reject' AND length(btrim(COALESCE(_comment,'')))=0 THEN
  RETURN jsonb_build_object('error','rejection_reason_required','http_status',400); END IF;
 IF _action='reschedule' AND (_start IS NULL OR _end IS NULL OR _end<=_start) THEN
  RETURN jsonb_build_object('error','invalid_proposed_range','http_status',400); END IF;
 UPDATE public.job_approvals SET status=CASE _action WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'reschedule_requested' END,
 responded_at=now(),comment=_comment,proposed_start=CASE WHEN _action='reschedule' THEN _start END,
 proposed_end=CASE WHEN _action='reschedule' THEN _end END WHERE id=a.id AND token=_token AND status='pending';
 INSERT INTO public.event_logs(event_id,action_type,performed_by,change_summary)
 VALUES(e.id,'status_changed',a.technician_user_id,concat(tech.name,': egen tildeling ',CASE _action WHEN 'approve' THEN 'godkjent' WHEN 'reject' THEN 'avslått; plan beholdes til eksplisitt avplanlegging' ELSE 'nytt tidspunkt foreslått; plan uendret' END));
 RETURN jsonb_build_object('success',true,'http_status',200,'message',CASE _action WHEN 'approve' THEN 'Din tildeling er godkjent.' WHEN 'reject' THEN 'Din tildeling er avslått. Planreservasjonen beholdes til planlegger avplanlegger.' ELSE 'Nytt tidspunkt er foreslått for din tildeling.' END);
END $$;
REVOKE ALL ON FUNCTION public.respond_to_job_assignment(uuid,text,text,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_job_assignment(uuid,text,text,timestamptz,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.invalidate_assignment_response(_event uuid,_tech uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.job_approvals a SET status='pending',token=gen_random_uuid(),responded_at=NULL,comment=NULL,
 proposed_start=NULL,proposed_end=NULL,reminder_count=0,last_reminded_at=NULL,expires_at=now()+interval '48 hours'
 FROM public.technicians t WHERE t.id=_tech AND t.user_id=a.technician_user_id AND a.job_id=_event;
END $$;
REVOKE ALL ON FUNCTION public.invalidate_assignment_response(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.invalidate_assignment_response(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.invalidate_changed_plan_response()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.start_at IS NOT DISTINCT FROM OLD.start_at AND NEW.end_at IS NOT DISTINCT FROM OLD.end_at AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at AND NEW.technician_id IS NOT DISTINCT FROM OLD.technician_id AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id AND NEW.job_id IS NOT DISTINCT FROM OLD.job_id THEN RETURN NEW; END IF;
 IF TG_OP<>'DELETE' AND NEW.source IN ('manual','system') THEN
  PERFORM public.invalidate_assignment_response(COALESCE(NEW.job_id,NEW.project_id),NEW.technician_id);
 END IF;
 IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND (OLD.technician_id IS DISTINCT FROM NEW.technician_id OR OLD.project_id IS DISTINCT FROM NEW.project_id OR OLD.job_id IS DISTINCT FROM NEW.job_id)) THEN
  IF OLD.source IN ('manual','system') THEN PERFORM public.invalidate_assignment_response(COALESCE(OLD.job_id,OLD.project_id),OLD.technician_id); END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE OR REPLACE TRIGGER invalidate_changed_plan_response AFTER INSERT OR UPDATE OR DELETE ON public.schedule_blocks
FOR EACH ROW EXECUTE FUNCTION public.invalidate_changed_plan_response();
REVOKE ALL ON FUNCTION public.invalidate_changed_plan_response() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.sync_schedule_block_for_event_technician()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.events%ROWTYPE; s timestamptz; f timestamptz;
BEGIN
 IF TG_OP='DELETE' THEN
  UPDATE public.schedule_blocks SET deleted_at=now(),deleted_reason='event_technician removed',updated_at=now()
  WHERE (project_id=OLD.event_id OR job_id=OLD.event_id) AND technician_id=OLD.technician_id AND source IN ('manual','system') AND deleted_at IS NULL;
  RETURN OLD;
 END IF;
 SELECT * INTO e FROM public.events WHERE id=NEW.event_id;
 IF NOT FOUND OR e.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
 s:=COALESCE(NEW.start_at,e.start_time); f:=COALESCE(NEW.end_at,e.end_time);
 IF s IS NULL OR f IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF current_setting('mcs.event_time_shift',true)='on' THEN RETURN NEW; END IF;
  IF NEW.start_at IS NOT DISTINCT FROM OLD.start_at AND NEW.end_at IS NOT DISTINCT FROM OLD.end_at THEN RETURN NEW; END IF;
  -- Assignment-level edits move all OWN days by local wall-clock delta, never a random most-recent block.
  UPDATE public.schedule_blocks SET
   start_at=((start_at AT TIME ZONE 'Europe/Oslo')+((s AT TIME ZONE 'Europe/Oslo')-(COALESCE(OLD.start_at,e.start_time) AT TIME ZONE 'Europe/Oslo'))) AT TIME ZONE 'Europe/Oslo',
   end_at=((end_at AT TIME ZONE 'Europe/Oslo')+((f AT TIME ZONE 'Europe/Oslo')-(COALESCE(OLD.end_at,e.end_time) AT TIME ZONE 'Europe/Oslo'))) AT TIME ZONE 'Europe/Oslo',updated_at=now()
  WHERE (project_id=e.id OR job_id=e.id) AND technician_id=NEW.technician_id AND source IN ('manual','system') AND deleted_at IS NULL;
  IF FOUND THEN RETURN NEW; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.schedule_blocks WHERE (project_id=e.id OR job_id=e.id) AND technician_id=NEW.technician_id AND start_at=s AND end_at=f AND deleted_at IS NULL AND source IN ('manual','system')) THEN
  INSERT INTO public.schedule_blocks(company_id,technician_id,project_id,source,start_at,end_at,title,match_state,match_confidence,match_reason)
  VALUES(e.company_id,NEW.technician_id,e.id,'manual',s,f,e.title,'manual',100,'Tildelt arbeidsbesøk');
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_schedule_block_for_event_technician() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.sync_schedule_blocks_for_event_time_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous_guard text:=current_setting('mcs.event_time_shift',true);
BEGIN
 IF OLD.start_time IS DISTINCT FROM NEW.start_time OR OLD.end_time IS DISTINCT FROM NEW.end_time THEN
  IF OLD.start_time IS NULL OR OLD.end_time IS NULL OR NEW.start_time IS NULL OR NEW.end_time IS NULL THEN
   IF EXISTS(SELECT 1 FROM public.schedule_blocks WHERE (project_id=NEW.id OR job_id=NEW.id) AND deleted_at IS NULL) THEN RAISE EXCEPTION 'scheduled_range_required'; END IF;
  ELSE
   PERFORM set_config('mcs.event_time_shift','on',true);
   UPDATE public.event_technicians SET
    start_at=CASE WHEN start_at IS NULL THEN NULL ELSE ((start_at AT TIME ZONE 'Europe/Oslo')+((NEW.start_time AT TIME ZONE 'Europe/Oslo')-(OLD.start_time AT TIME ZONE 'Europe/Oslo'))) AT TIME ZONE 'Europe/Oslo' END,
    end_at=CASE WHEN end_at IS NULL THEN NULL ELSE ((end_at AT TIME ZONE 'Europe/Oslo')+((NEW.end_time AT TIME ZONE 'Europe/Oslo')-(OLD.end_time AT TIME ZONE 'Europe/Oslo'))) AT TIME ZONE 'Europe/Oslo' END WHERE event_id=NEW.id;
   PERFORM set_config('mcs.event_time_shift',COALESCE(previous_guard,''),true);
   UPDATE public.schedule_blocks SET
    start_at=((start_at AT TIME ZONE 'Europe/Oslo')+((NEW.start_time AT TIME ZONE 'Europe/Oslo')-(OLD.start_time AT TIME ZONE 'Europe/Oslo'))) AT TIME ZONE 'Europe/Oslo',
    end_at=((end_at AT TIME ZONE 'Europe/Oslo')+((NEW.end_time AT TIME ZONE 'Europe/Oslo')-(OLD.end_time AT TIME ZONE 'Europe/Oslo'))) AT TIME ZONE 'Europe/Oslo',updated_at=now()
   WHERE (project_id=NEW.id OR job_id=NEW.id) AND source IN ('manual','system') AND deleted_at IS NULL;
  END IF;
 END IF;
 IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
  UPDATE public.schedule_blocks SET deleted_at=now(),deleted_reason='event soft-deleted',updated_at=now()
  WHERE (project_id=NEW.id OR job_id=NEW.id) AND source IN ('manual','system') AND deleted_at IS NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_schedule_blocks_for_event_time_change() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.edit_resource_job_plan(_event uuid,_technicians uuid[],_start timestamptz,_end timestamptz,_expected_start timestamptz,_expected_end timestamptz,_expected_technicians uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.events%ROWTYPE; t uuid; removed uuid[]; added uuid[]; current_ids uuid[]; template jsonb; d jsonb;
BEGIN
 SELECT * INTO e FROM public.events WHERE id=_event FOR UPDATE;
 IF NOT FOUND OR NOT public.has_company_access(auth.uid(),e.company_id,'resource_plan','edit') THEN RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501'; END IF;
 IF e.deleted_at IS NOT NULL OR e.status IN ('cancelled','archived') THEN RAISE EXCEPTION 'job_no_longer_active'; END IF;
 IF _start IS NULL OR _end IS NULL OR _end<=_start OR _technicians IS NULL OR cardinality(_technicians)>100 OR array_position(_technicians,NULL) IS NOT NULL THEN RAISE EXCEPTION 'invalid_plan'; END IF;
 SELECT COALESCE(array_agg(technician_id ORDER BY technician_id),'{}'::uuid[]) INTO current_ids FROM public.event_technicians WHERE event_id=_event;
 IF e.start_time IS DISTINCT FROM _expected_start OR e.end_time IS DISTINCT FROM _expected_end OR current_ids IS DISTINCT FROM (SELECT COALESCE(array_agg(x ORDER BY x),'{}'::uuid[]) FROM unnest(_expected_technicians) x) THEN RAISE EXCEPTION 'plan_changed_reload'; END IF;
 SELECT COALESCE(array_agg(x),'{}'::uuid[]) INTO added FROM (SELECT DISTINCT unnest(_technicians) x EXCEPT SELECT unnest(current_ids)) q;
 SELECT COALESCE(array_agg(x),'{}'::uuid[]) INTO removed FROM (SELECT unnest(current_ids) x EXCEPT SELECT unnest(_technicians)) q;
 IF cardinality(removed)>0 AND NOT public.check_permission_v2(auth.uid(),'calendar.delete_events') THEN RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501'; END IF;
 FOREACH t IN ARRAY added LOOP
  IF NOT EXISTS(SELECT 1 FROM public.technicians tech JOIN public.user_accounts ua ON ua.auth_user_id=tech.user_id AND ua.is_active
  WHERE tech.id=t AND tech.deleted_at IS NULL AND tech.archived_at IS NULL AND public.is_employee_of(tech.user_id,e.company_id)) THEN RAISE EXCEPTION 'invalid_company_assignee'; END IF;
 END LOOP;
 -- Snapshot before edits; additions inherit actual separate days, not an arbitrary owner's calendar ID.
 SELECT COALESCE(jsonb_agg(jsonb_build_object('s',s,'f',f)),'[]'::jsonb) INTO template FROM
 (SELECT DISTINCT start_at s,end_at f FROM public.schedule_blocks WHERE (project_id=_event OR job_id=_event) AND deleted_at IS NULL AND source IN ('manual','system')) q;
 -- Add first; replacement of the last assignee must not cancel a task.
 FOREACH t IN ARRAY added LOOP
  INSERT INTO public.event_technicians(event_id,technician_id) VALUES(_event,t);
  IF jsonb_array_length(template)>0 THEN
   -- Remove only the new automatically created default day before installing explicit template days.
   DELETE FROM public.schedule_blocks WHERE (project_id=_event OR job_id=_event) AND technician_id=t AND source IN ('manual','system') AND deleted_at IS NULL;
   FOR d IN SELECT value FROM jsonb_array_elements(template) LOOP
    INSERT INTO public.schedule_blocks(company_id,technician_id,project_id,source,start_at,end_at,title,match_state,match_confidence,match_reason)
    VALUES(e.company_id,t,_event,'manual',(d->>'s')::timestamptz,(d->>'f')::timestamptz,e.title,'manual',100,'Eksplisitt plantildeling');
   END LOOP;
  END IF;
 END LOOP;
 FOREACH t IN ARRAY removed LOOP PERFORM public.remove_work_visit_from_plan(_event,t,false,NULL,auth.uid()); END LOOP;
 UPDATE public.events SET start_time=_start,end_time=_end WHERE id=_event;
 RETURN jsonb_build_object('added',added,'removed',removed,'calendar_removal','held_requires_explicit_retry');
END $$;
REVOKE ALL ON FUNCTION public.edit_resource_job_plan(uuid,uuid[],timestamptz,timestamptz,timestamptz,timestamptz,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.edit_resource_job_plan(uuid,uuid[],timestamptz,timestamptz,timestamptz,timestamptz,uuid[]) TO authenticated;
