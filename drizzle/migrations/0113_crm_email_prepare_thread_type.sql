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
  'existing_thread_id', (SELECT t.id FROM public.conversation_threads t WHERE t.company_id=_company_id AND t.customer_id=_customer_id AND t.customer_account_id IS NOT DISTINCT FROM _account_id
    AND t.lead_id IS NOT DISTINCT FROM _lead_id AND t.deleted_at IS NULL AND t.thread_type='email_thread' AND t.status='open' ORDER BY t.last_activity_at DESC NULLS LAST LIMIT 1));
END $$;