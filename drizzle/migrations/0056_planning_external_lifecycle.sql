ALTER TABLE public.planning_projects ADD COLUMN IF NOT EXISTS completed_at timestamptz;
UPDATE public.planning_projects SET completed_at = updated_at WHERE status = 'completed' AND completed_at IS NULL;

ALTER TABLE public.planning_external_participants DROP CONSTRAINT IF EXISTS planning_external_participants_status_check;
ALTER TABLE public.planning_external_participants ADD CONSTRAINT planning_external_participants_status_check CHECK (status = ANY (ARRAY['pending','sent','active','revoked','send_failed','paused']));

-- Single lifecycle rule: write / read / none
CREATE OR REPLACE FUNCTION public.planning_external_mode_for(_status text, _deleted_at timestamptz, _completed_at timestamptz)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _deleted_at IS NOT NULL OR _status IS NULL OR _status = 'cancelled' THEN 'none'
    WHEN _status = 'completed' THEN CASE WHEN coalesce(_completed_at, now()) > now() - interval '30 days' THEN 'read' ELSE 'none' END
    ELSE 'write' END
$$;

CREATE OR REPLACE FUNCTION public.planning_project_external_mode(_project_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT public.planning_external_mode_for(p.status, p.deleted_at, p.completed_at) FROM public.planning_projects p WHERE p.id = _project_id), 'none')
$$;

-- Identity: no session survives a closed project
CREATE OR REPLACE FUNCTION public.planning_external_identity(_token text)
RETURNS public.planning_external_participants LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT e FROM public.planning_external_sessions s JOIN public.planning_external_participants e ON e.id=s.participant_id JOIN public.planning_projects p ON p.id=e.planning_project_id LEFT JOIN public.planning_external_portal_sessions ps ON ps.id=s.portal_session_id WHERE s.token_hash=encode(extensions.digest(_token,'sha256'),'hex') AND length(_token)>=40 AND s.expires_at>now() AND e.status='active' AND e.deleted_at IS NULL AND p.deleted_at IS NULL AND public.planning_external_mode_for(p.status,p.deleted_at,p.completed_at)<>'none' AND (s.portal_session_id IS NULL OR (ps.expires_at>now() AND ps.person_id=e.external_person_id)) LIMIT 1
$$;

-- Project view: neutral error, exposes mode and read-only end date
CREATE OR REPLACE FUNCTION public.planning_external_project(_token text, _project_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
 DECLARE e public.planning_external_participants; result jsonb; BEGIN
 e:=public.planning_external_identity(_token);
 IF e.id IS NULL OR e.planning_project_id<>_project_id THEN RAISE EXCEPTION 'Prosjektet eksisterer ikke lenger, eller tilgangen er avsluttet.' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('project',jsonb_build_object('id',p.id,'name',p.name,'status',p.status,'expected_start',p.expected_start,'expected_end',p.expected_end),
 'access_mode',public.planning_external_mode_for(p.status,p.deleted_at,p.completed_at),
 'read_only_until',CASE WHEN p.status='completed' THEN coalesce(p.completed_at,now())+interval '30 days' END,
 'participant',jsonb_build_object('id',e.id,'name',e.name,'participant_type',e.participant_type),'channels',jsonb_build_array(e.participant_type,'all'),
 'work_packages',coalesce((SELECT jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'description',w.description,'status',w.status,'planned_start',w.planned_start,'planned_end',w.planned_end)) FROM public.planning_work_packages w WHERE w.planning_project_id=p.id AND public.planning_channel_matches(e.participant_type,w.shared_visibility)),'[]'::jsonb),
 'tasks',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'description',t.description,'status',t.status,'due_date',t.due_date,'assigned_to_me',t.external_assignee_id=e.id)) FROM public.planning_tasks t WHERE t.planning_project_id=p.id AND (public.planning_channel_matches(e.participant_type,t.shared_visibility) OR t.external_assignee_id=e.id)),'[]'::jsonb),
 'files',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'display_name',f.display_name,'shared_visibility',f.shared_visibility,'category',f.category)) FROM public.planning_files f WHERE f.planning_project_id=p.id AND f.storage_bucket='planning-files' AND split_part(f.storage_path,'/',1)=p.id::text AND public.planning_channel_matches(e.participant_type,f.shared_visibility)),'[]'::jsonb)) INTO result FROM public.planning_projects p WHERE p.id=_project_id AND p.deleted_at IS NULL;
 RETURN result; END $$;

