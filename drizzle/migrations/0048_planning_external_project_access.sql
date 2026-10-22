CREATE TABLE public.planning_external_participants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), planning_project_id uuid NOT NULL REFERENCES public.planning_projects(id),
 name text NOT NULL, email text NOT NULL, company_name text NOT NULL DEFAULT '', participant_type text NOT NULL CHECK(participant_type IN ('customer','supplier')),
 access_level text NOT NULL DEFAULT 'standard' CHECK(access_level='standard'), status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','active','revoked','send_failed')),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), accepted_at timestamptz, deleted_at timestamptz, deleted_by uuid,
 invite_hash text, invite_expires_at timestamptz, UNIQUE(planning_project_id,email)
);
GRANT SELECT ON public.planning_external_participants TO authenticated;
GRANT ALL ON public.planning_external_participants TO service_role;
ALTER TABLE public.planning_external_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY external_participants_internal_read ON public.planning_external_participants FOR SELECT TO authenticated USING(public.has_planning_project_access(planning_project_id));
REVOKE SELECT ON public.planning_external_participants FROM authenticated;
GRANT SELECT(id,planning_project_id,name,email,company_name,participant_type,access_level,status,created_by,created_at,accepted_at,deleted_at) ON public.planning_external_participants TO authenticated;
CREATE TABLE public.planning_external_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), participant_id uuid NOT NULL REFERENCES public.planning_external_participants(id), token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL DEFAULT (now()+interval '7 days'), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.planning_external_sessions TO service_role;
ALTER TABLE public.planning_external_sessions ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.planning_project_channels (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), planning_project_id uuid NOT NULL REFERENCES public.planning_projects(id), channel text NOT NULL CHECK(channel IN ('internal','supplier','customer','all')), UNIQUE(planning_project_id,channel)
);
GRANT SELECT ON public.planning_project_channels TO authenticated;
GRANT ALL ON public.planning_project_channels TO service_role;
ALTER TABLE public.planning_project_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY planning_channels_read ON public.planning_project_channels FOR SELECT TO authenticated USING(public.has_planning_project_access(planning_project_id));
ALTER TABLE public.planning_messages ADD COLUMN channel text NOT NULL DEFAULT 'internal' CHECK(channel IN ('internal','supplier','customer','all'));
ALTER TABLE public.planning_messages ADD COLUMN external_author_id uuid REFERENCES public.planning_external_participants(id);
ALTER TABLE public.planning_messages ADD COLUMN recipient_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.planning_messages ADD COLUMN client_request_id uuid;
CREATE UNIQUE INDEX planning_message_request_unique ON public.planning_messages(client_request_id) WHERE client_request_id IS NOT NULL;
GRANT SELECT(channel,external_author_id,recipient_snapshot,client_request_id) ON public.planning_messages TO authenticated;
ALTER TABLE public.planning_files ADD COLUMN shared_visibility text NOT NULL DEFAULT 'internal' CHECK(shared_visibility IN ('internal','supplier','customer','all'));
ALTER TABLE public.planning_tasks ADD COLUMN shared_visibility text NOT NULL DEFAULT 'internal' CHECK(shared_visibility IN ('internal','supplier','customer','all'));
ALTER TABLE public.planning_tasks ADD COLUMN external_assignee_id uuid REFERENCES public.planning_external_participants(id);
ALTER TABLE public.planning_work_packages ADD COLUMN shared_visibility text NOT NULL DEFAULT 'internal' CHECK(shared_visibility IN ('internal','supplier','customer','all'));
GRANT SELECT(shared_visibility) ON public.planning_files,public.planning_work_packages TO authenticated;
GRANT SELECT(shared_visibility,external_assignee_id) ON public.planning_tasks TO authenticated;
CREATE FUNCTION public.planning_external_manager(_project_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.planning_projects p WHERE p.id=_project_id AND p.deleted_at IS NULL AND public.has_planning_project_access(p.id) AND (public.is_super_admin(auth.uid()) OR p.created_by=auth.uid() OR p.owner_user_id=auth.uid() OR public.has_company_access(auth.uid(),p.company_id,'planning','edit') OR EXISTS(SELECT 1 FROM public.planning_members m WHERE m.planning_project_id=p.id AND m.user_id=auth.uid() AND m.member_type='internal' AND m.role IN ('owner','lead'))))
$$;
CREATE FUNCTION public.planning_external_identity(_token text) RETURNS public.planning_external_participants LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT e FROM public.planning_external_sessions s JOIN public.planning_external_participants e ON e.id=s.participant_id JOIN public.planning_projects p ON p.id=e.planning_project_id WHERE s.token_hash=encode(extensions.digest(_token,'sha256'),'hex') AND length(_token)>=40 AND s.expires_at>now() AND e.status='active' AND e.deleted_at IS NULL AND p.deleted_at IS NULL LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.planning_external_identity(text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.planning_channel_matches(_type text,_channel text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT _channel='all' OR (_type=_channel AND _channel IN ('supplier','customer')) $$;
CREATE FUNCTION public.planning_channel_people(_project_id uuid,_channel text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(x.person ORDER BY x.person->>'company_name',x.person->>'name'),'[]'::jsonb) FROM (
 SELECT jsonb_build_object('id',u.uid,'kind','internal','name',coalesce(pe.full_name,t.name,'MCS-deltaker'),'company_name',coalesce(c.name,'MCS')) person
 FROM (SELECT user_id uid FROM public.planning_members WHERE planning_project_id=_project_id AND member_type='internal' AND user_id IS NOT NULL UNION SELECT created_by FROM public.planning_projects WHERE id=_project_id AND created_by IS NOT NULL UNION SELECT owner_user_id FROM public.planning_projects WHERE id=_project_id AND owner_user_id IS NOT NULL) u
 LEFT JOIN public.user_accounts ua ON ua.auth_user_id=u.uid AND ua.is_active=true LEFT JOIN public.people pe ON pe.id=ua.person_id LEFT JOIN public.technicians t ON t.user_id=u.uid LEFT JOIN public.internal_companies c ON c.id=ua.company_id
 UNION ALL SELECT jsonb_build_object('id',e.id,'kind','external','name',e.name,'company_name',e.company_name,'participant_type',e.participant_type) FROM public.planning_external_participants e WHERE e.planning_project_id=_project_id AND e.status='active' AND e.deleted_at IS NULL AND public.planning_channel_matches(e.participant_type,_channel)
 ) x
$$;
REVOKE ALL ON FUNCTION public.planning_channel_people(uuid,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.planning_channel_audience(_project_id uuid,_channel text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT public.has_planning_project_access(_project_id) OR _channel NOT IN ('internal','supplier','customer','all') THEN RAISE EXCEPTION 'Ingen tilgang' USING ERRCODE='42501'; END IF;
 RETURN public.planning_channel_people(_project_id,_channel);
END $$;
CREATE FUNCTION public.planning_create_external_invite(_project_id uuid,_name text,_email text,_company text,_type text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE e public.planning_external_participants; token text; BEGIN
 IF NOT public.planning_external_manager(_project_id) THEN RAISE EXCEPTION 'Du kan ikke invitere til dette prosjektet' USING ERRCODE='42501'; END IF;
 IF _type NOT IN ('customer','supplier') OR length(trim(_name))=0 OR length(trim(_name))>200 OR length(_company)>200 OR length(_email)>254 OR _email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Kontroller navn, e-post og type'; END IF;
 IF (SELECT count(*) FROM public.planning_external_participants WHERE planning_project_id=_project_id AND created_at>now()-interval '1 hour')>=20 THEN RAISE EXCEPTION 'For mange invitasjoner. Prøv senere'; END IF;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO public.planning_external_participants(planning_project_id,name,email,company_name,participant_type,created_by,invite_hash,invite_expires_at) VALUES(_project_id,trim(_name),lower(trim(_email)),trim(_company),_type,auth.uid(),encode(extensions.digest(token,'sha256'),'hex'),now()+interval '48 hours') RETURNING * INTO e;
 INSERT INTO public.planning_activity(planning_project_id,action,summary,performed_by) VALUES(_project_id,'external_invited','Ekstern invitert: '||e.name||' · '||e.company_name,auth.uid());
 RETURN jsonb_build_object('id',e.id,'token',token,'name',e.name,'email',e.email,'participant_type',e.participant_type,'project_name',(SELECT name FROM public.planning_projects WHERE id=_project_id)); END $$;
CREATE FUNCTION public.planning_revoke_external(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE e public.planning_external_participants; BEGIN
 SELECT * INTO e FROM public.planning_external_participants WHERE id=_id;
 IF NOT public.planning_external_manager(e.planning_project_id) THEN RAISE EXCEPTION 'Ingen tilgang' USING ERRCODE='42501'; END IF;
 UPDATE public.planning_external_participants SET status='revoked',deleted_at=now(),deleted_by=auth.uid(),invite_hash=NULL WHERE id=_id;
 INSERT INTO public.planning_activity(planning_project_id,action,summary,performed_by) VALUES(e.planning_project_id,'external_revoked','Tilgang avsluttet: '||e.name,auth.uid()); END $$;
CREATE FUNCTION public.planning_accept_external(_invite_token text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE e public.planning_external_participants; token text; BEGIN
 SELECT ep.* INTO e FROM public.planning_external_participants ep JOIN public.planning_projects p ON p.id=ep.planning_project_id WHERE ep.invite_hash=encode(extensions.digest(_invite_token,'sha256'),'hex') AND length(_invite_token)>=40 AND ep.invite_expires_at>now() AND ep.status IN ('pending','sent') AND ep.deleted_at IS NULL AND p.deleted_at IS NULL FOR UPDATE OF ep;
 IF e.id IS NULL THEN RAISE EXCEPTION 'Invitasjonen er utløpt eller allerede brukt' USING ERRCODE='42501'; END IF;
 UPDATE public.planning_external_participants SET status='active',accepted_at=now(),invite_hash=NULL WHERE id=e.id;
 token:=encode(extensions.gen_random_bytes(32),'hex'); INSERT INTO public.planning_external_sessions(participant_id,token_hash) VALUES(e.id,encode(extensions.digest(token,'sha256'),'hex'));
 INSERT INTO public.planning_activity(planning_project_id,action,summary) VALUES(e.planning_project_id,'external_accepted','Invitasjon godtatt: '||e.name);
 RETURN jsonb_build_object('session_token',token,'project_id',e.planning_project_id); END $$;
CREATE FUNCTION public.planning_external_project(_token text,_project_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE e public.planning_external_participants; result jsonb; BEGIN
 e:=public.planning_external_identity(_token);
 IF e.id IS NULL OR e.planning_project_id<>_project_id THEN RAISE EXCEPTION 'Ingen tilgang til prosjektet' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('project',jsonb_build_object('id',p.id,'name',p.name,'status',p.status,'expected_start',p.expected_start,'expected_end',p.expected_end),'participant',jsonb_build_object('id',e.id,'name',e.name,'participant_type',e.participant_type),'channels',jsonb_build_array(e.participant_type,'all'),
 'work_packages',coalesce((SELECT jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'description',w.description,'status',w.status,'planned_start',w.planned_start,'planned_end',w.planned_end)) FROM public.planning_work_packages w WHERE w.planning_project_id=p.id AND public.planning_channel_matches(e.participant_type,w.shared_visibility)),'[]'::jsonb),
 'tasks',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'description',t.description,'status',t.status,'due_date',t.due_date,'assigned_to_me',t.external_assignee_id=e.id)) FROM public.planning_tasks t WHERE t.planning_project_id=p.id AND (public.planning_channel_matches(e.participant_type,t.shared_visibility) OR t.external_assignee_id=e.id)),'[]'::jsonb),
 'files',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'display_name',f.display_name,'shared_visibility',f.shared_visibility,'category',f.category)) FROM public.planning_files f WHERE f.planning_project_id=p.id AND f.storage_bucket='planning-files' AND split_part(f.storage_path,'/',1)=p.id::text AND public.planning_channel_matches(e.participant_type,f.shared_visibility)),'[]'::jsonb)) INTO result FROM public.planning_projects p WHERE p.id=_project_id AND p.deleted_at IS NULL;
 RETURN result; END $$;
