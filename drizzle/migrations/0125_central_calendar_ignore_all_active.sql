CREATE OR REPLACE FUNCTION public.central_calendar_mailbox_active(_company uuid, _tech uuid, _mailbox text, _day date, _changed timestamp with time zone)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
 SELECT _tech NOT IN ('ebc15ac7-fd4c-461d-a61c-06b97d705cc0','ba707f5e-0a7d-40b8-95f2-896d1c4c01c2') AND EXISTS(SELECT 1 FROM public.central_calendar_activations a WHERE a.company_id=_company AND a.revoked_at IS NULL
  AND a.scope='single' AND a.technician_id=_tech AND a.mailbox=_mailbox
  AND _day >= (a.effective_from AT TIME ZONE 'Europe/Oslo')::date AND (_changed IS NULL OR _changed >= a.effective_from))
$function$;