CREATE OR REPLACE FUNCTION public.enforce_task_parent_integrity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE p record;
BEGIN
  IF NEW.project_type = 'task' THEN
    IF NEW.parent_project_id IS NULL THEN
      IF NEW.entity_type NOT IN ('internal','job','service','unclassified') THEN
        RAISE EXCEPTION 'INVALID_TASK_ENTITY: standalone task cannot be an economic project' USING ERRCODE='23514';
      END IF;
    ELSE
      SELECT id,project_type,company_id,deleted_at INTO p FROM public.events WHERE id=NEW.parent_project_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_TASK_PARENT: parent unavailable' USING ERRCODE='23514'; END IF;
      IF p.deleted_at IS NOT NULL OR p.company_id IS DISTINCT FROM NEW.company_id THEN
        RAISE EXCEPTION 'INVALID_TASK_PARENT: parent must be active and in the same company' USING ERRCODE='23514';
      END IF;
      IF p.project_type='task' OR p.id=NEW.id THEN
        RAISE EXCEPTION 'INVALID_TASK_CHAIN: tasks must point to a root project' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER trg_enforce_task_parent_integrity
BEFORE INSERT OR UPDATE OF project_type,parent_project_id,company_id,entity_type ON public.events
FOR EACH ROW EXECUTE FUNCTION public.enforce_task_parent_integrity();
CREATE OR REPLACE FUNCTION public.enforce_schedule_block_project_match()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE e record;
BEGIN
  IF NEW.job_id IS NULL THEN RETURN NEW; END IF;
  SELECT id,project_type,parent_project_id,company_id INTO e FROM public.events WHERE id=NEW.job_id;
  IF e.project_type='task' THEN
    IF NEW.project_id IS DISTINCT FROM COALESCE(e.parent_project_id,e.id) OR NEW.company_id IS DISTINCT FROM e.company_id THEN
      RAISE EXCEPTION 'INVALID_BLOCK_PROJECT: task block must use its own standalone id or its same-company parent' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER trg_enforce_schedule_block_project_match
BEFORE INSERT OR UPDATE OF job_id,project_id,company_id ON public.schedule_blocks
FOR EACH ROW EXECUTE FUNCTION public.enforce_schedule_block_project_match();
CREATE OR REPLACE FUNCTION public.create_standalone_resource_task(
  p_company_id uuid,p_client_request_id uuid,p_title text,p_dates jsonb,
  p_technician_ids uuid[],p_description text DEFAULT NULL,p_customer text DEFAULT NULL,
  p_address text DEFAULT NULL,p_notify boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); eid uuid; existing public.events%ROWTYPE; d jsonb; tid uuid; first_start timestamptz; first_end timestamptz;
BEGIN
  IF uid IS NULL OR NOT public.has_company_access(uid,p_company_id,'resource_plan','edit') THEN
    RAISE EXCEPTION 'Ingen tilgang til å opprette oppgave i selskapet' USING ERRCODE='42501';
  END IF;
  IF p_client_request_id IS NULL OR NULLIF(btrim(p_title),'') IS NULL OR jsonb_typeof(p_dates) IS DISTINCT FROM 'array' OR jsonb_array_length(p_dates)=0 THEN
    RAISE EXCEPTION 'Oppgaven trenger tittel, dato og en opprettingsnøkkel' USING ERRCODE='22023';
  END IF;
  FOR d IN SELECT value FROM jsonb_array_elements(p_dates) LOOP
    IF (d->>'start') IS NULL OR (d->>'end') IS NULL OR (d->>'end')::timestamptz <= (d->>'start')::timestamptz THEN
      RAISE EXCEPTION 'Sluttid må være etter starttid' USING ERRCODE='22023';
    END IF;
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_client_request_id::text,0));
  SELECT * INTO existing FROM public.events WHERE client_request_id=p_client_request_id;
  IF FOUND THEN
    IF existing.company_id IS DISTINCT FROM p_company_id OR existing.created_by IS DISTINCT FROM uid OR existing.project_type <> 'task' OR existing.parent_project_id IS NOT NULL OR existing.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Opprettingsnøkkelen kan ikke gjenbrukes her' USING ERRCODE='23514';
    END IF;
    RETURN jsonb_build_object('event_id',existing.id,'status','existing');
  END IF;
  first_start:=(p_dates->0->>'start')::timestamptz; first_end:=(p_dates->0->>'end')::timestamptz;
  INSERT INTO public.events(title,description,customer,address,start_time,end_time,technician_id,status,created_by,client_request_id,project_type,entity_type,parent_project_id,company_id)
  VALUES(btrim(p_title),p_description,p_customer,p_address,first_start,first_end,COALESCE(p_technician_ids[1],uid),'scheduled',uid,p_client_request_id,'task','internal',NULL,p_company_id) RETURNING id INTO eid;
  FOREACH tid IN ARRAY COALESCE(p_technician_ids,ARRAY[]::uuid[]) LOOP
    INSERT INTO public.event_technicians(event_id,technician_id,start_at,end_at) VALUES(eid,tid,first_start,first_end) ON CONFLICT(event_id,technician_id) DO NOTHING;
    FOR d IN SELECT DISTINCT value FROM jsonb_array_elements(p_dates) LOOP
      IF NOT EXISTS(SELECT 1 FROM public.schedule_blocks WHERE project_id=eid AND technician_id=tid AND start_at=(d->>'start')::timestamptz AND end_at=(d->>'end')::timestamptz AND deleted_at IS NULL) THEN
        INSERT INTO public.schedule_blocks(company_id,technician_id,project_id,job_id,source,start_at,end_at,title,match_state,match_confidence,match_reason)
        VALUES(p_company_id,tid,eid,eid,'manual',(d->>'start')::timestamptz,(d->>'end')::timestamptz,btrim(p_title),'manual',100,'Frittstående oppgave via planlegger');
      END IF;
    END LOOP;
  END LOOP;
  INSERT INTO public.event_logs(event_id,action_type,performed_by,change_summary,metadata)
  VALUES(eid,'created',uid,'Opprettet frittstående oppgave',jsonb_build_object('technician_ids',p_technician_ids));
  INSERT INTO public.event_logs(event_id,action_type,performed_by,change_summary,metadata)
  VALUES(eid,CASE WHEN p_notify THEN 'notifications_requested' ELSE 'notifications_skipped' END,uid,
    CASE WHEN p_notify THEN 'Informasjonsvarsling valgt – se kvittering per montør' ELSE 'Lagret uten varsling – ingen e-post bestilt' END,
    jsonb_build_object('notification_choice',CASE WHEN p_notify THEN 'send' ELSE 'without_notification' END,'technician_ids',p_technician_ids));
  RETURN jsonb_build_object('event_id',eid,'status','created');
END $$;
REVOKE ALL ON FUNCTION public.create_standalone_resource_task(uuid,uuid,text,jsonb,uuid[],text,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_standalone_resource_task(uuid,uuid,text,jsonb,uuid[],text,text,text,boolean) TO authenticated,service_role;