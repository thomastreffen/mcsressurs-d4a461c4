CREATE OR REPLACE FUNCTION public.cw_draft_prepare(_commitment_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c public.contract_watch_commitments; d uuid;
BEGIN
  IF NOT public.is_global_superadmin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.contract_watch_commitments WHERE id = _commitment_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'commitment_not_found'; END IF;
  -- v3+: order drafts only for open customer work (never documentation, deviations, internal or handled items)
  IF c.kind IS NOT NULL AND (c.kind NOT IN ('confirmed_job','job_request') OR c.action_status IN ('handled','answered')) THEN
    RAISE EXCEPTION 'draft_not_allowed_for_kind' USING ERRCODE='22023';
  END IF;
  SELECT id INTO d FROM public.contract_watch_order_drafts WHERE commitment_id = c.id AND status <> 'discarded';
  IF d IS NOT NULL THEN RETURN d; END IF;
  INSERT INTO public.contract_watch_order_drafts(company_id, commitment_id, customer_id, customer_account_id, description,
    agreed_date, agreed_time, source_conversation_id, source_internet_message_id, source_mailbox, created_by, updated_by)
  VALUES (c.company_id, c.id, c.customer_id, c.customer_account_id, COALESCE(c.task_summary, c.excerpt),
    CASE WHEN c.date_certain THEN c.promised_date END, CASE WHEN c.date_certain THEN c.promised_time END,
    c.conversation_id, c.internet_message_id, c.mailbox, auth.uid(), auth.uid())
  RETURNING id INTO d;
  INSERT INTO public.contract_watch_audit(actor, action, details) VALUES (auth.uid(), 'draft_prepare', jsonb_build_object('draft', d, 'commitment', c.id));
  RETURN d;
END $function$;