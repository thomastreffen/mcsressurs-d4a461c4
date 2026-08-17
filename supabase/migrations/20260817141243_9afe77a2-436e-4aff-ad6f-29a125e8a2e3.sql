UPDATE public.events
SET deleted_at = NULL, deleted_by = NULL, status = 'scheduled'
WHERE id = '3b5345aa-b169-4388-ac82-da60bdfa71a9';

INSERT INTO public.schedule_blocks (company_id, technician_id, project_id, source, start_at, end_at, title, match_state, match_confidence, match_reason)
SELECT 'a0000000-0000-0000-0000-000000000001', '2a77d580-3e20-42c1-b8ef-b5e97d2dce30', '3b5345aa-b169-4388-ac82-da60bdfa71a9', 'manual',
       '2026-08-20 05:00:00+00', '2026-08-20 06:00:00+00', 'LVB', 'manual', 100, 'Gjenopprettet etter montørbytte'
WHERE NOT EXISTS (
  SELECT 1 FROM public.schedule_blocks
  WHERE project_id = '3b5345aa-b169-4388-ac82-da60bdfa71a9'
    AND technician_id = '2a77d580-3e20-42c1-b8ef-b5e97d2dce30'
    AND deleted_at IS NULL
);