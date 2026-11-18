CREATE TABLE public.crm_email_sends (
 id uuid PRIMARY KEY,
 company_id uuid NOT NULL, customer_id uuid NOT NULL REFERENCES public.customers(id),
 customer_account_id uuid REFERENCES public.customer_accounts(id), lead_id uuid REFERENCES public.leads(id),
 thread_id uuid REFERENCES public.conversation_threads(id),
 sender_user_id uuid NOT NULL, sender_email text,
 to_emails text[] NOT NULL DEFAULT '{}', cc_emails text[] NOT NULL DEFAULT '{}', manual_emails text[] NOT NULL DEFAULT '{}',
 subject text NOT NULL, status text NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed','accepted','failed','uncertain')),
 graph_status int, error_code text, internet_message_id text,
 created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz);
GRANT SELECT ON public.crm_email_sends TO authenticated;
GRANT ALL ON public.crm_email_sends TO service_role;
ALTER TABLE public.crm_email_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM email log readable with customer access" ON public.crm_email_sends FOR SELECT TO authenticated
 USING (public.has_company_access(auth.uid(), company_id, 'customers', 'view'));
CREATE INDEX ON public.crm_email_sends(customer_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.crm_email_prepare(_company_id uuid, _customer_id uuid, _account_id uuid, _lead_id uuid, _contact_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE cname text; aname text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_access(auth.uid(), _company_id, 'customers', 'edit') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT name INTO cname FROM public.customers WHERE id=_customer_id AND company_id=_company_id AND deleted_at IS NULL;
 IF cname IS NULL THEN RAISE EXCEPTION 'Invalid legal customer'; END IF;
 IF _account_id IS NOT NULL THEN
  SELECT name INTO aname FROM public.customer_accounts WHERE id=_account_id AND customer_id=_customer_id AND deleted_at IS NULL AND archived_at IS NULL;
  IF aname IS NULL THEN RAISE EXCEPTION 'Invalid department'; END IF;
 END IF;
 IF _lead_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.id=_lead_id AND l.customer_id=_customer_id AND l.deleted_at IS NULL) THEN RAISE EXCEPTION 'Invalid lead'; END IF;
 RETURN jsonb_build_object('customer_name',cname,'account_name',aname,
  'contacts', coalesce((SELECT jsonb_agg(jsonb_build_object('id',k.id,'name',k.name,'email',lower(k.email)))
    FROM public.customer_contacts k WHERE k.customer_id=_customer_id AND k.is_active AND k.email IS NOT NULL AND k.id = ANY(coalesce(_contact_ids,'{}'))),'[]'::jsonb),
  'existing_thread_id', (SELECT t.id FROM public.conversation_threads t WHERE t.customer_id=_customer_id AND t.customer_account_id IS NOT DISTINCT FROM _account_id
    AND t.lead_id IS NOT DISTINCT FROM _lead_id AND t.deleted_at IS NULL AND t.thread_category='crm_email' ORDER BY t.last_activity_at DESC NULLS LAST LIMIT 1));
END $$;
REVOKE ALL ON FUNCTION public.crm_email_prepare(uuid,uuid,uuid,uuid,uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.crm_email_prepare(uuid,uuid,uuid,uuid,uuid[]) TO authenticated;