CREATE OR REPLACE FUNCTION public.hms_risk_integrity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.probability IS DISTINCT FROM OLD.probability OR NEW.consequence IS DISTINCT FROM OLD.consequence THEN RAISE EXCEPTION 'Opprinnelig risiko og selskap er historisk låst'; END IF;
 END IF;
 IF NEW.probability NOT BETWEEN 1 AND 5 OR NEW.consequence NOT BETWEEN 1 AND 5 OR (NEW.rest_sannsynlighet IS NOT NULL AND NEW.rest_sannsynlighet NOT BETWEEN 1 AND 5) OR (NEW.rest_konsekvens IS NOT NULL AND NEW.rest_konsekvens NOT BETWEEN 1 AND 5) THEN RAISE EXCEPTION 'Risiko må være mellom 1 og 5'; END IF;
 IF NEW.status NOT IN ('active','mitigated','closed') THEN RAISE EXCEPTION 'Ugyldig risikostatus'; END IF;
 IF TG_OP='INSERT' AND NEW.status<>'active' THEN RAISE EXCEPTION 'Ny risiko opprettes som aktiv før rest-risikovurdering'; END IF;
 IF TG_OP='UPDATE' AND (NEW.rest_sannsynlighet IS DISTINCT FROM OLD.rest_sannsynlighet OR NEW.rest_konsekvens IS DISTINCT FROM OLD.rest_konsekvens OR NEW.residual_reviewed_at IS DISTINCT FROM OLD.residual_reviewed_at OR NEW.status IS DISTINCT FROM OLD.status OR (OLD.residual_review_required AND NOT NEW.residual_review_required)) THEN
  IF NEW.residual_reviewed_at IS NULL OR NEW.rest_sannsynlighet IS NULL OR NEW.rest_konsekvens IS NULL OR length(trim(coalesce(NEW.residual_comment,'')))=0 THEN RAISE EXCEPTION 'Dokumenter eksplisitt rest-risikovurdering'; END IF;
  IF NOT public.has_company_access(auth.uid(),NEW.company_id,'hms','edit') OR (NEW.responsible_user_id IS NOT NULL AND NEW.responsible_user_id<>auth.uid() AND NOT public.is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'Ansvarlig må vurdere rest-risiko'; END IF;
  NEW.residual_reviewed_by:=auth.uid(); NEW.residual_reviewed_at:=now(); NEW.residual_review_required:=false;
 END IF;
 IF NEW.status IN ('mitigated','closed') AND (NEW.rest_sannsynlighet IS NULL OR NEW.rest_konsekvens IS NULL) THEN RAISE EXCEPTION 'Rest-risiko må vurderes eksplisitt før Redusert/Lukket'; END IF;
 RETURN NEW;
END $$;