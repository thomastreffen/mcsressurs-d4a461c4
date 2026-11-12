-- One approval-response notification source. No historical row changes or dispatch.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS approval_transition_key text;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_approval_transition_unique
ON public.notifications(user_id, approval_transition_key)
WHERE approval_transition_key IS NOT NULL;

-- Reject retired producers even while the previously deployed edge is draining.
CREATE OR REPLACE FUNCTION public.guard_approval_response_notification()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.approval_transition_key IS NOT NULL THEN
    IF TG_OP='UPDATE' AND NEW.approval_transition_key IS DISTINCT FROM OLD.approval_transition_key THEN
      RAISE EXCEPTION 'Approval transition key is immutable';
    END IF;
    IF TG_OP='INSERT' AND pg_trigger_depth()<2 THEN
      RAISE EXCEPTION 'Approval notifications are trigger-owned';
    END IF;
  ELSIF TG_OP='INSERT' AND NEW.event_id IS NOT NULL AND (
    NEW.type IN ('approved','all_approved')
    OR (NEW.type='approval_pending' AND NEW.message LIKE '% godkjente %')
    OR (NEW.type='rejected' AND NEW.message LIKE '% avslo %')
    OR (NEW.type='time_change_proposed' AND NEW.message LIKE '% foreslo nytt tidspunkt%')
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_approval_response_notification
BEFORE INSERT OR UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.guard_approval_response_notification();

-- Serialize different technicians' responses before taking the aggregate snapshot.
CREATE OR REPLACE FUNCTION public.lock_job_approval_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.job_id::text, 438));
  RETURN NEW;
END $$;
CREATE TRIGGER lock_job_approval_transition
BEFORE INSERT OR UPDATE ON public.job_approvals
FOR EACH ROW EXECUTE FUNCTION public.lock_job_approval_transition();

CREATE OR REPLACE FUNCTION public.notify_job_approval_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  ev public.events%ROWTYPE;
  total integer;
  accepted integer;
  scope_key text;
  transition_key text;
  kind text;
  tech_name text;
  ref text;
  body text;
  complete boolean;
BEGIN
  IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved','rejected','declined','reschedule_requested','change_request') THEN RETURN NEW; END IF;
  SELECT * INTO ev FROM public.events WHERE id=NEW.job_id AND deleted_at IS NULL;
  IF NOT FOUND OR ev.company_id IS NULL THEN RETURN NEW; END IF;
  -- Count the live assignment set, not stale approvals for removed technicians.
  -- A missing approval still counts as pending; optional info-only rows do not block.
  SELECT count(*), count(*) FILTER (WHERE a.status='approved' OR a.response_required=false),
    md5(string_agg(t.user_id::text||':'||coalesce(a.token::text,'missing'),',' ORDER BY t.user_id))
  INTO total,accepted,scope_key
  FROM public.event_technicians et JOIN public.technicians t ON t.id=et.technician_id
  LEFT JOIN LATERAL (
    SELECT ja.status,ja.token,ja.response_required FROM public.job_approvals ja
    WHERE ja.job_id=ev.id AND ja.technician_user_id=t.user_id
    ORDER BY ja.created_at DESC,ja.id DESC LIMIT 1
  ) a ON true
  WHERE et.event_id=ev.id AND t.user_id IS NOT NULL;
  IF NOT EXISTS(SELECT 1 FROM public.event_technicians et JOIN public.technicians t ON t.id=et.technician_id
    WHERE et.event_id=ev.id AND t.user_id=NEW.technician_user_id) THEN RETURN NEW; END IF;
  complete := NEW.status='approved' AND total>0 AND total=accepted;
  kind := CASE WHEN complete THEN 'all_approved' WHEN NEW.status='approved' THEN 'approved'
    WHEN NEW.status IN ('rejected','declined') THEN 'rejected' ELSE 'time_change_proposed' END;
  transition_key := 'approval:'||ev.id||':'||CASE WHEN complete THEN 'complete:'||scope_key
    ELSE md5(NEW.token::text)||':'||NEW.status END;
  SELECT name INTO tech_name FROM public.technicians WHERE user_id=NEW.technician_user_id LIMIT 1;
  tech_name := coalesce(tech_name,'Montør');
  ref := coalesce(ev.project_number,ev.job_number,ev.internal_number,ev.title,'Jobb');
  body := CASE WHEN complete THEN ref||' er godkjent'
    WHEN NEW.status='approved' THEN ref||': '||accepted||' av '||total||' montører har godkjent'
    WHEN NEW.status IN ('rejected','declined') THEN tech_name||' avslo '||ref
    ELSE tech_name||' foreslo nytt tidspunkt for '||ref END;
  -- Explicit relevance AND existing access. Global admin is never a recipient source.
  INSERT INTO public.notifications(user_id,event_id,type,title,message,link_url,priority,
    entity_type,entity_id,company_id,actor_user_id,actor_name,approval_transition_key)
  SELECT DISTINCT r.uid,ev.id,kind,ref,body,'/projects/'||ev.id,
    CASE WHEN kind IN ('rejected','time_change_proposed') THEN 'important' ELSE 'info' END,
    'event',ev.id,ev.company_id,NEW.technician_user_id,tech_name,transition_key
  FROM (
    SELECT ev.created_by AS uid
    UNION
    SELECT ua.auth_user_id FROM public.project_members pm
    JOIN public.user_accounts ua ON ua.id=pm.user_account_id AND ua.is_active
    JOIN public.events pe ON pe.id=pm.project_id AND pe.company_id=ev.company_id AND pe.deleted_at IS NULL
    WHERE pm.project_id IN (ev.id,ev.parent_project_id) AND pm.member_type='internal'
      AND (pm.role IN ('owner','manager') OR (complete AND pm.role='member'))
    UNION
    SELECT jp.user_id FROM public.job_participants jp WHERE jp.job_id=ev.id AND complete
  ) r
  WHERE r.uid IS NOT NULL AND r.uid IS DISTINCT FROM NEW.technician_user_id
    AND EXISTS(SELECT 1 FROM public.user_accounts ua WHERE ua.auth_user_id=r.uid AND ua.is_active)
    AND public.has_company_access(r.uid,ev.company_id,'resource_plan','view')
    AND (public.user_has_company_access(r.uid,ev.company_id) OR EXISTS(
      SELECT 1 FROM public.event_technicians et JOIN public.technicians t ON t.id=et.technician_id
      WHERE et.event_id=ev.id AND t.user_id=r.uid))
  ON CONFLICT (user_id,approval_transition_key) WHERE approval_transition_key IS NOT NULL DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_job_approval_change ON public.job_approvals;
CREATE TRIGGER trg_notify_job_approval_change AFTER INSERT OR UPDATE ON public.job_approvals
FOR EACH ROW EXECUTE FUNCTION public.notify_job_approval_change();
REVOKE ALL ON FUNCTION public.notify_job_approval_change() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.lock_job_approval_transition() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.guard_approval_response_notification() FROM PUBLIC,anon,authenticated;