CREATE TABLE public.m365_communication_queue (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE, technician_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN ('create','update','delete')), status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','accepted','failed','uncertain')),
 revision integer NOT NULL DEFAULT 1, claimed_revision integer, attempt_count integer NOT NULL DEFAULT 0, reason_code text, updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(event_id,technician_id)
);
GRANT SELECT ON public.m365_communication_queue TO authenticated;
GRANT ALL ON public.m365_communication_queue TO service_role;
ALTER TABLE public.m365_communication_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY communication_queue_visible ON public.m365_communication_queue FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.events e WHERE e.id=event_id));
CREATE OR REPLACE FUNCTION public.enqueue_m365_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ev uuid; tech uuid; op text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.start_at IS NOT DISTINCT FROM OLD.start_at AND NEW.end_at IS NOT DISTINCT FROM OLD.end_at THEN RETURN NEW; END IF;
 ev:=CASE WHEN TG_OP='DELETE' THEN OLD.event_id ELSE NEW.event_id END; tech:=CASE WHEN TG_OP='DELETE' THEN OLD.technician_id ELSE NEW.technician_id END;
 op:=CASE TG_OP WHEN 'DELETE' THEN 'delete' WHEN 'INSERT' THEN 'create' ELSE 'update' END;
 INSERT INTO public.m365_communication_queue(event_id,technician_id,operation) VALUES(ev,tech,op)
 ON CONFLICT(event_id,technician_id) DO UPDATE SET operation=EXCLUDED.operation,status=CASE WHEN public.m365_communication_queue.status='processing' THEN 'processing' ELSE 'pending' END, revision=public.m365_communication_queue.revision+1,updated_at=now();
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;
CREATE TRIGGER enqueue_m365_assignment AFTER INSERT OR DELETE OR UPDATE OF start_at,end_at ON public.event_technicians FOR EACH ROW EXECUTE FUNCTION public.enqueue_m365_assignment();
CREATE OR REPLACE FUNCTION public.enqueue_m365_event_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.m365_communication_queue(event_id,technician_id,operation)
 SELECT NEW.id,a.technician_id,CASE WHEN NEW.deleted_at IS NOT NULL OR NEW.status::text='cancelled' THEN 'delete' ELSE 'update' END FROM public.event_technicians a WHERE a.event_id=NEW.id
 ON CONFLICT(event_id,technician_id) DO UPDATE SET operation=EXCLUDED.operation,status=CASE WHEN public.m365_communication_queue.status='processing' THEN 'processing' ELSE 'pending' END,revision=public.m365_communication_queue.revision+1,updated_at=now();
 RETURN NEW;
END; $$;
CREATE TRIGGER enqueue_m365_event_change AFTER UPDATE OF title,description,start_time,end_time,address,deleted_at,status ON public.events FOR EACH ROW WHEN (OLD.title IS DISTINCT FROM NEW.title OR OLD.description IS DISTINCT FROM NEW.description OR OLD.start_time IS DISTINCT FROM NEW.start_time OR OLD.end_time IS DISTINCT FROM NEW.end_time OR OLD.address IS DISTINCT FROM NEW.address OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at OR (NEW.status::text='cancelled' AND OLD.status IS DISTINCT FROM NEW.status)) EXECUTE FUNCTION public.enqueue_m365_event_change();
REVOKE ALL ON FUNCTION public.enqueue_m365_assignment(),public.enqueue_m365_event_change() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_m365_assignment(),public.enqueue_m365_event_change() TO service_role;
COMMENT ON TABLE public.m365_communication_queue IS 'Durable intent only, never sends from triggers. Bounded explicit pilot dispatch; no scheduled sender enabled.';