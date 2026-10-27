ALTER TABLE public.compliance_finding_evidence DROP CONSTRAINT cfe_source_kind_check;
ALTER TABLE public.compliance_finding_evidence ADD CONSTRAINT cfe_source_kind_check CHECK (source_kind IN ('competence_requirement','competence','regulation','org_role','organization_overview','internal_audit','hms_incident','action_item','document','other'));
ALTER TABLE public.compliance_finding_evidence ADD CONSTRAINT cfe_organization_overview_reference CHECK (source_kind <> 'organization_overview' OR (ref_id IS NOT NULL AND ref_id = company_id AND document_id IS NULL AND competence_type_id IS NULL));
CREATE UNIQUE INDEX cfe_one_organization_overview_per_finding ON public.compliance_finding_evidence (inspection_id, finding_id, company_id) NULLS NOT DISTINCT WHERE source_kind = 'organization_overview';
CREATE OR REPLACE FUNCTION public.validate_organization_overview_evidence() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE company_name text; role_count integer;
BEGIN
 IF NEW.source_kind <> 'organization_overview' THEN RETURN NEW; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.compliance_inspections i WHERE i.id = NEW.inspection_id AND i.company_id = NEW.company_id AND i.deleted_at IS NULL) THEN RAISE EXCEPTION 'Organisasjonsoversikten må tilhøre tilsynets selskap'; END IF;
 IF NEW.finding_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.compliance_findings f WHERE f.id = NEW.finding_id AND f.inspection_id = NEW.inspection_id AND f.company_id = NEW.company_id AND f.deleted_at IS NULL) THEN RAISE EXCEPTION 'Funnet må tilhøre tilsynet og samme selskap'; END IF;
 SELECT count(*) INTO role_count FROM public.compliance_org_roles r WHERE r.company_id = NEW.company_id AND r.deleted_at IS NULL AND r.is_active IS NOT FALSE AND (r.valid_from IS NULL OR r.valid_from <= CURRENT_DATE) AND (r.valid_to IS NULL OR r.valid_to >= CURRENT_DATE);
 IF role_count = 0 THEN RAISE EXCEPTION 'Ingen gjeldende aktive roller finnes i organisasjonsregisteret'; END IF;
 SELECT name INTO company_name FROM public.internal_companies WHERE id = NEW.company_id;
 NEW.label := 'Organisasjonsoversikt – ' || company_name;
 IF TG_OP = 'INSERT' THEN NEW.note := role_count || ' aktive roller ved kobling. Dynamisk kilde: Organisasjon & ansvar.' || CASE WHEN nullif(trim(NEW.note), '') IS NULL THEN '' ELSE E'\n' || NEW.note END; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER validate_organization_overview_evidence BEFORE INSERT OR UPDATE ON public.compliance_finding_evidence FOR EACH ROW EXECUTE FUNCTION public.validate_organization_overview_evidence();
COMMENT ON FUNCTION public.validate_organization_overview_evidence() IS 'Validates a dynamic company organization-register reference using existing caller RLS; never copies roles or changes finding status.';