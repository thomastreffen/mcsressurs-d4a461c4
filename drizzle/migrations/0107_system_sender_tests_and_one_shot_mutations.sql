CREATE TABLE public.system_sender_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor uuid NOT NULL,
  recipient text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  outcome text CHECK (outcome IN ('accepted','failed','uncertain','blocked')),
  http_status integer,
  finished_at timestamptz
);
-- At most one open (unfinished) test send per actor; never replayed.
CREATE UNIQUE INDEX system_sender_test_runs_one_open ON public.system_sender_test_runs(actor) WHERE finished_at IS NULL;
ALTER TABLE public.system_sender_test_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_sender_test_runs FROM anon, authenticated;
GRANT ALL ON public.system_sender_test_runs TO service_role;

CREATE TABLE public.job_calendar_one_shot_mutations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.job_calendar_one_shot_runs(id),
  kind text NOT NULL CHECK (kind IN ('update','delete')),
  actor uuid NOT NULL,
  graph_event_id text NOT NULL,
  if_match text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  outcome text,
  http_status integer,
  new_change_key text,
  finished_at timestamptz
);
-- One claim per (copy, kind, version): a write can never be repeated for the same changeKey.
CREATE UNIQUE INDEX job_calendar_one_shot_mutations_once ON public.job_calendar_one_shot_mutations(run_id, kind, if_match);
-- Delete is final per copy.
CREATE UNIQUE INDEX job_calendar_one_shot_mutations_delete_once ON public.job_calendar_one_shot_mutations(run_id) WHERE kind = 'delete';
ALTER TABLE public.job_calendar_one_shot_mutations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_calendar_one_shot_mutations FROM anon, authenticated;
GRANT ALL ON public.job_calendar_one_shot_mutations TO service_role;