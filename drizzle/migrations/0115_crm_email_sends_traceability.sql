ALTER TABLE public.crm_email_sends
 ADD COLUMN IF NOT EXISTS contact_ids uuid[] NOT NULL DEFAULT '{}',
 ADD COLUMN IF NOT EXISTS body_text text,
 ADD COLUMN IF NOT EXISTS graph_message_id text,
 ADD COLUMN IF NOT EXISTS graph_conversation_id text,
 ADD COLUMN IF NOT EXISTS status_history jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.crm_email_sends DROP CONSTRAINT IF EXISTS crm_email_sends_status_check;
ALTER TABLE public.crm_email_sends ADD CONSTRAINT crm_email_sends_status_check CHECK (status IN ('claimed','accepted','failed','uncertain','not_sent'));