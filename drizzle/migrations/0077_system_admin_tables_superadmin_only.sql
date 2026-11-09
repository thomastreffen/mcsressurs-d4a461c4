-- Global system-administration tables: only global superadmin (legacy admin/admin.manage_users no longer qualify).
-- Rollback: replace public.has_role(auth.uid(),'super_admin'::app_role) with is_admin() in these 6 policies.
ALTER POLICY "Admins can manage cron runs" ON public.contract_cron_runs USING (public.has_role(auth.uid(),'super_admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'super_admin'::app_role));
ALTER POLICY "Admins view tenant_settings" ON public.tenant_settings USING (public.has_role(auth.uid(),'super_admin'::app_role));
ALTER POLICY "Admins can manage tenant_settings" ON public.tenant_settings USING (public.has_role(auth.uid(),'super_admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'super_admin'::app_role));
ALTER POLICY "Admins can read audit_log" ON public.audit_log USING (public.has_role(auth.uid(),'super_admin'::app_role));
ALTER POLICY "Admins can manage import_logs" ON public.import_logs USING (public.has_role(auth.uid(),'super_admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'super_admin'::app_role));
ALTER POLICY "Admins can manage import_results" ON public.import_results USING (public.has_role(auth.uid(),'super_admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'super_admin'::app_role));