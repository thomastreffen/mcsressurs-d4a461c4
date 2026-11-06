CREATE OR REPLACE FUNCTION public.notify_new_order_submission()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid; v_title text; v_msg text; v_link text; v_who text; v_summary_text text;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  BEGIN
    v_who := COALESCE(NULLIF(NEW.submitter_name, ''), NULLIF(NEW.submitter_email, ''), 'Ukjent avsender');
    IF NEW.summary IS NOT NULL AND jsonb_typeof(NEW.summary) = 'object' THEN
      v_summary_text := COALESCE(NULLIF(NEW.summary ->> 'oppdragstittel', ''), NULLIF(NEW.summary ->> 'firmanavn', ''),
        NULLIF(NEW.summary ->> 'kundenavn', ''), NULLIF(NEW.summary ->> 'bestiller_navn', ''));
    ELSIF NEW.summary IS NOT NULL AND jsonb_typeof(NEW.summary) IN ('string', 'number', 'boolean') THEN
      v_summary_text := NULLIF(btrim(NEW.summary #>> '{}'), '');
    END IF;
    v_title := COALESCE(v_summary_text, 'Ny servicebestilling fra ' || v_who);
    v_msg := 'Ny servicebestilling: ' || v_who || COALESCE(' · ' || NEW.priority, '');
    v_link := '/orders/' || NEW.id::text;

    -- Only designated intake recipients for this company (superadmin fallback when empty)
    FOR v_admin IN SELECT DISTINCT r FROM public.order_intake_recipients(NEW.company_id) r WHERE r IS NOT NULL LOOP
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM public.notifications n WHERE n.user_id = v_admin AND n.type = 'new_order' AND n.entity_id = NEW.id) THEN
          INSERT INTO public.notifications (user_id, type, title, message, link_url, priority, entity_type, entity_id, company_id)
          VALUES (v_admin, 'new_order', v_title, v_msg, v_link, 'important', 'order_submission', NEW.id, NEW.company_id);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        BEGIN
          INSERT INTO public.order_form_activity_log (submission_id, event_type, payload)
          VALUES (NEW.id, 'notification_failed', jsonb_build_object('notification_type', 'intake_notification',
            'admin_user_id', v_admin, 'error', SQLERRM, 'sqlstate', SQLSTATE, 'submission_id', NEW.id));
        EXCEPTION WHEN OTHERS THEN NULL; END;
      END;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.order_form_activity_log (submission_id, event_type, payload)
      VALUES (NEW.id, 'notification_failed', jsonb_build_object('notification_type', 'new_order_submission_trigger',
        'error', SQLERRM, 'sqlstate', SQLSTATE, 'submission_id', NEW.id));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END;
  RETURN NEW;
END;
$function$;