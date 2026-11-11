ALTER TABLE public.hub_outlook_sync_settings ADD COLUMN inbound_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.hub_outlook_event_links ADD COLUMN outlook_snapshot jsonb;
ALTER TABLE public.hub_outlook_event_links ADD COLUMN conflict_reason text;

-- Company-scoped read of Hub<->Outlook appointment link status for resource planners.
CREATE OR REPLACE FUNCTION public.hub_outlook_link_status(_company_ids uuid[])
RETURNS TABLE(link_id uuid, task_id uuid, task_title text, mailbox text, state text, conflict_reason text, last_error text, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT l.id, l.task_id, t.title, l.mailbox, l.state, l.conflict_reason, l.last_error, l.updated_at
  FROM public.hub_outlook_event_links l
  JOIN public.tasks t ON t.id = l.task_id
  WHERE l.company_id IN (
    SELECT DISTINCT r.company_id FROM public.resource_plan_personnel(_company_ids) r
  )
  ORDER BY l.updated_at DESC
$$;
REVOKE ALL ON FUNCTION public.hub_outlook_link_status(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hub_outlook_link_status(uuid[]) TO authenticated;

-- Resolve a sync conflict explicitly. keep_hub re-queues an outbound push; keep_outlook adopts the
-- stored Outlook snapshot into the Hub task. Never touches project jobs, customers, economy or docs.
CREATE OR REPLACE FUNCTION public.resolve_hub_outlook_conflict(p_link_id uuid, p_resolution text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  l public.hub_outlook_event_links%ROWTYPE;
  snap jsonb;
BEGIN
  SELECT * INTO l FROM public.hub_outlook_event_links WHERE id = p_link_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF NOT public.has_company_access(auth.uid(), l.company_id, 'resource_plan', 'edit') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF l.state <> 'conflict' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_conflict');
  END IF;
  IF p_resolution = 'keep_hub' THEN
    UPDATE public.hub_outlook_event_links
      SET state = 'pending', conflict_reason = NULL, outlook_snapshot = NULL, updated_at = now()
      WHERE id = l.id;
    INSERT INTO public.hub_outlook_sync_log (link_id, company_id, task_id, mailbox, direction, action, dry_run, detail)
      VALUES (l.id, l.company_id, l.task_id, l.mailbox, 'inbound', 'resolved_keep_hub', false, jsonb_build_object('by', auth.uid()));
    RETURN jsonb_build_object('ok', true, 'resolution', 'keep_hub');
  ELSIF p_resolution = 'keep_outlook' THEN
    snap := l.outlook_snapshot;
    IF snap IS NULL OR snap->>'start_at' IS NULL OR snap->>'end_at' IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'missing_snapshot');
    END IF;
    UPDATE public.tasks
      SET title = snap->>'title',
          planned_start_at = (snap->>'start_at')::timestamptz,
          planned_end_at = (snap->>'end_at')::timestamptz,
          updated_at = now()
      WHERE id = l.task_id AND company_id = l.company_id;
    UPDATE public.hub_outlook_event_links
      SET state = 'synced', conflict_reason = NULL, hub_version = snap->>'hub_fingerprint',
          outlook_change_key = snap->>'change_key', outlook_snapshot = NULL, updated_at = now()
      WHERE id = l.id;
    INSERT INTO public.hub_outlook_sync_log (link_id, company_id, task_id, mailbox, direction, action, dry_run, detail)
      VALUES (l.id, l.company_id, l.task_id, l.mailbox, 'inbound', 'resolved_keep_outlook', false, jsonb_build_object('by', auth.uid()));
    RETURN jsonb_build_object('ok', true, 'resolution', 'keep_outlook');
  END IF;
  RETURN jsonb_build_object('ok', false, 'error', 'unknown_resolution');
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_hub_outlook_conflict(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_hub_outlook_conflict(uuid, text) TO authenticated;

-- Superadmin-only pilot configuration for the Hub appointment sync (both directions).
CREATE OR REPLACE FUNCTION public.set_hub_outlook_sync_settings(p_enabled boolean, p_dry_run boolean, p_inbound_enabled boolean, p_pilot_mailboxes text[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_global_superadmin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  UPDATE public.hub_outlook_sync_settings
    SET enabled = p_enabled, dry_run = p_dry_run, inbound_enabled = p_inbound_enabled,
        pilot_mailboxes = COALESCE(p_pilot_mailboxes, '{}'), updated_at = now(), updated_by = auth.uid()
    WHERE id = true;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.set_hub_outlook_sync_settings(boolean, boolean, boolean, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_hub_outlook_sync_settings(boolean, boolean, boolean, text[]) TO authenticated;