-- Task completion requires write mode
CREATE OR REPLACE FUNCTION public.planning_external_complete_task(_token text, _task_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
 DECLARE e public.planning_external_participants; BEGIN e:=public.planning_external_identity(_token); IF e.id IS NULL THEN RAISE EXCEPTION 'Ingen tilgang' USING ERRCODE='42501'; END IF;
 IF public.planning_project_external_mode(e.planning_project_id)<>'write' THEN RAISE EXCEPTION 'Prosjektet er avsluttet og kan bare leses' USING ERRCODE='42501'; END IF;
 UPDATE public.planning_tasks SET status='done',completed_at=now() WHERE id=_task_id AND planning_project_id=e.planning_project_id AND external_assignee_id=e.id AND public.planning_channel_matches(e.participant_type,shared_visibility) AND status<>'done'; IF NOT FOUND THEN RAISE EXCEPTION 'Oppgaven er ikke tildelt deg eller er allerede fullført' USING ERRCODE='42501'; END IF; END $$;

-- Database-level veto on external messages unless project is writable
CREATE OR REPLACE FUNCTION public.planning_messages_external_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.external_author_id IS NOT NULL AND public.planning_project_external_mode(NEW.planning_project_id)<>'write' THEN
    RAISE EXCEPTION 'Prosjektet er avsluttet og kan bare leses' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS planning_messages_external_write_guard ON public.planning_messages;
CREATE TRIGGER planning_messages_external_write_guard BEFORE INSERT OR UPDATE ON public.planning_messages FOR EACH ROW EXECUTE FUNCTION public.planning_messages_external_write_guard();

-- Portal: list all granted projects with mode; closed ones are shown but not openable
CREATE OR REPLACE FUNCTION public.planning_external_my_projects(_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
 DECLARE person uuid; result jsonb; BEGIN person:=public.planning_external_portal_person(_token); IF person IS NULL THEN RAISE EXCEPTION 'Logg inn på nytt' USING ERRCODE='42501'; END IF;
SELECT jsonb_build_object('person',jsonb_build_object('email',x.email,'name',coalesce((SELECT ep.name FROM public.planning_external_participants ep WHERE ep.external_person_id=x.id AND ep.status='active' AND ep.deleted_at IS NULL ORDER BY ep.accepted_at DESC LIMIT 1),'')), 'projects',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'status',p.status,'access_mode',public.planning_external_mode_for(p.status,p.deleted_at,p.completed_at),'participant_type',e.participant_type,'company_name',e.company_name,'project_number',(SELECT nullif(btrim(src.project_number),'') FROM public.events src WHERE src.id=p.financial_project_id AND src.company_id=p.company_id AND src.entity_type='financial_project' AND src.deleted_at IS NULL AND public.has_active_tripletex_project_link(src.id,src.company_id))) ORDER BY p.name) FROM public.planning_external_participants e JOIN public.planning_projects p ON p.id=e.planning_project_id WHERE e.external_person_id=x.id AND e.status='active' AND e.deleted_at IS NULL AND p.deleted_at IS NULL),'[]'::jsonb)) INTO result FROM public.planning_external_people x WHERE x.id=person; RETURN result; END $$;

