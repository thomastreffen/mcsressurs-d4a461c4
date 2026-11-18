ALTER TABLE public.customer_accounts ADD COLUMN IF NOT EXISTS city text, ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.customer_contacts ADD COLUMN IF NOT EXISTS customer_account_id uuid REFERENCES public.customer_accounts(id) ON DELETE SET NULL,
 ADD COLUMN IF NOT EXISTS owner_user_id uuid, ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
 ADD COLUMN IF NOT EXISTS verified_at timestamptz, ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS customer_contact_id uuid REFERENCES public.customer_contacts(id) ON DELETE SET NULL;
ALTER TABLE public.conversation_threads ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
 ADD COLUMN IF NOT EXISTS customer_account_id uuid REFERENCES public.customer_accounts(id) ON DELETE SET NULL,
 ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conv_threads_customer ON public.conversation_threads(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_contacts_email ON public.customer_contacts(customer_id, lower(email));

CREATE TABLE public.customer_register_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL, customer_id uuid NOT NULL, account_id uuid, contact_id uuid,
 actor_user_id uuid, actor_name text NOT NULL DEFAULT '', kind text NOT NULL,
 before_state jsonb, after_state jsonb, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.customer_register_history TO authenticated;
GRANT ALL ON public.customer_register_history TO service_role;
ALTER TABLE public.customer_register_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Register history readable with customer access" ON public.customer_register_history FOR SELECT TO authenticated
 USING (public.has_company_access(auth.uid(), company_id, 'customers', 'view'));
CREATE INDEX ON public.customer_register_history(customer_id, created_at DESC);

-- Contact integrity: department must belong to the same customer
CREATE OR REPLACE FUNCTION public.validate_customer_contact_account() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.customer_account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customer_accounts a WHERE a.id=NEW.customer_account_id AND a.customer_id=NEW.customer_id) THEN
  RAISE EXCEPTION 'contact_account_not_available' USING ERRCODE='22023'; END IF;
 NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER trg_customer_contacts_validate BEFORE INSERT OR UPDATE ON public.customer_contacts FOR EACH ROW EXECUTE FUNCTION public.validate_customer_contact_account();

-- Lead contact must belong to the lead's customer
CREATE OR REPLACE FUNCTION public.validate_lead_contact_link() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.customer_contact_id IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.customer_contact_id IS NOT DISTINCT FROM OLD.customer_contact_id AND NEW.customer_id IS NOT DISTINCT FROM OLD.customer_id THEN RETURN NEW; END IF;
 IF NEW.customer_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.customer_contacts k WHERE k.id=NEW.customer_contact_id AND k.customer_id=NEW.customer_id) THEN
  RAISE EXCEPTION 'lead_contact_not_available' USING ERRCODE='22023'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER trg_leads_validate_contact_link BEFORE INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.validate_lead_contact_link();

-- Thread customer link integrity
CREATE OR REPLACE FUNCTION public.validate_thread_customer_link() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cc uuid;
BEGIN
 IF NEW.customer_id IS NULL AND NEW.customer_account_id IS NULL AND NEW.lead_id IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.customer_id IS NOT DISTINCT FROM OLD.customer_id AND NEW.customer_account_id IS NOT DISTINCT FROM OLD.customer_account_id AND NEW.lead_id IS NOT DISTINCT FROM OLD.lead_id AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id THEN RETURN NEW; END IF;
 IF NEW.customer_id IS NULL THEN RAISE EXCEPTION 'thread_customer_required' USING ERRCODE='22023'; END IF;
 SELECT company_id INTO cc FROM public.customers WHERE id=NEW.customer_id AND deleted_at IS NULL;
 IF cc IS NULL OR cc IS DISTINCT FROM NEW.company_id THEN RAISE EXCEPTION 'thread_customer_not_available' USING ERRCODE='22023'; END IF;
 IF NEW.customer_account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customer_accounts a WHERE a.id=NEW.customer_account_id AND a.customer_id=NEW.customer_id AND a.deleted_at IS NULL) THEN
  RAISE EXCEPTION 'thread_account_not_available' USING ERRCODE='22023'; END IF;
 IF NEW.lead_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.id=NEW.lead_id AND l.customer_id=NEW.customer_id) THEN
  RAISE EXCEPTION 'thread_lead_not_available' USING ERRCODE='22023'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER trg_threads_validate_customer_link BEFORE INSERT OR UPDATE ON public.conversation_threads FOR EACH ROW EXECUTE FUNCTION public.validate_thread_customer_link();

