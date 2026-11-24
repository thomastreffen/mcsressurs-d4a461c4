alter table public.contract_watch_scan_runs
  add column if not exists heartbeat_at timestamptz,
  add column if not exists lease_until timestamptz,
  add column if not exists total_batches integer,
  add column if not exists done_batches integer not null default 0,
  add column if not exists failed_batches integer not null default 0;

-- Work list for resumable historical tests: only Graph message IDs (no subject, address or text).
create table if not exists public.contract_watch_scan_batches (
  run_id uuid not null references public.contract_watch_scan_runs(id) on delete cascade,
  idx integer not null,
  threads jsonb not null,
  status text not null default 'pending' check (status in ('pending','done','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  error_code text,
  updated_at timestamptz not null default now(),
  primary key (run_id, idx)
);
alter table public.contract_watch_scan_batches enable row level security;
revoke all on public.contract_watch_scan_batches from anon, authenticated;
grant all on public.contract_watch_scan_batches to service_role;