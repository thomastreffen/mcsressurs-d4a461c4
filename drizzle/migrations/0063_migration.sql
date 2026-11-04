-- 1) Allow history entries the code already writes (they were silently rejected)
ALTER TABLE public.event_logs DROP CONSTRAINT IF EXISTS event_logs_action_type_check;
ALTER TABLE public.event_logs ADD CONSTRAINT event_logs_action_type_check CHECK (action_type = ANY (ARRAY[
 'created','updated','cancelled','attendee_added','attendee_removed','technician_assigned','scheduled',
 'work_visit_created','work_visit_repaired','work_visit_existing','work_visit_unplanned','technician_unplanned',
 'outlook_delete_queued','outlook_deleted','outlook_delete_failed','title_changed','customer_changed','time_changed',
 'location_changed','contact_changed','description_changed','assignment_notes_changed','customer_practical_info_changed',
 'technician_assignment_changed','technician_added','technician_removed','attachment_added','attachment_removed',
 'notifications_sent','calendar_sync_requested','calendar_sync_skipped',
 'outlook_created','outlook_updated','outlook_conflict','outlook_disconnected','outlook_restored','outlook_restore_failed','outlook_resynced',
 'time_change','info_update_included','info_update_sent','info_resent','approval_created','status_changed','status_change',
 'technician_time_changed','reminder_sent','manual_reminder','reminders_resumed','calendar_synced','calendar_deleted',
 'conflict_resolved','teams_meeting_created','email_sent','delivery_failed'
]));

-- 2) Per-recipient delivery status (calendar + email), no secrets
CREATE TABLE public.event_recipient_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  technician_id uuid NOT NULL,
  technician_user_id uuid,
  recipient_email text,
  channel text NOT NULL CHECK (channel IN ('calendar','email')),
  status text NOT NULL CHECK (status IN ('pending','sent','failed','skipped')),
  reason_code text,
  graph_status integer,
  detail text,
  attempted_by uuid,
  attempt_count integer NOT NULL DEFAULT 1,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, technician_id, channel)
);
GRANT SELECT ON public.event_recipient_delivery TO authenticated;
GRANT ALL ON public.event_recipient_delivery TO service_role;
ALTER TABLE public.event_recipient_delivery ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View delivery for visible events" ON public.event_recipient_delivery
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_recipient_delivery.event_id));
CREATE INDEX idx_erd_event ON public.event_recipient_delivery(event_id);