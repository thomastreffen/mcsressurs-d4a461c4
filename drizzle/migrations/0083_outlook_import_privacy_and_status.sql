ALTER TABLE public.schedule_blocks
  ADD COLUMN IF NOT EXISTS outlook_sensitivity text,
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS outlook_ical_uid text,
  ADD COLUMN IF NOT EXISTS outlook_show_as text,
  ADD COLUMN IF NOT EXISTS is_all_day boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS outlook_series_master_id text;
COMMENT ON COLUMN public.schedule_blocks.is_private IS 'Outlook private/personal/confidential: only busy time is stored; subject/body/location/organizer are never imported.';
ALTER TABLE public.schedule_sync_state
  ADD COLUMN IF NOT EXISTS last_status text,
  ADD COLUMN IF NOT EXISTS last_error_code text,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS privacy_version integer NOT NULL DEFAULT 1;