-- Read register (departments + contacts) for one customer
CREATE OR REPLACE FUNCTION public.customer_register_get(_company_id uuid, _customer_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_access(auth.uid(), _company_id, 'customers', 'view')
  OR NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id=_customer_id AND c.company_id=_company_id AND c.deleted_at IS NULL) THEN
  RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN jsonb_build_object(
  'can_edit', public.has_company_access(auth.uid(), _company_id, 'customers', 'edit'),
  'accounts', coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'org_number',a.org_number,'city',a.city,'archived_at',a.archived_at) ORDER BY a.archived_at NULLS FIRST, a.name)
    FROM public.customer_accounts a WHERE a.customer_id=_customer_id AND a.company_id=_company_id AND a.deleted_at IS NULL),'[]'::jsonb),
  'contacts', coalesce((SELECT jsonb_agg(jsonb_build_object('id',k.id,'name',k.name,'email',k.email,'phone',k.phone,'role',k.role,'customer_account_id',k.customer_account_id,'owner_user_id',k.owner_user_id,'is_active',k.is_active,'verified_at',k.verified_at) ORDER BY k.is_active DESC, k.name)
    FROM public.customer_contacts k WHERE k.customer_id=_customer_id),'[]'::jsonb),
  'history', coalesce((SELECT jsonb_agg(h ORDER BY h.created_at DESC) FROM (SELECT id,kind,actor_name,account_id,contact_id,before_state,after_state,created_at FROM public.customer_register_history WHERE customer_id=_customer_id AND company_id=_company_id ORDER BY created_at DESC LIMIT 50) h),'[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public._register_actor() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT p.full_name FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id WHERE u.auth_user_id=auth.uid() AND u.is_active LIMIT 1),'Ukjent bruker') $$;

-- Save department (create with request id, edit, archive/restore). Returns {status, id, duplicates}
CREATE OR REPLACE FUNCTION public.customer_register_save_account(_company_id uuid, _customer_id uuid, _account_id uuid, _name text, _city text, _org_number text, _archived boolean, _confirm_duplicate boolean, _request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.customer_accounts; saved public.customer_accounts; dups jsonb; n text := btrim(coalesce(_name,'')); org text := nullif(regexp_replace(coalesce(_org_number,''),'\s','','g'),'');
BEGIN
 IF NOT public.has_company_access(auth.uid(), _company_id, 'customers', 'edit') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id=_customer_id AND c.company_id=_company_id AND c.deleted_at IS NULL) THEN RAISE EXCEPTION 'Invalid legal customer'; END IF;
 IF n='' OR length(n)>200 OR length(coalesce(_city,''))>120 THEN RAISE EXCEPTION 'Invalid department name'; END IF;
 IF org IS NOT NULL AND org !~ '^[0-9]{9}$' THEN RAISE EXCEPTION 'Invalid org number'; END IF;
 IF _account_id IS NOT NULL THEN
  SELECT * INTO old FROM public.customer_accounts WHERE id=_account_id AND customer_id=_customer_id AND company_id=_company_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid department'; END IF;
 ELSIF _request_id IS NULL THEN RAISE EXCEPTION 'request id required';
 ELSIF EXISTS (SELECT 1 FROM public.customer_accounts WHERE id=_request_id) THEN
  RETURN jsonb_build_object('status','saved','id',_request_id);
 END IF;
 SELECT coalesce(jsonb_agg(a.name),'[]'::jsonb) INTO dups FROM public.customer_accounts a WHERE a.customer_id=_customer_id AND a.deleted_at IS NULL AND a.id IS DISTINCT FROM _account_id AND lower(btrim(a.name))=lower(n);
 IF jsonb_array_length(dups)>0 AND _confirm_duplicate IS DISTINCT FROM true THEN RETURN jsonb_build_object('status','needs_confirmation','duplicates',dups); END IF;
 IF _account_id IS NULL THEN
  INSERT INTO public.customer_accounts(id,name,customer_id,company_id,city,org_number) VALUES(_request_id,n,_customer_id,_company_id,nullif(btrim(coalesce(_city,'')),''),org) RETURNING * INTO saved;
 ELSE
  UPDATE public.customer_accounts SET name=n, city=nullif(btrim(coalesce(_city,'')),''), org_number=org, updated_at=now(),
   archived_at=CASE WHEN coalesce(_archived,false) THEN coalesce(archived_at,now()) ELSE NULL END WHERE id=_account_id RETURNING * INTO saved;
 END IF;
 INSERT INTO public.customer_register_history(company_id,customer_id,account_id,actor_user_id,actor_name,kind,before_state,after_state)
 VALUES(_company_id,_customer_id,saved.id,auth.uid(),public._register_actor(),
  CASE WHEN old.id IS NULL THEN 'account_created' WHEN saved.archived_at IS NOT NULL AND old.archived_at IS NULL THEN 'account_archived' WHEN saved.archived_at IS NULL AND old.archived_at IS NOT NULL THEN 'account_restored' ELSE 'account_updated' END,
  CASE WHEN old.id IS NULL THEN NULL ELSE to_jsonb(old) END, to_jsonb(saved));
 RETURN jsonb_build_object('status','saved','id',saved.id);
END $$;

-- Save contact. Same-customer email duplicate is blocked; other-customer duplicate needs confirmation.
CREATE OR REPLACE FUNCTION public.customer_register_save_contact(_company_id uuid, _customer_id uuid, _contact_id uuid, _state jsonb, _confirm_duplicate boolean, _request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.customer_contacts; saved public.customer_contacts; n text := btrim(coalesce(_state->>'name',''));
 em text := nullif(lower(btrim(coalesce(_state->>'email',''))),''); acc uuid := nullif(_state->>'customer_account_id','')::uuid;
 own uuid := nullif(_state->>'owner_user_id','')::uuid; active boolean := coalesce((_state->>'is_active')::boolean,true);
 verified boolean := coalesce((_state->>'mark_verified')::boolean,false); other_count int;
BEGIN
 IF NOT public.has_company_access(auth.uid(), _company_id, 'customers', 'edit') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id=_customer_id AND c.company_id=_company_id AND c.deleted_at IS NULL) THEN RAISE EXCEPTION 'Invalid legal customer'; END IF;
 IF n='' OR length(n)>200 OR length(coalesce(_state->>'role',''))>120 OR length(coalesce(_state->>'phone',''))>40 THEN RAISE EXCEPTION 'Invalid contact'; END IF;
 IF em IS NOT NULL AND (length(em)>254 OR em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN RAISE EXCEPTION 'Invalid email'; END IF;
 IF acc IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customer_accounts a WHERE a.id=acc AND a.customer_id=_customer_id AND a.deleted_at IS NULL) THEN RAISE EXCEPTION 'Invalid department'; END IF;
 IF own IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.crm_account_owners(_company_id) o WHERE o.user_id=own) THEN RAISE EXCEPTION 'Invalid responsible user'; END IF;
 IF _contact_id IS NOT NULL THEN
  SELECT * INTO old FROM public.customer_contacts WHERE id=_contact_id AND customer_id=_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid contact'; END IF;
 ELSIF _request_id IS NULL THEN RAISE EXCEPTION 'request id required';
 ELSIF EXISTS (SELECT 1 FROM public.customer_contacts WHERE id=_request_id) THEN RETURN jsonb_build_object('status','saved','id',_request_id);
 END IF;
 IF em IS NOT NULL AND EXISTS (SELECT 1 FROM public.customer_contacts k WHERE k.customer_id=_customer_id AND lower(k.email)=em AND k.id IS DISTINCT FROM _contact_id) THEN
  RETURN jsonb_build_object('status','duplicate_same_customer'); END IF;
 IF em IS NOT NULL THEN
  SELECT count(*) INTO other_count FROM public.customer_contacts k JOIN public.customers c ON c.id=k.customer_id
   WHERE c.company_id=_company_id AND k.customer_id<>_customer_id AND lower(k.email)=em;
  IF other_count>0 AND _confirm_duplicate IS DISTINCT FROM true THEN RETURN jsonb_build_object('status','needs_confirmation','other_customers',other_count); END IF;
 END IF;
 IF _contact_id IS NULL THEN
  INSERT INTO public.customer_contacts(id,customer_id,name,email,phone,role,customer_account_id,owner_user_id,is_active,verified_at)
  VALUES(_request_id,_customer_id,n,em,nullif(btrim(coalesce(_state->>'phone','')),''),nullif(btrim(coalesce(_state->>'role','')),''),acc,own,active,CASE WHEN verified THEN now() END) RETURNING * INTO saved;
 ELSE
  UPDATE public.customer_contacts SET name=n,email=em,phone=nullif(btrim(coalesce(_state->>'phone','')),''),role=nullif(btrim(coalesce(_state->>'role','')),''),
   customer_account_id=acc,owner_user_id=own,is_active=active,verified_at=CASE WHEN verified THEN now() ELSE verified_at END WHERE id=_contact_id RETURNING * INTO saved;
 END IF;
 INSERT INTO public.customer_register_history(company_id,customer_id,account_id,contact_id,actor_user_id,actor_name,kind,before_state,after_state)
 VALUES(_company_id,_customer_id,saved.customer_account_id,saved.id,auth.uid(),public._register_actor(),
  CASE WHEN old.id IS NULL THEN 'contact_created' WHEN old.is_active AND NOT saved.is_active THEN 'contact_deactivated' ELSE 'contact_updated' END,
  CASE WHEN old.id IS NULL THEN NULL ELSE to_jsonb(old) END, to_jsonb(saved));
 RETURN jsonb_build_object('status','saved','id',saved.id);
