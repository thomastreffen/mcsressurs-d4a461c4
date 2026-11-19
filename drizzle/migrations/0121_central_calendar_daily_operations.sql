CREATE TABLE public.job_calendar_daily_operations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_key text NOT NULL UNIQUE,
 company_id uuid NOT NULL, event_id uuid NOT NULL, technician_id uuid NOT NULL,
 mailbox text NOT NULL CHECK(mailbox=lower(btrim(mailbox))), work_date date NOT NULL,
 kind text NOT NULL CHECK(kind IN('create','update','delete')),
 state text NOT NULL DEFAULT 'claimed' CHECK(state IN('claimed','accepted','verified','rejected','uncertain','conflict')),
 graph_event_id text, graph_change_key text, http_status integer,
 payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 UNIQUE(id,event_id,technician_id,mailbox,work_date)
);
GRANT SELECT,INSERT,UPDATE ON public.job_calendar_daily_operations TO service_role;
REVOKE ALL ON public.job_calendar_daily_operations FROM anon,authenticated;
ALTER TABLE public.job_calendar_daily_operations ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX job_calendar_daily_open ON public.job_calendar_daily_operations(event_id,technician_id,mailbox,work_date) WHERE state IN('claimed','uncertain','accepted');
COMMENT ON TABLE public.job_calendar_daily_operations IS 'Durable exact-day claims and GET reconciliation receipts. Never drains legacy queue; unknown operations are not replayed.';