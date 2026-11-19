CREATE TABLE public.contract_watch_order_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  commitment_id uuid NOT NULL REFERENCES public.contract_watch_commitments(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','discarded')),
  suggested_type text NOT NULL DEFAULT 'service_order' CHECK (suggested_type IN ('service_order','project')),
  customer_id uuid, customer_account_id uuid, contact_id uuid,
  work_site text, description text, agreed_date date, agreed_time text,
  source_conversation_id text, source_internet_message_id text, source_mailbox text,
  attachment_refs jsonb NOT NULL DEFAULT '[]',
  sensitive_flag boolean NOT NULL DEFAULT false,
  ai_suggestion jsonb NOT NULL DEFAULT '{}',
  version integer NOT NULL DEFAULT 1,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_cw_draft_active ON public.contract_watch_order_drafts(commitment_id) WHERE status <> 'discarded';
GRANT SELECT ON public.contract_watch_order_drafts TO authenticated;
GRANT ALL ON public.contract_watch_order_drafts TO service_role;
ALTER TABLE public.contract_watch_order_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY cw_drafts_superadmin ON public.contract_watch_order_drafts FOR SELECT TO authenticated USING (public.is_global_superadmin(auth.uid()));

CREATE OR REPLACE FUNCTION public.cw_draft_prepare(_commitment_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.contract_watch_commitments; d uuid;
BEGIN
  IF NOT public.is_global_superadmin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.contract_watch_commitments WHERE id = _commitment_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'commitment_not_found'; END IF;
  SELECT id INTO d FROM public.contract_watch_order_drafts WHERE commitment_id = c.id AND status <> 'discarded';
  IF d IS NOT NULL THEN RETURN d; END IF; -- idempotent: never a second draft
  INSERT INTO public.contract_watch_order_drafts(company_id, commitment_id, customer_id, customer_account_id, description,
    agreed_date, agreed_time, source_conversation_id, source_internet_message_id, source_mailbox, created_by, updated_by)
  VALUES (c.company_id, c.id, c.customer_id, c.customer_account_id, c.excerpt,
    CASE WHEN c.date_certain THEN c.promised_date END, CASE WHEN c.date_certain THEN c.promised_time END,
    c.conversation_id, c.internet_message_id, c.mailbox, auth.uid(), auth.uid())
  RETURNING id INTO d;
  INSERT INTO public.contract_watch_audit(actor, action, details) VALUES (auth.uid(), 'draft_prepare', jsonb_build_object('draft', d, 'commitment', c.id));
  RETURN d;
END $$;

CREATE OR REPLACE FUNCTION public.cw_draft_save(_id uuid, _version integer, _patch jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.contract_watch_order_drafts; v_cust uuid; v_acc uuid; v_con uuid; ok boolean;
BEGIN
  IF NOT public.is_global_superadmin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM public.contract_watch_order_drafts WHERE id = _id FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'draft_not_found'; END IF;
  IF d.status = 'discarded' THEN RAISE EXCEPTION 'draft_discarded'; END IF;
  IF d.version <> _version THEN RAISE EXCEPTION 'version_conflict'; END IF;
  v_cust := CASE WHEN _patch ? 'customer_id' THEN nullif(_patch->>'customer_id','')::uuid ELSE d.customer_id END;
  v_acc := CASE WHEN _patch ? 'customer_account_id' THEN nullif(_patch->>'customer_account_id','')::uuid ELSE d.customer_account_id END;
  v_con := CASE WHEN _patch ? 'contact_id' THEN nullif(_patch->>'contact_id','')::uuid ELSE d.contact_id END;
  IF v_cust IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.customers WHERE id = v_cust AND company_id = d.company_id AND deleted_at IS NULL) INTO ok;
    IF NOT ok THEN RAISE EXCEPTION 'customer_invalid'; END IF;
  END IF;
  IF v_acc IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.customer_accounts WHERE id = v_acc AND customer_id = v_cust) THEN RAISE EXCEPTION 'account_not_of_customer'; END IF;
  IF v_con IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.customer_contacts WHERE id = v_con AND customer_id = v_cust) THEN RAISE EXCEPTION 'contact_not_of_customer'; END IF;
  UPDATE public.contract_watch_order_drafts SET
    customer_id = v_cust, customer_account_id = v_acc, contact_id = v_con,
    suggested_type = coalesce(_patch->>'suggested_type', suggested_type),
    work_site = CASE WHEN _patch ? 'work_site' THEN left(_patch->>'work_site', 500) ELSE work_site END,
    description = CASE WHEN _patch ? 'description' THEN left(_patch->>'description', 5000) ELSE description END,
    agreed_date = CASE WHEN _patch ? 'agreed_date' THEN nullif(_patch->>'agreed_date','')::date ELSE agreed_date END,
    agreed_time = CASE WHEN _patch ? 'agreed_time' THEN nullif(_patch->>'agreed_time','') ELSE agreed_time END,
    sensitive_flag = coalesce((_patch->>'sensitive_flag')::boolean, sensitive_flag),
    status = CASE WHEN _patch->>'status' IN ('draft','ready','discarded') THEN _patch->>'status' ELSE status END,
    version = version + 1, updated_by = auth.uid(), updated_at = now()
  WHERE id = _id;
  INSERT INTO public.contract_watch_audit(actor, action, details) VALUES (auth.uid(), 'draft_save', jsonb_build_object('draft', _id, 'keys', (SELECT jsonb_agg(k) FROM jsonb_object_keys(_patch) k)));
  RETURN d.version + 1;
END $$;
REVOKE ALL ON FUNCTION public.cw_draft_prepare(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.cw_draft_save(uuid, integer, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cw_draft_prepare(uuid), public.cw_draft_save(uuid, integer, jsonb) TO authenticated;