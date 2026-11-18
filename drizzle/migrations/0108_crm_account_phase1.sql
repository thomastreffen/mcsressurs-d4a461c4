CREATE TABLE public.customer_account_crm (
 account_id uuid PRIMARY KEY REFERENCES public.customer_accounts(id),
 company_id uuid NOT NULL REFERENCES public.internal_companies(id),
 owner_user_id uuid,
 relationship text NOT NULL DEFAULT 'existing' CHECK (relationship IN ('existing','prospect')),
 temperature text NOT NULL DEFAULT 'warm' CHECK (temperature IN ('hot','warm','cold')),
 priority text NOT NULL DEFAULT 'B' CHECK (priority IN ('A','B','C')),
 last_contact_on date,
 next_followup_on date,
 next_action text NOT NULL DEFAULT '',
 version integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.customer_account_crm TO authenticated;
GRANT ALL ON public.customer_account_crm TO service_role;
ALTER TABLE public.customer_account_crm ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_view ON public.customer_account_crm FOR SELECT TO authenticated USING(public.has_company_access(auth.uid(),company_id,'customers','view'));
CREATE TABLE public.customer_account_crm_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES public.customer_accounts(id),
 company_id uuid NOT NULL REFERENCES public.internal_companies(id),
 actor_user_id uuid NOT NULL,
 actor_name text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('created','updated','contact')),
 before_state jsonb,
 after_state jsonb NOT NULL,
 note text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.customer_account_crm_history TO authenticated;
GRANT ALL ON public.customer_account_crm_history TO service_role;
ALTER TABLE public.customer_account_crm_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_history_view ON public.customer_account_crm_history FOR SELECT TO authenticated USING(public.has_company_access(auth.uid(),company_id,'customers','view'));
CREATE OR REPLACE FUNCTION public.crm_account_owners(_company_id uuid) RETURNS TABLE(user_id uuid,name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT a.auth_user_id,p.full_name FROM public.user_accounts a JOIN public.people p ON p.id=a.person_id
 WHERE public.has_company_access(auth.uid(),_company_id,'customers','view') AND a.is_active AND a.verified_at IS NOT NULL AND p.is_active
 AND public.has_company_access(a.auth_user_id,_company_id,'customers','edit') ORDER BY p.full_name;
$$;
CREATE OR REPLACE FUNCTION public.crm_account_list(_company_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.customer_name,x.name),'[]'::jsonb) FROM (
 SELECT a.id,a.name,a.customer_id,a.company_id,c.name customer_name,r.owner_user_id,p.full_name owner_name,
 r.relationship,r.temperature,r.priority,r.last_contact_on,r.next_followup_on,r.next_action,coalesce(r.version,0) version
 FROM public.customer_accounts a JOIN public.customers c ON c.id=a.customer_id AND c.company_id=a.company_id
 LEFT JOIN public.customer_account_crm r ON r.account_id=a.id AND r.company_id=a.company_id
 LEFT JOIN public.user_accounts u ON u.auth_user_id=r.owner_user_id AND u.is_active
 LEFT JOIN public.people p ON p.id=u.person_id
 WHERE a.company_id=_company_id AND a.deleted_at IS NULL AND c.deleted_at IS NULL
 AND public.has_company_access(auth.uid(),_company_id,'customers','view')
 ) x;
