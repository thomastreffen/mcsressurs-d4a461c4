CREATE OR REPLACE FUNCTION public.is_hms_submission_participant(_submission_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.hms_submission_participants WHERE submission_id = _submission_id AND user_id = _user_id) $$;
REVOKE ALL ON FUNCTION public.is_hms_submission_participant(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_hms_submission_participant(uuid,uuid) TO authenticated, service_role;
ALTER POLICY hms_submissions_select ON public.hms_submissions USING (
 deleted_at IS NULL AND (
 public.has_hms_view(auth.uid(), company_id) OR submitted_by = auth.uid() OR public.is_hms_submission_participant(id, auth.uid())
 )
);
COMMENT ON FUNCTION public.is_hms_submission_participant(uuid,uuid) IS 'Breaks submission/participant RLS recursion without changing module restrictions or participation semantics.';