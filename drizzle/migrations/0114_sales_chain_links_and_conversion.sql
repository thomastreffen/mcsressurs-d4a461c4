ALTER TABLE public.calculations ADD COLUMN IF NOT EXISTS customer_account_id uuid REFERENCES public.customer_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.commercial_cases ADD COLUMN IF NOT EXISTS customer_account_id uuid REFERENCES public.customer_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS customer_account_id uuid REFERENCES public.customer_accounts(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.validate_customer_account_link() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.customer_account_id IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.customer_account_id IS NOT DISTINCT FROM OLD.customer_account_id AND NEW.customer_id IS NOT DISTINCT FROM OLD.customer_id AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id THEN RETURN NEW; END IF;
 IF NEW.customer_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.customer_accounts a WHERE a.id=NEW.customer_account_id AND a.customer_id=NEW.customer_id AND a.company_id IS NOT DISTINCT FROM NEW.company_id AND a.deleted_at IS NULL) THEN
  RAISE EXCEPTION 'customer_account_not_available' USING ERRCODE='22023'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER trg_calculations_validate_account BEFORE INSERT OR UPDATE OF customer_account_id, customer_id, company_id ON public.calculations FOR EACH ROW EXECUTE FUNCTION public.validate_customer_account_link();
CREATE TRIGGER trg_commercial_cases_validate_account BEFORE INSERT OR UPDATE OF customer_account_id, customer_id, company_id ON public.commercial_cases FOR EACH ROW EXECUTE FUNCTION public.validate_customer_account_link();
CREATE TRIGGER trg_events_validate_account BEFORE INSERT OR UPDATE OF customer_account_id, customer_id, company_id ON public.events FOR EACH ROW EXECUTE FUNCTION public.validate_customer_account_link();

CREATE OR REPLACE FUNCTION public.auto_create_commercial_case_for_lead()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _new_id uuid; _title text;
BEGIN
  IF NEW.commercial_case_id IS NOT NULL OR NEW.company_id IS NULL OR NEW.customer_id IS NULL THEN RETURN NEW; END IF;
  _title := COALESCE(NULLIF(NEW.company_name,''), 'Lead');
  INSERT INTO public.commercial_cases (company_id, title, customer_id, customer_account_id, contact_person_id, created_by, source, phase)
  VALUES (NEW.company_id, _title, NEW.customer_id, NEW.customer_account_id, NEW.customer_contact_id, auth.uid(), 'lead', 'lead')
  RETURNING id INTO _new_id;
  NEW.commercial_case_id := _new_id;
  RETURN NEW;
