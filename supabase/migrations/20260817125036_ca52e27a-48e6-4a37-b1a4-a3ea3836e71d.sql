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
  SELECT t.id, t.user_id, t.name, t.email,
         (array_agg(COALESCE(sb.outlook_event_id, jcl.calendar_event_id) ORDER BY sb.start_at) FILTER (WHERE COALESCE(sb.outlook_event_id, jcl.calendar_event_id) IS NOT NULL))[1],
         min(sb.start_at), max(sb.end_at)
  FROM public.schedule_blocks sb
  JOIN public.technicians t ON t.id = sb.technician_id
  LEFT JOIN public.job_calendar_links jcl ON jcl.job_id = _event_id AND jcl.technician_id = sb.technician_id AND jcl.provider = 'microsoft'
  WHERE (sb.job_id = _event_id OR sb.project_id = _event_id)
    AND (p_remove_all OR sb.technician_id = p_technician_id)
  GROUP BY t.id, t.user_id, t.name, t.email
  ON CONFLICT (technician_id) DO UPDATE SET
    technician_user_id = COALESCE(_remove_targets.technician_user_id, EXCLUDED.technician_user_id), technician_name = COALESCE(_remove_targets.technician_name, EXCLUDED.technician_name),
    mailbox = COALESCE(_remove_targets.mailbox, EXCLUDED.mailbox), calendar_event_id = COALESCE(_remove_targets.calendar_event_id, EXCLUDED.calendar_event_id),
    start_at = LEAST(_remove_targets.start_at, EXCLUDED.start_at), end_at = GREATEST(_remove_targets.end_at, EXCLUDED.end_at);

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