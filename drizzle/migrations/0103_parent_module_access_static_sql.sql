CREATE OR REPLACE FUNCTION public.parent_module_access(_uid uuid, _parent text, _id uuid, _module text, _level text DEFAULT 'view'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE co uuid;
BEGIN
  CASE _parent
    WHEN 'hms_handbook_versions' THEN SELECT company_id INTO co FROM public.hms_handbook_versions WHERE id=_id;
    WHEN 'hms_submissions' THEN SELECT company_id INTO co FROM public.hms_submissions WHERE id=_id;
    WHEN 'hms_templates' THEN SELECT company_id INTO co FROM public.hms_templates WHERE id=_id;
    WHEN 'calculations' THEN SELECT company_id INTO co FROM public.calculations WHERE id=_id;
    WHEN 'customers' THEN SELECT company_id INTO co FROM public.customers WHERE id=_id;
    WHEN 'customer_contacts' THEN SELECT c.company_id INTO co FROM public.customer_contacts cc JOIN public.customers c ON c.id=cc.customer_id WHERE cc.id=_id;
    WHEN 'planning_projects' THEN SELECT company_id INTO co FROM public.planning_projects WHERE id=_id;
    ELSE RETURN false;
  END CASE;
  IF co IS NULL THEN RETURN false; END IF;
  RETURN public.has_company_access(_uid,co,_module,_level);
END $function$;