CREATE FUNCTION public.planning_external_channel(_token text,_project_id uuid,_channel text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE e public.planning_external_participants; BEGIN
 e:=public.planning_external_identity(_token);
 IF e.id IS NULL OR e.planning_project_id<>_project_id OR NOT public.planning_channel_matches(e.participant_type,_channel) THEN RAISE EXCEPTION 'Ingen tilgang til samtalen' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('audience',public.planning_channel_people(_project_id,_channel),'messages',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'author_name',m.author_name,'created_at',m.created_at,'reply_to_id',m.reply_to_id,'recipient_snapshot',m.recipient_snapshot) ORDER BY m.created_at) FROM public.planning_messages m WHERE m.planning_project_id=_project_id AND m.channel=_channel AND m.deleted_at IS NULL AND (m.external_author_id=e.id OR m.recipient_snapshot @> jsonb_build_array(jsonb_build_object('id',e.id,'kind','external')))),'[]'::jsonb)); END $$;
CREATE FUNCTION public.planning_send_channel_message(_project_id uuid,_channel text,_body text,_external_ids uuid[],_request_id uuid,_reply_to uuid DEFAULT NULL,_token text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE e public.planning_external_participants; audience jsonb; recipients jsonb; mid uuid; sender_name text; parent public.planning_messages; BEGIN
 IF _request_id IS NULL OR length(trim(_body))=0 OR length(_body)>20000 OR _channel NOT IN ('internal','customer','supplier','all') THEN RAISE EXCEPTION 'Kontroller meldingen'; END IF;
 IF _token IS NOT NULL THEN e:=public.planning_external_identity(_token); IF e.id IS NULL OR e.planning_project_id<>_project_id OR NOT public.planning_channel_matches(e.participant_type,_channel) THEN RAISE EXCEPTION 'Ingen tilgang' USING ERRCODE='42501'; END IF; sender_name:=e.name;
 ELSE IF NOT public.has_planning_project_access(_project_id) THEN RAISE EXCEPTION 'Ingen tilgang' USING ERRCODE='42501'; END IF; SELECT coalesce(pe.full_name,t.name,'MCS') INTO sender_name FROM (SELECT auth.uid() id) u LEFT JOIN public.user_accounts ua ON ua.auth_user_id=u.id AND ua.is_active=true LEFT JOIN public.people pe ON pe.id=ua.person_id LEFT JOIN public.technicians t ON t.user_id=u.id LIMIT 1; END IF;
 audience:=public.planning_channel_people(_project_id,_channel);
 IF EXISTS(SELECT 1 FROM unnest(coalesce(_external_ids,'{}'::uuid[])) i WHERE NOT audience @> jsonb_build_array(jsonb_build_object('id',i,'kind','external'))) THEN RAISE EXCEPTION 'Mottaker tilhører ikke samtalen' USING ERRCODE='42501'; END IF;
 IF _reply_to IS NOT NULL THEN SELECT * INTO parent FROM public.planning_messages WHERE id=_reply_to AND planning_project_id=_project_id AND channel=_channel AND deleted_at IS NULL; IF parent.id IS NULL OR (e.id IS NOT NULL AND parent.external_author_id IS DISTINCT FROM e.id AND NOT parent.recipient_snapshot @> jsonb_build_array(jsonb_build_object('id',e.id,'kind','external'))) THEN RAISE EXCEPTION 'Ingen tilgang til meldingen du svarer på' USING ERRCODE='42501'; END IF; END IF;
 SELECT coalesce(jsonb_agg(a),'[]'::jsonb) INTO recipients FROM jsonb_array_elements(audience) a WHERE a->>'kind'='internal' OR (_external_ids IS NULL OR (a->>'id')::uuid=ANY(_external_ids));
 SELECT id INTO mid FROM public.planning_messages WHERE client_request_id=_request_id AND planning_project_id=_project_id AND channel=_channel AND ((e.id IS NOT NULL AND external_author_id=e.id) OR (e.id IS NULL AND author_id=auth.uid())); IF mid IS NOT NULL THEN RETURN mid; END IF;
 INSERT INTO public.planning_messages(planning_project_id,channel,body,author_id,external_author_id,author_name,recipient_snapshot,client_request_id,reply_to_id) VALUES(_project_id,_channel,trim(_body),CASE WHEN e.id IS NULL THEN auth.uid() END,e.id,sender_name,recipients,_request_id,_reply_to) RETURNING id INTO mid; RETURN mid; END $$;
CREATE FUNCTION public.planning_set_external_sharing(_project_id uuid,_kind text,_id uuid,_visibility text,_assignee uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT public.planning_external_manager(_project_id) OR _visibility NOT IN ('internal','customer','supplier','all') THEN RAISE EXCEPTION 'Ingen tilgang' USING ERRCODE='42501'; END IF;
 IF _assignee IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.planning_external_participants WHERE id=_assignee AND planning_project_id=_project_id AND status='active' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Ansvarlig må være deltaker i dette prosjektet'; END IF;
 IF _kind='file' THEN UPDATE public.planning_files SET shared_visibility=_visibility WHERE id=_id AND planning_project_id=_project_id AND (_visibility='internal' OR (storage_bucket='planning-files' AND split_part(storage_path,'/',1)=_project_id::text));
 ELSIF _kind='task' THEN UPDATE public.planning_tasks SET shared_visibility=_visibility,external_assignee_id=_assignee WHERE id=_id AND planning_project_id=_project_id;
 ELSIF _kind='work_package' THEN UPDATE public.planning_work_packages SET shared_visibility=_visibility WHERE id=_id AND planning_project_id=_project_id;
 ELSE RAISE EXCEPTION 'Ukjent deling'; END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'Kan ikke dele denne posten. Eldre offentlige filer må lastes opp privat først'; END IF;
 INSERT INTO public.planning_activity(planning_project_id,action,summary,performed_by,metadata) VALUES(_project_id,'external_sharing_changed','Ekstern synlighet endret',auth.uid(),jsonb_build_object('kind',_kind,'id',_id,'visibility',_visibility,'assignee',_assignee)); END $$;
CREATE FUNCTION public.planning_external_file(_token text,_file_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE e public.planning_external_participants; result jsonb; BEGIN
 e:=public.planning_external_identity(_token); IF e.id IS NULL THEN RAISE EXCEPTION 'Ingen tilgang' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('bucket','planning-files','path',f.storage_path) INTO result FROM public.planning_files f WHERE f.id=_file_id AND f.planning_project_id=e.planning_project_id AND f.storage_bucket='planning-files' AND split_part(f.storage_path,'/',1)=e.planning_project_id::text AND public.planning_channel_matches(e.participant_type,f.shared_visibility);
 IF result IS NULL THEN RAISE EXCEPTION 'Ingen tilgang til filen' USING ERRCODE='42501'; END IF; RETURN result; END $$;
CREATE FUNCTION public.planning_external_complete_task(_token text,_task_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE e public.planning_external_participants; BEGIN e:=public.planning_external_identity(_token); IF e.id IS NULL THEN RAISE EXCEPTION 'Ingen tilgang' USING ERRCODE='42501'; END IF;
 UPDATE public.planning_tasks SET status='done',completed_at=now() WHERE id=_task_id AND planning_project_id=e.planning_project_id AND external_assignee_id=e.id AND status<>'done'; IF NOT FOUND THEN RAISE EXCEPTION 'Oppgaven er ikke tildelt deg eller er allerede fullført' USING ERRCODE='42501'; END IF; END $$;
CREATE FUNCTION public.planning_channel_seed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN INSERT INTO public.planning_project_channels(planning_project_id,channel) SELECT NEW.id,c FROM unnest(ARRAY['internal','supplier','customer','all']) c ON CONFLICT DO NOTHING; RETURN NEW; END $$;
CREATE TRIGGER planning_project_channels_seed AFTER INSERT ON public.planning_projects FOR EACH ROW EXECUTE FUNCTION public.planning_channel_seed();
INSERT INTO public.planning_project_channels(planning_project_id,channel) SELECT p.id,c FROM public.planning_projects p CROSS JOIN unnest(ARRAY['internal','supplier','customer','all']) c ON CONFLICT DO NOTHING;
CREATE POLICY planning_message_channel_write_guard ON public.planning_messages AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(channel='internal' AND external_author_id IS NULL AND recipient_snapshot='[]'::jsonb AND client_request_id IS NULL);
CREATE POLICY planning_message_channel_update_guard ON public.planning_messages AS RESTRICTIVE FOR UPDATE TO authenticated USING(channel='internal' AND client_request_id IS NULL) WITH CHECK(channel='internal' AND external_author_id IS NULL AND recipient_snapshot='[]'::jsonb AND client_request_id IS NULL);
REVOKE ALL ON FUNCTION public.planning_external_manager(uuid),public.planning_channel_audience(uuid,text),public.planning_create_external_invite(uuid,text,text,text,text),public.planning_revoke_external(uuid),public.planning_accept_external(text),public.planning_external_project(text,uuid),public.planning_external_channel(text,uuid,text),public.planning_send_channel_message(uuid,text,text,uuid[],uuid,uuid,text),public.planning_set_external_sharing(uuid,text,uuid,text,uuid),public.planning_external_file(text,uuid),public.planning_external_complete_task(text,uuid),public.planning_channel_seed() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.planning_external_manager(uuid),public.planning_channel_audience(uuid,text),public.planning_create_external_invite(uuid,text,text,text,text),public.planning_revoke_external(uuid),public.planning_set_external_sharing(uuid,text,uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.planning_accept_external(text),public.planning_external_project(text,uuid),public.planning_external_channel(text,uuid,text),public.planning_send_channel_message(uuid,text,text,uuid[],uuid,uuid,text),public.planning_external_complete_task(text,uuid) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.planning_external_file(text,uuid) TO service_role;
COMMENT ON TABLE public.planning_external_sessions IS 'Project-only bearer sessions, hashed at rest; no auth user, employee, company membership or Hub role is created.';
COMMENT ON COLUMN public.planning_messages.recipient_snapshot IS 'Immutable recipient identity/name snapshot; omitted external recipients cannot retrieve message even through RPC.';