$$;
CREATE OR REPLACE FUNCTION public.save_crm_account(_company_id uuid,_account_id uuid,_customer_id uuid,_name text,_verified boolean,_expected_version integer,_state jsonb,_note text,_request_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.customer_accounts; old public.customer_account_crm; saved public.customer_account_crm; actor text; owner uuid; contact date; followup date;
BEGIN
 IF NOT public.has_company_access(auth.uid(),_company_id,'customers','edit') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _state IS NULL OR jsonb_typeof(_state)<>'object' OR coalesce(_state->>'relationship','') NOT IN ('existing','prospect') OR coalesce(_state->>'temperature','') NOT IN ('hot','warm','cold') OR coalesce(_state->>'priority','') NOT IN ('A','B','C') THEN RAISE EXCEPTION 'Invalid CRM classification'; END IF;
 IF length(coalesce(_state->>'next_action',''))>500 OR length(coalesce(_note,''))>4000 THEN RAISE EXCEPTION 'Text too long'; END IF;
 owner:=nullif(_state->>'owner_user_id','')::uuid;
 IF owner IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crm_account_owners(_company_id) o WHERE o.user_id=owner) THEN RAISE EXCEPTION 'Invalid responsible user'; END IF;
 contact:=nullif(_state->>'last_contact_on','')::date; followup:=nullif(_state->>'next_followup_on','')::date;
 IF contact> (now() AT TIME ZONE 'Europe/Oslo')::date THEN RAISE EXCEPTION 'Contact cannot be in future'; END IF;
 IF contact IS NOT NULL AND btrim(coalesce(_note,''))='' THEN RAISE EXCEPTION 'Contact note required'; END IF;
 SELECT p.full_name INTO actor FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id WHERE u.auth_user_id=auth.uid() AND u.is_active;
 IF _account_id IS NULL THEN
  IF _verified IS DISTINCT FROM true OR _request_id IS NULL OR btrim(coalesce(_name,''))='' OR length(_name)>200 THEN RAISE EXCEPTION 'Verified local unit required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.customers c WHERE c.id=_customer_id AND c.company_id=_company_id AND c.deleted_at IS NULL) THEN RAISE EXCEPTION 'Invalid legal customer'; END IF;
  -- Client request UUID is the account ID: a repeated creation cannot make a second unit.
  INSERT INTO public.customer_accounts(id,name,customer_id,company_id) VALUES(_request_id,btrim(_name),_customer_id,_company_id) ON CONFLICT(id) DO NOTHING;
  _account_id:=_request_id;
 END IF;
 SELECT * INTO a FROM public.customer_accounts WHERE id=_account_id AND company_id=_company_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.customers c WHERE c.id=a.customer_id AND c.company_id=a.company_id AND c.deleted_at IS NULL) THEN RAISE EXCEPTION 'Invalid local unit'; END IF;
 IF _request_id IS NOT NULL AND _account_id=_request_id AND (a.customer_id IS DISTINCT FROM _customer_id OR a.name IS DISTINCT FROM btrim(_name)) THEN RAISE EXCEPTION 'Request mismatch'; END IF;
 SELECT * INTO old FROM public.customer_account_crm WHERE account_id=a.id;
 IF coalesce(old.version,0) IS DISTINCT FROM _expected_version THEN RAISE EXCEPTION 'Version conflict: reload'; END IF;
 INSERT INTO public.customer_account_crm(account_id,company_id,owner_user_id,relationship,temperature,priority,last_contact_on,next_followup_on,next_action)
 VALUES(a.id,_company_id,owner,_state->>'relationship',_state->>'temperature',_state->>'priority',contact,followup,coalesce(_state->>'next_action',''))
 ON CONFLICT(account_id) DO UPDATE SET owner_user_id=excluded.owner_user_id,relationship=excluded.relationship,temperature=excluded.temperature,priority=excluded.priority,last_contact_on=excluded.last_contact_on,next_followup_on=excluded.next_followup_on,next_action=excluded.next_action,version=customer_account_crm.version+1,updated_at=now()
 RETURNING * INTO saved;
 INSERT INTO public.customer_account_crm_history(account_id,company_id,actor_user_id,actor_name,kind,before_state,after_state,note)
 VALUES(a.id,_company_id,auth.uid(),coalesce(actor,'Ukjent bruker'),CASE WHEN old.account_id IS NULL THEN 'created' WHEN contact IS DISTINCT FROM old.last_contact_on THEN 'contact' ELSE 'updated' END,CASE WHEN old.account_id IS NULL THEN NULL ELSE to_jsonb(old) END,to_jsonb(saved),coalesce(_note,''));
 RETURN a.id;
END;
$$;
REVOKE ALL ON FUNCTION public.crm_account_owners(uuid),public.crm_account_list(uuid),public.save_crm_account(uuid,uuid,uuid,text,boolean,integer,jsonb,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_account_owners(uuid),public.crm_account_list(uuid),public.save_crm_account(uuid,uuid,uuid,text,boolean,integer,jsonb,text,uuid) TO authenticated,service_role;
