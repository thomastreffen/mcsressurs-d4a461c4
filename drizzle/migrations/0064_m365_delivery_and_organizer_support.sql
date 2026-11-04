ALTER TABLE public.event_recipient_delivery ADD COLUMN delivery_state text CHECK (delivery_state IN ('pending','accepted_by_graph','verified','failed','awaiting','not_required'));
ALTER TABLE public.event_recipient_delivery ADD COLUMN verification_signal text;
ALTER TABLE public.event_recipient_delivery ADD COLUMN operation_key text;
CREATE TABLE public.m365_organizer_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
 technician_id uuid NOT NULL,
 mailbox text NOT NULL DEFAULT 'postkontoret@mcsservice.no' CHECK (mailbox = 'postkontoret@mcsservice.no'),
 transaction_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 graph_event_id text,
 state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','active','uncertain','deleted','failed')),
 response_status text,
 last_error text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(event_id,technician_id)
);
GRANT SELECT ON public.m365_organizer_links TO authenticated;
GRANT ALL ON public.m365_organizer_links TO service_role;
ALTER TABLE public.m365_organizer_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY organizer_links_visible_events ON public.m365_organizer_links FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id=event_id));
CREATE OR REPLACE FUNCTION public.record_event_delivery(_event uuid,_technician uuid,_channel text,_status text,_state text,_user uuid DEFAULT NULL,_email text DEFAULT NULL,_reason text DEFAULT NULL,_graph integer DEFAULT NULL,_actor uuid DEFAULT NULL,_signal text DEFAULT NULL,_operation text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.event_recipient_delivery(event_id,technician_id,channel,status,delivery_state,technician_user_id,recipient_email,reason_code,graph_status,attempted_by,verification_signal,operation_key,sent_at)
 VALUES(_event,_technician,_channel,_status,_state,_user,_email,_reason,_graph,_actor,_signal,_operation,CASE WHEN _state IN ('accepted_by_graph','verified') THEN now() END)
 ON CONFLICT(event_id,technician_id,channel) DO UPDATE SET status=EXCLUDED.status,delivery_state=EXCLUDED.delivery_state,technician_user_id=EXCLUDED.technician_user_id,recipient_email=EXCLUDED.recipient_email,reason_code=EXCLUDED.reason_code,graph_status=EXCLUDED.graph_status,attempted_by=EXCLUDED.attempted_by,verification_signal=EXCLUDED.verification_signal,operation_key=EXCLUDED.operation_key,last_attempt_at=now(),sent_at=EXCLUDED.sent_at,attempt_count=public.event_recipient_delivery.attempt_count+1;
END; $$;
REVOKE ALL ON FUNCTION public.record_event_delivery(uuid,uuid,text,text,text,uuid,text,text,integer,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_event_delivery(uuid,uuid,text,text,text,uuid,text,text,integer,uuid,text,text) TO service_role;
COMMENT ON TABLE public.m365_organizer_links IS 'New organizer model only; existing individual calendar IDs are never migrated automatically. Activation requires approved mailbox-scoped permissions and pilot recipients.';