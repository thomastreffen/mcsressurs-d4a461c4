ALTER TABLE public.schedule_blocks
  ADD COLUMN IF NOT EXISTS outlook_response_status text,
  ADD COLUMN IF NOT EXISTS is_organizer boolean;
COMMENT ON COLUMN public.schedule_blocks.outlook_response_status IS 'Calendar owner response to the Outlook invite (none/organizer/accepted/tentativelyAccepted/declined/notResponded). Not accepted = not confirmed planned.';