END $$;

-- Lead search: only active departments/contacts, contact carries department
CREATE OR REPLACE FUNCTION public.lead_customer_search(_company_id uuid, _q text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE q text := lower(coalesce(trim(_q), ''));
BEGIN
  IF auth.uid() IS NULL OR _company_id IS NULL OR NOT (public.is_super_admin(auth.uid())
     OR public.has_company_access(auth.uid(), _company_id, 'customers', 'view')) THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(r)::jsonb ORDER BY r.rank, r.name)
    FROM (
      SELECT c.id, c.name, c.org_number,
        CASE WHEN lower(c.name) LIKE q || '%' THEN 0 ELSE 1 END AS rank,
        coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'org_number', a.org_number) ORDER BY a.name)
          FROM public.customer_accounts a WHERE a.customer_id = c.id AND a.deleted_at IS NULL AND a.archived_at IS NULL), '[]'::jsonb) AS accounts,
        coalesce((SELECT jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'email', k.email, 'phone', k.phone, 'role', k.role, 'customer_account_id', k.customer_account_id) ORDER BY k.name)
          FROM public.customer_contacts k WHERE k.customer_id = c.id AND k.is_active), '[]'::jsonb) AS contacts
      FROM public.customers c
      WHERE c.company_id = _company_id AND c.deleted_at IS NULL
        AND (q = '' OR lower(c.name) LIKE '%' || q || '%' OR replace(coalesce(c.org_number,''),' ','') LIKE '%' || replace(q,' ','') || '%')
      ORDER BY rank, c.name
      LIMIT 20
    ) r), '[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.customer_register_get(uuid,uuid), public.customer_register_save_account(uuid,uuid,uuid,text,text,text,boolean,boolean,uuid), public.customer_register_save_contact(uuid,uuid,uuid,jsonb,boolean,uuid), public._register_actor() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.customer_register_get(uuid,uuid), public.customer_register_save_account(uuid,uuid,uuid,text,text,text,boolean,boolean,uuid), public.customer_register_save_contact(uuid,uuid,uuid,jsonb,boolean,uuid) TO authenticated;