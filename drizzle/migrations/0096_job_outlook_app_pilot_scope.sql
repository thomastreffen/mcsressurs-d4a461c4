-- Exact pilot targets (mailbox + job + technician + Oslo work date). Default deny: no rows = nothing writable.
create table public.job_outlook_app_pilot_targets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  event_id uuid not null,
  technician_id uuid not null,
  mailbox text not null,
  work_date date not null,
  note text,
  approved_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid
);
create unique index job_outlook_app_pilot_targets_active_uq
  on public.job_outlook_app_pilot_targets (event_id, technician_id, work_date) where revoked_at is null;
alter table public.job_outlook_app_pilot_targets enable row level security;
revoke all on public.job_outlook_app_pilot_targets from anon, authenticated;
grant all on public.job_outlook_app_pilot_targets to service_role;

-- Append-only audit of pilot admin actions (no tokens, secrets or calendar content).
create table public.job_outlook_app_pilot_actions (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  actor uuid not null,
  target_id uuid,
  queue_id uuid,
  idempotency_key text,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index job_outlook_app_pilot_actions_idem_uq
  on public.job_outlook_app_pilot_actions (action, idempotency_key) where idempotency_key is not null;
alter table public.job_outlook_app_pilot_actions enable row level security;
revoke all on public.job_outlook_app_pilot_actions from anon, authenticated;
grant all on public.job_outlook_app_pilot_actions to service_role;

-- Per-day app links (one Outlook event per job/technician/work date) and legacy adoption marker.
alter table public.job_outlook_app_links add column work_date date;
alter table public.job_outlook_app_links add column adopted_from_day_link_id uuid;

-- Queue intents are held until an explicit admin release. Existing rows have released_at = null => held.
alter table public.job_outlook_app_queue add column released_at timestamptz;
alter table public.job_outlook_app_queue add column released_by uuid;
alter table public.job_outlook_app_queue add column release_key text;
create unique index job_outlook_app_queue_release_key_uq on public.job_outlook_app_queue (release_key) where release_key is not null;