END $function$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_events_offer_project ON public.events(offer_id) WHERE offer_id IS NOT NULL AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.company_tripletex_integrated(_company_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS (SELECT 1 FROM public.tripletex_connections WHERE company_id=_company_id AND mode <> 'off') $$;

CREATE OR REPLACE FUNCTION public.offer_conversion_preview(_offer_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.offers; c public.calculations; ev uuid;
BEGIN
 SELECT * INTO o FROM public.offers WHERE id=_offer_id AND deleted_at IS NULL;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT public.has_company_access(auth.uid(), o.company_id, 'resource_plan', 'edit') THEN RAISE EXCEPTION 'not_available'; END IF;
 SELECT * INTO c FROM public.calculations WHERE id=o.calculation_id;
 SELECT id INTO ev FROM public.events WHERE offer_id=o.id AND deleted_at IS NULL;
 RETURN jsonb_build_object('offer_id',o.id,'offer_number',o.offer_number,'status',o.status,'accepted_at',o.accepted_at,'accepted_name',o.accepted_name,
  'total_ex_vat',o.total_ex_vat,'has_snapshot',o.generated_html_snapshot IS NOT NULL,'content_hash',o.content_hash,
  'title',coalesce(c.project_title,o.offer_number),'customer_id',c.customer_id,'customer_name',(SELECT name FROM public.customers WHERE id=c.customer_id),
  'customer_account_id',c.customer_account_id,'account_name',(SELECT name FROM public.customer_accounts WHERE id=c.customer_account_id),
  'contact_name',(SELECT name FROM public.customer_contacts WHERE id=c.contact_person_id),'lead_id',coalesce(o.lead_id,c.lead_id),'commercial_case_id',c.commercial_case_id,
  'existing_project_id',ev,'tripletex_integrated',public.company_tripletex_integrated(o.company_id),
  'convertible',o.status IN ('accepted','signed') AND c.customer_id IS NOT NULL);
END $$;

CREATE OR REPLACE FUNCTION public.convert_offer_to_project(_offer_id uuid, _mode text, _project_id uuid, _title text, _request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.offers; c public.calculations; ev uuid; p public.events; lead uuid; t text := btrim(coalesce(_title,''));
BEGIN
 IF _request_id IS NULL OR _mode NOT IN ('link','create') THEN RAISE EXCEPTION 'invalid_input'; END IF;
 SELECT * INTO o FROM public.offers WHERE id=_offer_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT public.has_company_access(auth.uid(), o.company_id, 'resource_plan', 'edit') THEN RAISE EXCEPTION 'not_available'; END IF;
 SELECT id INTO ev FROM public.events WHERE offer_id=o.id AND deleted_at IS NULL;
 IF ev IS NOT NULL THEN RETURN jsonb_build_object('status','already_linked','project_id',ev); END IF;
 IF o.status NOT IN ('accepted','signed') THEN RAISE EXCEPTION 'offer_not_accepted'; END IF;
 SELECT * INTO c FROM public.calculations WHERE id=o.calculation_id;
 IF c.customer_id IS NULL THEN RAISE EXCEPTION 'offer_customer_missing'; END IF;
 lead := coalesce(o.lead_id, c.lead_id);
 IF _mode='link' THEN
  SELECT * INTO p FROM public.events WHERE id=_project_id AND company_id=o.company_id AND deleted_at IS NULL AND entity_type='financial_project' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project_not_available'; END IF;
  IF p.offer_id IS NOT NULL THEN RAISE EXCEPTION 'project_has_other_offer'; END IF;
  IF p.customer_id IS NOT NULL AND p.customer_id <> c.customer_id THEN RAISE EXCEPTION 'project_customer_mismatch'; END IF;
  -- Only link columns change: no title/time/status change, so no calendar queue trigger fires.
  UPDATE public.events SET offer_id=o.id, customer_id=c.customer_id, customer_account_id=coalesce(customer_account_id, c.customer_account_id),
   source_lead_id=coalesce(source_lead_id, lead), commercial_case_id=coalesce(commercial_case_id, c.commercial_case_id) WHERE id=p.id;
  ev := p.id;
 ELSE
  IF public.company_tripletex_integrated(o.company_id) THEN RAISE EXCEPTION 'tripletex_company_link_only'; END IF;
  IF t='' OR length(t)>200 THEN RAISE EXCEPTION 'invalid_title'; END IF;
  INSERT INTO public.events(id,title,company_id,customer_id,customer_account_id,customer,offer_id,source_lead_id,commercial_case_id,entity_type,project_type,status,start_time,end_time,created_by,classification_status)
  VALUES(_request_id,t,o.company_id,c.customer_id,c.customer_account_id,(SELECT name FROM public.customers WHERE id=c.customer_id),o.id,lead,c.commercial_case_id,'financial_project','project','approved',now(),now(),auth.uid(),'classified')
  ON CONFLICT (id) DO NOTHING;
  ev := _request_id;
 END IF;
 IF lead IS NOT NULL THEN
  UPDATE public.leads SET status='won' WHERE id=lead AND status <> 'won';
  INSERT INTO public.lead_history(lead_id,action,description,performed_by,metadata) VALUES(lead,'converted_to_project',
   CASE WHEN _mode='link' THEN 'Akseptert tilbud koblet til eksisterende prosjekt' ELSE 'Akseptert tilbud konvertert til nytt prosjekt' END, auth.uid(), jsonb_build_object('project_id',ev,'offer_id',o.id));
 END IF;
 IF c.commercial_case_id IS NOT NULL THEN UPDATE public.commercial_cases SET won_at=coalesce(won_at,now()), phase='won' WHERE id=c.commercial_case_id; END IF;
 RETURN jsonb_build_object('status',CASE WHEN _mode='link' THEN 'linked' ELSE 'created' END,'project_id',ev);
END $$;

CREATE OR REPLACE FUNCTION public.customer_timeline(_company_id uuid, _customer_id uuid, _account_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_access(auth.uid(), _company_id, 'customers', 'view')
  OR NOT EXISTS (SELECT 1 FROM public.customers WHERE id=_customer_id AND company_id=_company_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN coalesce((SELECT jsonb_agg(x ORDER BY x.at DESC) FROM (
  SELECT 'lead' kind, l.id ref_id, l.created_at at, l.company_name title, l.status::text detail, l.customer_account_id account_id FROM public.leads l WHERE l.customer_id=_customer_id AND l.company_id=_company_id AND l.deleted_at IS NULL
  UNION ALL SELECT 'offer', o.id, coalesce(o.accepted_at,o.sent_at,o.created_at), coalesce(o.offer_number,'Tilbud'), o.status::text, c.customer_account_id FROM public.offers o JOIN public.calculations c ON c.id=o.calculation_id WHERE c.customer_id=_customer_id AND o.company_id=_company_id AND o.deleted_at IS NULL
  UNION ALL SELECT 'project', e.id, e.created_at, e.title, e.status::text, e.customer_account_id FROM public.events e WHERE e.customer_id=_customer_id AND e.company_id=_company_id AND e.deleted_at IS NULL AND e.entity_type='financial_project'
  UNION ALL SELECT 'invoice_basis', b.id, coalesce(b.approved_at,b.created_at), 'Fakturagrunnlag', b.status, NULL FROM public.invoice_basis b WHERE b.customer_id=_customer_id AND b.company_id=_company_id
  UNION ALL SELECT 'email', s.id, s.created_at, s.subject, s.status, s.customer_account_id FROM public.crm_email_sends s WHERE s.customer_id=_customer_id AND s.company_id=_company_id
  UNION ALL SELECT 'register', h.id, h.created_at, coalesce(h.after_state->>'name',''), h.kind, h.account_id FROM public.customer_register_history h WHERE h.customer_id=_customer_id AND h.company_id=_company_id
 ) x WHERE _account_id IS NULL OR x.account_id=_account_id LIMIT 200),'[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.offer_conversion_preview(uuid), public.convert_offer_to_project(uuid,text,uuid,text,uuid), public.customer_timeline(uuid,uuid,uuid), public.company_tripletex_integrated(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.offer_conversion_preview(uuid), public.convert_offer_to_project(uuid,text,uuid,text,uuid), public.customer_timeline(uuid,uuid,uuid) TO authenticated;