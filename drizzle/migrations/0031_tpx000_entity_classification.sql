ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'unclassified',
  ADD COLUMN IF NOT EXISTS is_framework_project boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS classification_status text NOT NULL DEFAULT 'needs_review',
  ADD COLUMN IF NOT EXISTS classification_reason text,
  ADD COLUMN IF NOT EXISTS classified_by uuid,
  ADD COLUMN IF NOT EXISTS classified_at timestamptz;

ALTER TABLE public.events ADD CONSTRAINT events_entity_type_chk
  CHECK (entity_type IN ('financial_project','job','service','internal','unclassified'));
ALTER TABLE public.events ADD CONSTRAINT events_classification_status_chk
  CHECK (classification_status IN ('auto','confirmed','needs_review'));

ALTER TABLE public.planning_projects ADD COLUMN IF NOT EXISTS financial_project_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS events_entity_type_idx ON public.events(entity_type) WHERE deleted_at IS NULL;

-- Server-side model rules (TPX-000)
CREATE OR REPLACE FUNCTION public.enforce_event_entity_rules()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  IF NEW.external_tripletex_id IS NOT NULL AND NEW.entity_type IN ('job','service','internal')
     AND (TG_OP = 'INSERT' OR NEW.external_tripletex_id IS DISTINCT FROM OLD.external_tripletex_id OR NEW.entity_type IS DISTINCT FROM OLD.entity_type) THEN
    RAISE EXCEPTION 'Kun økonomiske prosjekter kan kobles til Tripletex';
  END IF;
  IF NEW.entity_type = 'financial_project' AND NEW.parent_project_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.entity_type IS DISTINCT FROM OLD.entity_type OR NEW.parent_project_id IS DISTINCT FROM OLD.parent_project_id) THEN
    RAISE EXCEPTION 'Et økonomisk prosjekt kan ikke ligge under et annet prosjekt';
  END IF;
  IF NEW.parent_project_id IS NOT NULL AND NEW.entity_type IN ('job','service')
     AND (TG_OP = 'INSERT' OR NEW.parent_project_id IS DISTINCT FROM OLD.parent_project_id OR NEW.entity_type IS DISTINCT FROM OLD.entity_type) THEN
    SELECT entity_type, company_id INTO p FROM public.events WHERE id = NEW.parent_project_id;
    IF p.entity_type IS DISTINCT FROM 'financial_project' THEN
      RAISE EXCEPTION 'Jobb/serviceoppdrag må ligge under et økonomisk prosjekt';
    END IF;
    IF p.company_id IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Overordnet prosjekt må tilhøre samme selskap';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_event_entity_rules ON public.events;
CREATE TRIGGER trg_enforce_event_entity_rules BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_entity_rules();

CREATE OR REPLACE FUNCTION public.enforce_tripletex_mapping_entity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE id = NEW.mcs_project_id AND entity_type IN ('job','service','internal')) THEN
    RAISE EXCEPTION 'Kun økonomiske prosjekter kan kobles til Tripletex';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_tripletex_mapping_entity ON public.tripletex_project_mappings;
CREATE TRIGGER trg_enforce_tripletex_mapping_entity BEFORE INSERT OR UPDATE ON public.tripletex_project_mappings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tripletex_mapping_entity();

-- Backfill suggestions (no deletes, no moves)
UPDATE public.events e SET entity_type='financial_project', classification_status='auto',
  classification_reason='Har prosjektnummer eller Tripletex-kobling', classified_at=now()
WHERE e.deleted_at IS NULL AND (e.project_number IS NOT NULL OR e.external_tripletex_id IS NOT NULL
  OR EXISTS (SELECT 1 FROM public.tripletex_project_mappings m WHERE m.mcs_project_id=e.id));

UPDATE public.events e SET entity_type='financial_project', classification_status='needs_review',
  classification_reason='Har underjobber, men mangler prosjektnummer', classified_at=now()
WHERE e.deleted_at IS NULL AND e.entity_type='unclassified' AND e.parent_project_id IS NULL
  AND EXISTS (SELECT 1 FROM public.events c WHERE c.parent_project_id=e.id AND c.deleted_at IS NULL);

UPDATE public.events e SET entity_type='job', classification_status='auto',
  classification_reason='Oppgave under prosjekt', classified_at=now()
WHERE e.deleted_at IS NULL AND e.entity_type='unclassified' AND e.parent_project_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.events p WHERE p.id=e.parent_project_id AND p.entity_type='financial_project');

UPDATE public.events e SET entity_type='service', classification_status='auto',
  classification_reason='Serviceoppdrag – venter på rammeprosjekt', classified_at=now()
WHERE e.deleted_at IS NULL AND e.entity_type='unclassified' AND e.project_type='service';

UPDATE public.events SET classification_reason='Uklart: prosjekt uten nummer, kunde-ID eller underjobber'
WHERE deleted_at IS NULL AND entity_type='unclassified' AND classification_reason IS NULL;