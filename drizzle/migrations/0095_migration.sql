create table public.hub_calendar_write_pilot_runs (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  run_by uuid not null,
  mailbox text not null check (mailbox = 'test-kalender@mcsservice.no'),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  overall text not null default 'running' check (overall in ('running','pass','fail','blocked')),
  graph_event_id text,
  cleanup_state text not null default 'none' check (cleanup_state in ('none','deleted','pending','failed')),
  steps jsonb not null default '[]'::jsonb
);
alter table public.hub_calendar_write_pilot_runs enable row level security;
revoke all on public.hub_calendar_write_pilot_runs from anon, authenticated;
grant all on public.hub_calendar_write_pilot_runs to service_role;
comment on table public.hub_calendar_write_pilot_runs is 'Audit for admin-only synthetic write pilot on the test mailbox only. Service-role access only; graph_event_id is kept for cleanup and never returned to clients.';