CREATE TABLE public.calendar_delete_retry_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  technician_id uuid NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  event_technician_id uuid,
  technician_user_id uuid,
  technician_name text,
  mailbox text,
  candidate_event_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  start_at timestamptz,
  end_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'resolved', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  last_error text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, technician_id)
);
GRANT SELECT ON public.calendar_delete_retry_queue TO authenticated;
GRANT ALL ON public.calendar_delete_retry_queue TO service_role;
ALTER TABLE public.calendar_delete_retry_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authorized users can view calendar delete retries"
ON public.calendar_delete_retry_queue FOR SELECT TO authenticated
USING (public.check_permission_v2(auth.uid(), 'calendar.delete_events') OR public.is_super_admin(auth.uid()));
CREATE INDEX idx_calendar_delete_retry_pending ON public.calendar_delete_retry_queue (status, next_attempt_at) WHERE status IN ('pending', 'failed');
CREATE INDEX idx_calendar_delete_retry_tech_time ON public.calendar_delete_retry_queue (technician_id, start_at, end_at) WHERE status IN ('pending', 'processing', 'failed');

CREATE OR REPLACE FUNCTION public.set_calendar_delete_retry_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_calendar_delete_retry_updated_at BEFORE UPDATE ON public.calendar_delete_retry_queue FOR EACH ROW EXECUTE FUNCTION public.set_calendar_delete_retry_updated_at();

ALTER TABLE public.event_logs DROP CONSTRAINT IF EXISTS event_logs_action_type_check;
ALTER TABLE public.event_logs ADD CONSTRAINT event_logs_action_type_check CHECK (action_type = ANY (ARRAY['created','updated','cancelled','attendee_added','attendee_removed','technician_assigned','scheduled','work_visit_created','work_visit_repaired','work_visit_existing','work_visit_unplanned','technician_unplanned','outlook_delete_queued','outlook_deleted','outlook_delete_failed']::text[]));

