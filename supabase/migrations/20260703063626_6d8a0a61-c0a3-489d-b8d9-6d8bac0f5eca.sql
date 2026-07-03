CREATE OR REPLACE FUNCTION public.sweep_orphan_schedule_blocks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _unlinked int := 0;
  _ghost_deleted int := 0;
  _ghost_step int := 0;
BEGIN
  -- (A) Soft-delete blocks whose job_id points to a deleted/missing event.
  WITH ghost_jobs AS (
    SELECT sb.id
    FROM schedule_blocks sb
    LEFT JOIN events e ON e.id = sb.job_id
    WHERE sb.job_id IS NOT NULL
      AND sb.deleted_at IS NULL
      AND (e.id IS NULL OR e.deleted_at IS NOT NULL)
  )
  UPDATE schedule_blocks sb
  SET deleted_at = now(),
      deleted_reason = 'ghost_orphan_job',
      updated_at = now()
  FROM ghost_jobs g
  WHERE sb.id = g.id;
  GET DIAGNOSTICS _ghost_step = ROW_COUNT;
  _ghost_deleted := _ghost_deleted + _ghost_step;

  -- (B) Soft-delete blocks whose project_id is dead AND no valid job to fall back to.
  WITH ghost_projects AS (
    SELECT sb.id
    FROM schedule_blocks sb
    LEFT JOIN events pe ON pe.id = sb.project_id
    LEFT JOIN events je ON je.id = sb.job_id AND je.deleted_at IS NULL
    WHERE sb.project_id IS NOT NULL
      AND sb.deleted_at IS NULL
      AND (pe.id IS NULL OR pe.deleted_at IS NOT NULL)
      AND je.id IS NULL
  )
  UPDATE schedule_blocks sb
  SET deleted_at = now(),
      deleted_reason = COALESCE(sb.deleted_reason, 'ghost_orphan_project'),
      updated_at = now()
  FROM ghost_projects g
  WHERE sb.id = g.id;
  GET DIAGNOSTICS _ghost_step = ROW_COUNT;
  _ghost_deleted := _ghost_deleted + _ghost_step;

  -- (C) Unlink project_id for surviving blocks where project is dead but job is valid.
  WITH orphans AS (
    SELECT sb.id
    FROM schedule_blocks sb
    LEFT JOIN events e ON e.id = sb.project_id AND e.deleted_at IS NULL
    WHERE sb.project_id IS NOT NULL
      AND sb.deleted_at IS NULL
      AND e.id IS NULL
  )
  UPDATE schedule_blocks sb
  SET project_id = NULL,
      match_state = 'external',
      match_reason = 'Auto-renset: prosjekt slettet',
      title = COALESCE(sb.outlook_subject, sb.title, 'Ekstern blokk'),
      updated_at = now()
  FROM orphans o
  WHERE sb.id = o.id;
  GET DIAGNOSTICS _unlinked = ROW_COUNT;

  RETURN jsonb_build_object('unlinked', _unlinked, 'ghost_deleted', _ghost_deleted);
END;
$function$;

-- Run cleanup immediately to purge existing ghost cards.
SELECT public.sweep_orphan_schedule_blocks();