CREATE OR REPLACE FUNCTION public.planning_external_open_project(_token text, _project_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
 DECLARE person uuid; e public.planning_external_participants; s public.planning_external_portal_sessions; t text; BEGIN
person:=public.planning_external_portal_person(_token); IF person IS NULL OR _project_id IS NULL THEN RAISE EXCEPTION 'Prosjektet eksisterer ikke lenger, eller tilgangen er avsluttet.' USING ERRCODE='42501'; END IF;
SELECT ep.* INTO e FROM public.planning_external_participants ep JOIN public.planning_projects p ON p.id=ep.planning_project_id WHERE ep.external_person_id=person AND ep.planning_project_id=_project_id AND ep.status='active' AND ep.deleted_at IS NULL AND public.planning_external_mode_for(p.status,p.deleted_at,p.completed_at)<>'none';
IF e.id IS NULL THEN RAISE EXCEPTION 'Prosjektet eksisterer ikke lenger, eller tilgangen er avsluttet.' USING ERRCODE='42501'; END IF;
SELECT * INTO s FROM public.planning_external_portal_sessions WHERE token_hash=encode(extensions.digest(_token,'sha256'),'hex') AND expires_at>now();
t:=encode(extensions.gen_random_bytes(32),'hex'); INSERT INTO public.planning_external_sessions(participant_id,token_hash,expires_at,portal_session_id) VALUES(e.id,encode(extensions.digest(t,'sha256'),'hex'),least(s.expires_at,now()+interval '1 hour'),s.id);
RETURN jsonb_build_object('session_token',t); END $$;

CREATE OR REPLACE FUNCTION public.planning_external_prepare_login(_participant_id uuid DEFAULT NULL::uuid, _email text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
 DECLARE e public.planning_external_participants; t text; BEGIN
IF _participant_id IS NOT NULL THEN SELECT ep.* INTO e FROM public.planning_external_participants ep JOIN public.planning_projects p ON p.id=ep.planning_project_id WHERE ep.id=_participant_id AND ep.deleted_at IS NULL AND public.planning_external_mode_for(p.status,p.deleted_at,p.completed_at)<>'none' AND ep.status IN ('active','pending','sent','send_failed');
ELSE SELECT ep.* INTO e FROM public.planning_external_participants ep JOIN public.planning_projects p ON p.id=ep.planning_project_id WHERE ep.email=lower(btrim(_email)) AND ep.deleted_at IS NULL AND public.planning_external_mode_for(p.status,p.deleted_at,p.completed_at)<>'none' AND ep.status='active' ORDER BY ep.accepted_at DESC LIMIT 1; END IF;
IF e.id IS NULL THEN RETURN NULL; END IF;
PERFORM pg_advisory_xact_lock(hashtextextended(e.external_person_id::text,42));
IF EXISTS(SELECT 1 FROM public.planning_external_login_links l JOIN public.planning_external_participants ep ON ep.id=l.participant_id WHERE ep.external_person_id=e.external_person_id AND l.created_at>now()-interval '2 minutes') THEN RETURN NULL; END IF;
IF (SELECT count(*) FROM public.planning_external_login_links l JOIN public.planning_external_participants ep ON ep.id=l.participant_id WHERE ep.external_person_id=e.external_person_id AND l.created_at>now()-interval '1 hour')>=5 THEN RETURN NULL; END IF;
t:=encode(extensions.gen_random_bytes(32),'hex'); INSERT INTO public.planning_external_login_links(participant_id,token_hash) VALUES(e.id,encode(extensions.digest(t,'sha256'),'hex'));
RETURN jsonb_build_object('link_id',(SELECT id FROM public.planning_external_login_links WHERE token_hash=encode(extensions.digest(t,'sha256'),'hex')),'id',e.id,'token',t,'name',e.name,'email',e.email,'participant_type',e.participant_type,'project_name',(SELECT name FROM public.planning_projects WHERE id=e.planning_project_id),'project_id',e.planning_project_id); END $$;

CREATE OR REPLACE FUNCTION public.planning_external_accept_login(_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
 DECLARE l public.planning_external_login_links; e public.planning_external_participants; t text; BEGIN
SELECT * INTO l FROM public.planning_external_login_links WHERE token_hash=encode(extensions.digest(_token,'sha256'),'hex') AND length(_token)>=40 AND used_at IS NULL AND expires_at>now() FOR UPDATE;
SELECT ep.* INTO e FROM public.planning_external_participants ep JOIN public.planning_projects p ON p.id=ep.planning_project_id WHERE ep.id=l.participant_id AND ep.status IN ('active','pending','sent','send_failed') AND ep.deleted_at IS NULL AND public.planning_external_mode_for(p.status,p.deleted_at,p.completed_at)<>'none' FOR UPDATE OF ep;
IF l.id IS NULL OR e.id IS NULL THEN RAISE EXCEPTION 'Lenken er utløpt eller brukt, eller tilgangen er avsluttet. Be om en ny tilgangslenke.' USING ERRCODE='42501'; END IF;
UPDATE public.planning_external_login_links SET used_at=now() WHERE id=l.id;
UPDATE public.planning_external_participants SET status='active',accepted_at=coalesce(accepted_at,now()),invite_hash=NULL WHERE id=e.id;
t:=public.planning_external_portal_mint(e.external_person_id);
RETURN jsonb_build_object('portal_token',t,'project_id',e.planning_project_id); END $$;

-- Paused participants lose credentials too
CREATE OR REPLACE FUNCTION public.planning_external_invalidate_credentials()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN IF NEW.status IN ('revoked','paused') OR NEW.deleted_at IS NOT NULL THEN UPDATE public.planning_external_login_links SET used_at=coalesce(used_at,now()) WHERE participant_id=NEW.id; UPDATE public.planning_external_sessions SET expires_at=least(expires_at,now()) WHERE participant_id=NEW.id; END IF; RETURN NEW; END $$;

-- completed_at bookkeeping
CREATE OR REPLACE FUNCTION public.planning_projects_completed_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status='completed' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN NEW.completed_at := now();
  ELSIF NEW.status<>'completed' THEN NEW.completed_at := NULL; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_planning_projects_completed_at ON public.planning_projects;
CREATE TRIGGER trg_planning_projects_completed_at BEFORE INSERT OR UPDATE OF status ON public.planning_projects FOR EACH ROW EXECUTE FUNCTION public.planning_projects_completed_at();

-- Lifecycle transitions: close -> expire credentials; reopen/restore -> pause externals
CREATE OR REPLACE FUNCTION public.planning_projects_external_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_mode text; new_mode text; n int;
BEGIN
  old_mode := public.planning_external_mode_for(OLD.status, OLD.deleted_at, OLD.completed_at);
  new_mode := public.planning_external_mode_for(NEW.status, NEW.deleted_at, NEW.completed_at);
  IF new_mode='none' AND old_mode<>'none' THEN
    UPDATE public.planning_external_sessions s SET expires_at=least(s.expires_at,now()) FROM public.planning_external_participants e WHERE e.id=s.participant_id AND e.planning_project_id=NEW.id AND s.expires_at>now();
    UPDATE public.planning_external_login_links l SET used_at=coalesce(l.used_at,now()) FROM public.planning_external_participants e WHERE e.id=l.participant_id AND e.planning_project_id=NEW.id AND l.used_at IS NULL;
    INSERT INTO public.planning_activity(planning_project_id,action,summary,performed_by,metadata) VALUES(NEW.id,'external_access_closed','Ekstern tilgang avsluttet fordi prosjektet ble stengt',auth.uid(),jsonb_build_object('status',NEW.status,'deleted',NEW.deleted_at IS NOT NULL));
  ELSIF old_mode='none' AND new_mode<>'none' THEN
    UPDATE public.planning_external_participants SET status='paused' WHERE planning_project_id=NEW.id AND status='active' AND deleted_at IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n>0 THEN INSERT INTO public.planning_activity(planning_project_id,action,summary,performed_by,metadata) VALUES(NEW.id,'external_access_paused',n||' ekstern(e) satt på pause etter gjenåpning',auth.uid(),'{}'::jsonb); END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_planning_projects_external_lifecycle ON public.planning_projects;
CREATE TRIGGER trg_planning_projects_external_lifecycle AFTER UPDATE OF status, deleted_at ON public.planning_projects FOR EACH ROW EXECUTE FUNCTION public.planning_projects_external_lifecycle();

-- Explicit reactivation by a manager
CREATE OR REPLACE FUNCTION public.planning_external_resume(_participant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid;
BEGIN
  SELECT planning_project_id INTO pid FROM public.planning_external_participants WHERE id=_participant_id AND status='paused' AND deleted_at IS NULL;
  IF pid IS NULL OR public.planning_external_manager(pid) IS NOT TRUE THEN RAISE EXCEPTION 'Ingen tilgang' USING ERRCODE='42501'; END IF;
  IF public.planning_project_external_mode(pid)='none' THEN RAISE EXCEPTION 'Prosjektet er stengt for eksterne'; END IF;
  UPDATE public.planning_external_participants SET status='active' WHERE id=_participant_id;
  INSERT INTO public.planning_activity(planning_project_id,action,summary,performed_by,metadata) VALUES(pid,'external_access_resumed','Ekstern tilgang aktivert igjen',auth.uid(),jsonb_build_object('participant_id',_participant_id));
END $$;
REVOKE ALL ON FUNCTION public.planning_external_resume(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planning_external_resume(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.planning_project_external_mode(uuid) TO authenticated;