CREATE OR REPLACE FUNCTION public.remove_work_visit_from_plan(
  p_event_id uuid DEFAULT NULL,
  p_technician_id uuid DEFAULT NULL,
  p_remove_all boolean DEFAULT false,
  p_schedule_block_id uuid DEFAULT NULL,
  p_actor uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _event_id uuid := p_event_id;
  _event record;
  _target record;
  _targets integer := 0;
  _blocks integer := 0;
  _step integer := 0;
  _assignments integer := 0;
  _approvals integer := 0;
  _links integer := 0;
  _remaining integer := 0;
  _event_cancelled boolean := false;
  _already_removed boolean := false;
  _candidate_ids jsonb;
BEGIN
  IF _event_id IS NULL AND p_schedule_block_id IS NOT NULL THEN
    SELECT COALESCE(CASE WHEN je.project_type = 'task' THEN je.id END, CASE WHEN pe.project_type = 'task' THEN pe.id END, sb.job_id, sb.project_id)
    INTO _event_id
    FROM public.schedule_blocks sb
    LEFT JOIN public.events je ON je.id = sb.job_id
    LEFT JOIN public.events pe ON pe.id = sb.project_id
    WHERE sb.id = p_schedule_block_id;
  END IF;
  IF _event_id IS NULL THEN RAISE EXCEPTION 'event_not_found'; END IF;
  SELECT * INTO _event FROM public.events WHERE id = _event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found'; END IF;

  IF NOT p_remove_all AND p_technician_id IS NULL AND p_schedule_block_id IS NOT NULL THEN
    SELECT technician_id INTO p_technician_id FROM public.schedule_blocks WHERE id = p_schedule_block_id;
  END IF;
  IF NOT p_remove_all AND p_technician_id IS NULL THEN RAISE EXCEPTION 'technician_required'; END IF;

  CREATE TEMP TABLE IF NOT EXISTS _remove_targets (
    technician_id uuid PRIMARY KEY, event_technician_id uuid, technician_user_id uuid,
    technician_name text, mailbox text, calendar_event_id text, start_at timestamptz, end_at timestamptz
  ) ON COMMIT DROP;
  TRUNCATE _remove_targets;

  INSERT INTO _remove_targets
  SELECT t.id, et.id, t.user_id, t.name, t.email, et.calendar_event_id,
         COALESCE(et.start_at, _event.start_time), COALESCE(et.end_at, _event.end_time)
  FROM public.event_technicians et JOIN public.technicians t ON t.id = et.technician_id
  WHERE et.event_id = _event_id AND (p_remove_all OR et.technician_id = p_technician_id)
  ON CONFLICT (technician_id) DO NOTHING;

  INSERT INTO _remove_targets (technician_id, technician_user_id, technician_name, mailbox, calendar_event_id, start_at, end_at)
  SELECT t.id, t.user_id, t.name, t.email, COALESCE(sb.outlook_event_id, jcl.calendar_event_id), sb.start_at, sb.end_at
  FROM public.schedule_blocks sb JOIN public.technicians t ON t.id = sb.technician_id
  LEFT JOIN public.job_calendar_links jcl ON jcl.job_id = _event_id AND jcl.technician_id = sb.technician_id AND jcl.provider = 'microsoft'
  WHERE (sb.job_id = _event_id OR sb.project_id = _event_id) AND (p_remove_all OR sb.technician_id = p_technician_id)
  ON CONFLICT (technician_id) DO UPDATE SET
    technician_user_id = COALESCE(_remove_targets.technician_user_id, EXCLUDED.technician_user_id), technician_name = COALESCE(_remove_targets.technician_name, EXCLUDED.technician_name),
    mailbox = COALESCE(_remove_targets.mailbox, EXCLUDED.mailbox), calendar_event_id = COALESCE(_remove_targets.calendar_event_id, EXCLUDED.calendar_event_id),
    start_at = COALESCE(_remove_targets.start_at, EXCLUDED.start_at), end_at = COALESCE(_remove_targets.end_at, EXCLUDED.end_at);

  IF NOT p_remove_all AND NOT EXISTS (SELECT 1 FROM _remove_targets) THEN
    INSERT INTO _remove_targets (technician_id, technician_user_id, technician_name, mailbox, start_at, end_at)
    SELECT id, user_id, name, email, _event.start_time, _event.end_time FROM public.technicians WHERE id = p_technician_id
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT count(*) INTO _targets FROM _remove_targets;
  _already_removed := NOT EXISTS (SELECT 1 FROM public.event_technicians et JOIN _remove_targets rt ON rt.technician_id=et.technician_id WHERE et.event_id=_event_id)
    AND NOT EXISTS (SELECT 1 FROM public.schedule_blocks sb JOIN _remove_targets rt ON rt.technician_id=sb.technician_id WHERE (sb.job_id=_event_id OR sb.project_id=_event_id) AND sb.deleted_at IS NULL);

  FOR _target IN SELECT * FROM _remove_targets LOOP
    SELECT COALESCE(jsonb_agg(DISTINCT x.event_id) FILTER (WHERE x.event_id IS NOT NULL), '[]'::jsonb) INTO _candidate_ids
    FROM (
      SELECT _target.calendar_event_id event_id
      UNION ALL SELECT outlook_event_id FROM public.schedule_blocks WHERE (job_id=_event_id OR project_id=_event_id) AND technician_id=_target.technician_id
      UNION ALL SELECT calendar_event_id FROM public.job_calendar_links WHERE job_id=_event_id AND technician_id=_target.technician_id AND provider='microsoft'
      UNION ALL SELECT outlook_event_id FROM public.job_approvals WHERE job_id=_event_id AND technician_user_id=_target.technician_user_id
    ) x;
    INSERT INTO public.calendar_delete_retry_queue (event_id,technician_id,event_technician_id,technician_user_id,technician_name,mailbox,candidate_event_ids,start_at,end_at,status,next_attempt_at,resolved_at,last_error)
    VALUES (_event_id,_target.technician_id,_target.event_technician_id,_target.technician_user_id,_target.technician_name,_target.mailbox,_candidate_ids,_target.start_at,_target.end_at,'pending',now(),NULL,NULL)
    ON CONFLICT (event_id,technician_id) DO UPDATE SET
      event_technician_id=COALESCE(EXCLUDED.event_technician_id,calendar_delete_retry_queue.event_technician_id), technician_user_id=COALESCE(EXCLUDED.technician_user_id,calendar_delete_retry_queue.technician_user_id),
      technician_name=COALESCE(EXCLUDED.technician_name,calendar_delete_retry_queue.technician_name), mailbox=COALESCE(EXCLUDED.mailbox,calendar_delete_retry_queue.mailbox),
      candidate_event_ids=CASE WHEN jsonb_array_length(EXCLUDED.candidate_event_ids)>0 THEN EXCLUDED.candidate_event_ids ELSE calendar_delete_retry_queue.candidate_event_ids END,
      start_at=COALESCE(EXCLUDED.start_at,calendar_delete_retry_queue.start_at), end_at=COALESCE(EXCLUDED.end_at,calendar_delete_retry_queue.end_at),
      status=CASE WHEN calendar_delete_retry_queue.status='resolved' THEN 'resolved' ELSE 'pending' END, next_attempt_at=now(),
      last_error=CASE WHEN calendar_delete_retry_queue.status='resolved' THEN calendar_delete_retry_queue.last_error ELSE NULL END;
  END LOOP;

  UPDATE public.schedule_blocks sb SET deleted_at=COALESCE(sb.deleted_at,now()), deleted_reason=COALESCE(sb.deleted_reason,CASE WHEN p_remove_all THEN 'work_visit_removed' ELSE 'technician_unplanned' END), updated_at=now()
  FROM _remove_targets rt WHERE (sb.job_id=_event_id OR sb.project_id=_event_id) AND sb.technician_id=rt.technician_id AND sb.deleted_at IS NULL;
  GET DIAGNOSTICS _blocks=ROW_COUNT;

  DELETE FROM public.job_approvals ja USING _remove_targets rt WHERE ja.job_id=_event_id AND rt.technician_user_id IS NOT NULL AND ja.technician_user_id=rt.technician_user_id;
  GET DIAGNOSTICS _approvals=ROW_COUNT;
  UPDATE public.job_calendar_links jcl SET sync_status='unlinked', updated_at=now() FROM _remove_targets rt WHERE jcl.job_id=_event_id AND jcl.technician_id=rt.technician_id AND jcl.provider='microsoft';
  GET DIAGNOSTICS _links=ROW_COUNT;
  DELETE FROM public.event_technicians et USING _remove_targets rt WHERE et.event_id=_event_id AND et.technician_id=rt.technician_id;
  GET DIAGNOSTICS _assignments=ROW_COUNT;
  SELECT count(*) INTO _remaining FROM public.event_technicians WHERE event_id=_event_id;

  IF _remaining=0 AND (_event.project_type='task' OR p_remove_all) THEN
    UPDATE public.schedule_blocks SET deleted_at=COALESCE(deleted_at,now()),deleted_reason=COALESCE(deleted_reason,'work_visit_cancelled'),updated_at=now()
    WHERE (job_id=_event_id OR project_id=_event_id) AND deleted_at IS NULL;
    GET DIAGNOSTICS _step=ROW_COUNT; _blocks:=_blocks+_step;
    UPDATE public.events SET status='cancelled',deleted_at=COALESCE(deleted_at,now()),deleted_by=COALESCE(deleted_by,p_actor),cancelled_at=COALESCE(cancelled_at,now()),cancelled_by=COALESCE(cancelled_by,p_actor),outlook_sync_status='delete_pending',updated_at=now(),updated_by=COALESCE(p_actor,updated_by) WHERE id=_event_id;
    _event_cancelled:=true;
  ELSIF _remaining=0 THEN
    UPDATE public.events SET status='requested',outlook_sync_status='delete_pending',updated_at=now(),updated_by=COALESCE(p_actor,updated_by) WHERE id=_event_id;
  ELSE
    UPDATE public.events SET outlook_sync_status='delete_pending',updated_at=now(),updated_by=COALESCE(p_actor,updated_by) WHERE id=_event_id;
  END IF;

  INSERT INTO public.event_logs(event_id,action_type,performed_by,change_summary) VALUES (_event_id,CASE WHEN _event_cancelled THEN 'work_visit_unplanned' ELSE 'technician_unplanned' END,p_actor,CASE WHEN _event_cancelled THEN 'Arbeidsbesøk avplanlagt; siste eller alle montører fjernet' ELSE format('%s montør(er) fjernet fra arbeidsbesøket',_assignments) END);
  INSERT INTO public.activity_log(entity_type,entity_id,action,type,description,performed_by,metadata) VALUES ('event',_event_id,'work_visit_unplanned','system','Samlet avplanlegging utført; Outlook-sletting lagt i synkroniseringskø',p_actor,jsonb_build_object('remove_all',p_remove_all,'technician_id',p_technician_id,'schedule_blocks',_blocks,'assignments',_assignments,'approvals',_approvals,'calendar_links',_links,'remaining_assignments',_remaining,'event_cancelled',_event_cancelled));

  RETURN jsonb_build_object('status',CASE WHEN _already_removed AND _blocks=0 AND _assignments=0 AND _approvals=0 THEN 'already_removed' ELSE 'success' END,'event_id',_event_id,'targets',_targets,'schedule_blocks_removed',_blocks,'assignments_removed',_assignments,'approvals_removed',_approvals,'calendar_links_unlinked',_links,'remaining_assignments',_remaining,'event_cancelled',_event_cancelled);
END; $$;
REVOKE ALL ON FUNCTION public.remove_work_visit_from_plan(uuid,uuid,boolean,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.remove_work_visit_from_plan(uuid,uuid,boolean,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.find_work_visit_conflicts(p_technician_ids uuid[],p_start timestamptz,p_end timestamptz,p_exclude_event_id uuid DEFAULT NULL)
RETURNS TABLE(technician_id uuid,technician_name text,event_id uuid,event_title text,conflict_start timestamptz,conflict_end timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT et.technician_id,t.name,e.id,e.title,COALESCE(et.start_at,e.start_time),COALESCE(et.end_at,e.end_time)
FROM public.event_technicians et JOIN public.events e ON e.id=et.event_id JOIN public.technicians t ON t.id=et.technician_id
WHERE et.technician_id=ANY(p_technician_ids) AND e.deleted_at IS NULL AND e.status<>'cancelled' AND (p_exclude_event_id IS NULL OR e.id<>p_exclude_event_id)
AND COALESCE(et.start_at,e.start_time)<p_end AND COALESCE(et.end_at,e.end_time)>p_start; $$;
REVOKE ALL ON FUNCTION public.find_work_visit_conflicts(uuid[],timestamptz,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.find_work_visit_conflicts(uuid[],timestamptz,timestamptz,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.scan_resource_plan_ghosts() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH findings AS (
 SELECT 'event_technician_inactive_event'::text category,et.id record_id,et.event_id,et.technician_id,jsonb_build_object('calendar_event_id',et.calendar_event_id) details FROM public.event_technicians et LEFT JOIN public.events e ON e.id=et.event_id WHERE e.id IS NULL OR e.deleted_at IS NOT NULL OR e.status='cancelled'
 UNION ALL SELECT 'active_schedule_block_inactive_event',sb.id,COALESCE(sb.job_id,sb.project_id),sb.technician_id,jsonb_build_object('outlook_event_id',sb.outlook_event_id) FROM public.schedule_blocks sb LEFT JOIN public.events je ON je.id=sb.job_id LEFT JOIN public.events pe ON pe.id=sb.project_id WHERE sb.deleted_at IS NULL AND ((sb.job_id IS NOT NULL AND (je.id IS NULL OR je.deleted_at IS NOT NULL OR je.status='cancelled')) OR (sb.job_id IS NULL AND sb.project_id IS NOT NULL AND (pe.id IS NULL OR pe.deleted_at IS NOT NULL OR pe.status='cancelled')))
 UNION ALL SELECT 'approval_inactive_event',ja.id,ja.job_id,t.id,jsonb_build_object('approval_status',ja.status,'technician_user_id',ja.technician_user_id) FROM public.job_approvals ja LEFT JOIN public.events e ON e.id=ja.job_id LEFT JOIN public.technicians t ON t.user_id=ja.technician_user_id WHERE e.id IS NULL OR e.deleted_at IS NOT NULL OR e.status='cancelled'
 UNION ALL SELECT 'calendar_link_inactive_event',jcl.id,jcl.job_id,jcl.technician_id,jsonb_build_object('calendar_event_id',jcl.calendar_event_id,'sync_status',jcl.sync_status) FROM public.job_calendar_links jcl LEFT JOIN public.events e ON e.id=jcl.job_id WHERE jcl.sync_status='linked' AND (e.id IS NULL OR e.deleted_at IS NOT NULL OR e.status='cancelled')
 UNION ALL SELECT 'outlook_delete_retry',q.id,q.event_id,q.technician_id,jsonb_build_object('status',q.status,'attempts',q.attempts,'last_error',q.last_error) FROM public.calendar_delete_retry_queue q WHERE q.status IN ('pending','processing','failed')
), grouped AS (SELECT category,count(*) count FROM findings GROUP BY category)
SELECT jsonb_build_object('total',(SELECT count(*) FROM findings),'counts',COALESCE((SELECT jsonb_object_agg(category,count) FROM grouped),'{}'::jsonb),'findings',COALESCE((SELECT jsonb_agg(to_jsonb(findings)) FROM findings),'[]'::jsonb),'scanned_at',now()); $$;
REVOKE ALL ON FUNCTION public.scan_resource_plan_ghosts() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.scan_resource_plan_ghosts() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.repair_resource_plan_ghosts() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _blocks int:=0; _assignments int:=0; _approvals int:=0; _links int:=0;
BEGIN
 UPDATE public.schedule_blocks sb SET deleted_at=now(),deleted_reason='ghost_repair',updated_at=now() WHERE sb.deleted_at IS NULL AND EXISTS(SELECT 1 FROM public.events e WHERE e.id=COALESCE(sb.job_id,sb.project_id) AND (e.deleted_at IS NOT NULL OR e.status='cancelled')); GET DIAGNOSTICS _blocks=ROW_COUNT;
 DELETE FROM public.job_approvals ja WHERE NOT EXISTS(SELECT 1 FROM public.events e WHERE e.id=ja.job_id AND e.deleted_at IS NULL AND e.status<>'cancelled'); GET DIAGNOSTICS _approvals=ROW_COUNT;
 UPDATE public.job_calendar_links jcl SET sync_status='unlinked',updated_at=now(),last_error=COALESCE(last_error,'Ghost booking repair: Outlook delete required') WHERE jcl.sync_status='linked' AND NOT EXISTS(SELECT 1 FROM public.events e WHERE e.id=jcl.job_id AND e.deleted_at IS NULL AND e.status<>'cancelled'); GET DIAGNOSTICS _links=ROW_COUNT;
 DELETE FROM public.event_technicians et WHERE NOT EXISTS(SELECT 1 FROM public.events e WHERE e.id=et.event_id AND e.deleted_at IS NULL AND e.status<>'cancelled'); GET DIAGNOSTICS _assignments=ROW_COUNT;
 RETURN jsonb_build_object('schedule_blocks_repaired',_blocks,'assignments_repaired',_assignments,'approvals_repaired',_approvals,'calendar_links_repaired',_links,'repaired_at',now());
END; $$;
REVOKE ALL ON FUNCTION public.repair_resource_plan_ghosts() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.repair_resource_plan_ghosts() TO service_role;