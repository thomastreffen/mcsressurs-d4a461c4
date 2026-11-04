-- Same role may be held per company scope; one global (NULL scope) row per role. Existing rows all satisfy this.
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_v2_account_role_scope_key
  ON public.user_roles_v2 (user_account_id, role_id, COALESCE(scope_company_id, '00000000-0000-0000-0000-000000000000'::uuid));
ALTER TABLE public.user_roles_v2 DROP CONSTRAINT IF EXISTS user_roles_v2_user_account_id_role_id_key;