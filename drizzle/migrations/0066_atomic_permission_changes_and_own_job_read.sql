CREATE OR REPLACE FUNCTION public.save_permission_override_changes(_account uuid, _company uuid, _changes jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; current_row public.user_permission_overrides_v2%ROWTYPE; login_id uuid; desired text;
BEGIN
 IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(_changes) <> 'array' OR jsonb_array_length(_changes)>300 THEN RAISE EXCEPTION 'Invalid changes'; END IF;
 SELECT auth_user_id INTO login_id FROM public.user_accounts WHERE id=_account FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(_changes) x GROUP BY x->>'permission_key' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate permission keys'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(_changes) LOOP
  desired := item->>'mode';
  IF coalesce(item->>'permission_key','')='' OR length(item->>'permission_key')>200 OR (desired IS NOT NULL AND desired NOT IN ('allow','deny')) THEN RAISE EXCEPTION 'Invalid permission'; END IF;
  SELECT * INTO current_row FROM public.user_permission_overrides_v2 WHERE user_account_id=_account AND permission_key=item->>'permission_key' FOR UPDATE;
  IF FOUND THEN
   IF current_row.scope_company_id IS DISTINCT FROM _company OR current_row.scope_department_id IS NOT NULL THEN RAISE EXCEPTION 'Permission exists in a different scope; edit original scope'; END IF;
   IF desired IS NOT NULL AND current_row.mode=desired THEN CONTINUE; END IF;
   IF item->'expected'->>'mode' IS DISTINCT FROM current_row.mode THEN RAISE EXCEPTION 'Permissions changed; reload before saving'; END IF;
  ELSIF item->'expected' IS NOT NULL AND item->'expected'<>'null'::jsonb AND desired IS NOT NULL THEN RAISE EXCEPTION 'Permissions changed; reload before saving';
  END IF;
  IF desired IS NULL THEN
   DELETE FROM public.user_permission_overrides_v2 WHERE user_account_id=_account AND permission_key=item->>'permission_key' AND scope_company_id IS NOT DISTINCT FROM _company;
  ELSE
   INSERT INTO public.user_permission_overrides_v2(user_account_id,permission_key,mode,scope_company_id) VALUES(_account,item->>'permission_key',desired,_company)
   ON CONFLICT(user_account_id,permission_key) DO UPDATE SET mode=excluded.mode;
  END IF;
  DELETE FROM public.user_permission_overrides WHERE user_id=login_id AND permission_key=item->>'permission_key';
  IF _company IS NULL AND desired IS NOT NULL THEN
   INSERT INTO public.user_permission_overrides(user_id,permission_key,allowed) VALUES(login_id,item->>'permission_key',desired='allow') ON CONFLICT(user_id,permission_key) DO UPDATE SET allowed=excluded.allowed;
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.save_permission_override_changes(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_permission_override_changes(uuid,uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.read_my_assigned_job(_event uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('event',jsonb_build_object('id',e.id,'title',e.title,'job_number',e.job_number,'internal_number',e.internal_number,'status',e.status,'start_time',e.start_time,'end_time',e.end_time,'address',e.address,'postal_code',e.postal_code,'city',e.city,'customer',e.customer,'site_contact_name',e.site_contact_name,'site_contact_phone',e.site_contact_phone,'description',e.description,'access_notes',e.access_notes,'location_details',e.location_details,'source_order_form_id',e.source_order_form_id,'attachments',e.attachments),'assignment',jsonb_build_object('start_at',et.start_at,'end_at',et.end_at))
 FROM public.events e JOIN public.event_technicians et ON et.event_id=e.id JOIN public.technicians t ON t.id=et.technician_id JOIN public.user_accounts a ON a.auth_user_id=t.user_id AND a.is_active
 WHERE e.id=_event AND e.deleted_at IS NULL AND a.auth_user_id=auth.uid() AND public.is_employee_of(auth.uid(),e.company_id) LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.read_my_assigned_job(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_my_assigned_job(uuid) TO authenticated;