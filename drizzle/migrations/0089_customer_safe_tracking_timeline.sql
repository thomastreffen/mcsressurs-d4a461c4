CREATE OR REPLACE FUNCTION public.get_submission_activity_by_token(_token text)
 RETURNS SETOF order_form_activity_log
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT al.id, al.submission_id, al.event_type,
    CASE WHEN al.event_type = 'status_changed'
      THEN jsonb_build_object('from', al.payload->'from', 'to', al.payload->'to')
      WHEN al.event_type = 'notification_sent'
      THEN jsonb_build_object('type', al.payload->'type', 'event_key', al.payload->'event_key')
      ELSE '{}'::jsonb END,
    NULL::uuid, al.created_at
  FROM public.order_form_activity_log al
  JOIN public.order_form_submissions s ON s.id = al.submission_id
  WHERE s.public_tracking_token = _token AND s.deleted_at IS NULL
    AND al.event_type IN ('submitted','status_changed','missing_info_requested','customer_reply','converted_to_order','notification_sent','task_created','task_rescheduled')
  ORDER BY al.created_at ASC;
$function$;