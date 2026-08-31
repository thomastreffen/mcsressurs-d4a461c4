CREATE OR REPLACE FUNCTION public.sync_schedule_blocks_for_event_time_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (OLD.start_time IS DISTINCT FROM NEW.start_time) OR (OLD.end_time IS DISTINCT FROM NEW.end_time) THEN
    -- A date/time edit in the task drawer moves the whole work visit. Preserve
    -- any per-technician staggering by shifting overrides by the same delta.
    UPDATE public.event_technicians
    SET start_at = CASE
          WHEN start_at IS NULL OR OLD.start_time IS NULL OR NEW.start_time IS NULL THEN start_at
          ELSE start_at + (NEW.start_time - OLD.start_time)
        END,
        end_at = CASE
          WHEN end_at IS NULL OR OLD.end_time IS NULL OR NEW.end_time IS NULL THEN end_at
          ELSE end_at + (NEW.end_time - OLD.end_time)
        END
    WHERE event_id = NEW.id;

    -- The resource plan renders schedule_blocks as its source of truth. Update
    -- every active internal block, not only assignments without overrides.
    UPDATE public.schedule_blocks sb
    SET start_at = COALESCE(et.start_at, NEW.start_time),
        end_at = COALESCE(et.end_at, NEW.end_time),
        updated_at = now()
    FROM public.event_technicians et
    WHERE et.event_id = NEW.id
      AND et.technician_id = sb.technician_id
      AND (sb.project_id = NEW.id OR sb.job_id = NEW.id)
      AND sb.source IN ('manual', 'system')
      AND sb.deleted_at IS NULL;
  END IF;

  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    UPDATE public.schedule_blocks
    SET deleted_at = now(),
        deleted_reason = 'event soft-deleted',
        updated_at = now()
    WHERE (project_id = NEW.id OR job_id = NEW.id)
      AND source IN ('manual', 'system')
      AND deleted_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_schedule_blocks_for_event_time_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_schedule_blocks_for_event_time_change() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_schedule_blocks_for_event_time_change() TO service_role;