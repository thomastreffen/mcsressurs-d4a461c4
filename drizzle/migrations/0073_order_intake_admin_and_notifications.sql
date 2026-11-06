INSERT INTO public.permissions (key, module, description)
SELECT 'orders.intake', 'orders', 'Administrere innkommende bestillinger'
WHERE NOT EXISTS (SELECT 1 FROM public.permissions WHERE key = 'orders.intake');

CREATE TABLE public.order_notification_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_account_id uuid NOT NULL REFERENCES public.user_accounts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.internal_companies(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_account_id, company_id)
);
GRANT SELECT ON public.order_notification_subscriptions TO authenticated;
GRANT ALL ON public.order_notification_subscriptions TO service_role;
ALTER TABLE public.order_notification_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmin reads order subscriptions" ON public.order_notification_subscriptions
  FOR SELECT TO authenticated USING (public.is_global_superadmin(auth.uid()));

-- Who may administer intake in a company (server truth)
CREATE OR REPLACE FUNCTION public.has_order_intake(_user_account_id uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_accounts ua
    WHERE ua.id = _user_account_id AND ua.is_active AND ua.auth_user_id IS NOT NULL
      AND (
        public.is_global_superadmin(ua.auth_user_id)
        OR (
          EXISTS (SELECT 1 FROM public.user_permission_overrides_v2 o
                  WHERE o.user_account_id = ua.id AND o.permission_key = 'orders.intake'
                    AND o.mode = 'allow' AND o.scope_company_id = _company_id)
          AND EXISTS (SELECT 1 FROM public.user_memberships m
                      WHERE m.user_id = ua.auth_user_id AND m.company_id = _company_id AND m.is_active)
        )
      )
  )
$$;

-- Recipients for "new order" Hub notification; superadmin fallback when empty
CREATE OR REPLACE FUNCTION public.order_intake_recipients(_company_id uuid)
RETURNS SETOF uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    SELECT DISTINCT ua.auth_user_id
    FROM public.order_notification_subscriptions s
    JOIN public.user_accounts ua ON ua.id = s.user_account_id
    WHERE s.company_id = _company_id AND s.is_active
      AND public.has_order_intake(ua.id, _company_id);
  IF NOT FOUND THEN
    RETURN QUERY SELECT DISTINCT ur.user_id FROM public.user_roles ur WHERE ur.role = 'super_admin';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.list_order_intake_members(_company_id uuid)
RETURNS TABLE(user_account_id uuid, full_name text, email text, is_superadmin boolean, has_admin boolean, notify boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_global_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Ingen tilgang' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT ua.id, p.full_name, au.email::text,
         public.is_global_superadmin(ua.auth_user_id),
         public.has_order_intake(ua.id, _company_id),
         COALESCE((SELECT s.is_active FROM public.order_notification_subscriptions s
                   WHERE s.user_account_id = ua.id AND s.company_id = _company_id), false)
  FROM public.user_accounts ua
  JOIN public.people p ON p.id = ua.person_id
  LEFT JOIN auth.users au ON au.id = ua.auth_user_id
  WHERE ua.is_active AND ua.auth_user_id IS NOT NULL
    AND (public.is_global_superadmin(ua.auth_user_id)
         OR EXISTS (SELECT 1 FROM public.user_permission_overrides_v2 o
                    WHERE o.user_account_id = ua.id AND o.permission_key = 'orders.intake'
                      AND o.scope_company_id = _company_id)
         OR EXISTS (SELECT 1 FROM public.order_notification_subscriptions s
                    WHERE s.user_account_id = ua.id AND s.company_id = _company_id AND s.is_active))
  ORDER BY 4 DESC, 2;
END $$;

CREATE OR REPLACE FUNCTION public.search_order_intake_candidates(_company_id uuid, _q text)
RETURNS TABLE(user_account_id uuid, full_name text, email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_global_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Ingen tilgang' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT ua.id, p.full_name, au.email::text
  FROM public.user_accounts ua
  JOIN public.people p ON p.id = ua.person_id
  LEFT JOIN auth.users au ON au.id = ua.auth_user_id
  WHERE ua.is_active AND ua.verified_at IS NOT NULL AND ua.auth_user_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.user_memberships m WHERE m.user_id = ua.auth_user_id AND m.company_id = _company_id AND m.is_active)
    AND (coalesce(_q,'') = '' OR p.full_name ILIKE '%'||_q||'%' OR au.email ILIKE '%'||_q||'%')
  ORDER BY p.full_name LIMIT 20;
END $$;

CREATE OR REPLACE FUNCTION public.set_order_intake_member(_company_id uuid, _user_account_id uuid, _admin boolean, _notify boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_auth uuid; v_is_sa boolean; v_before_admin boolean; v_before_notify boolean; v_notify boolean;
BEGIN
  IF NOT public.is_global_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Ingen tilgang' USING ERRCODE = '42501'; END IF;
  SELECT auth_user_id INTO v_auth FROM public.user_accounts WHERE id = _user_account_id AND is_active;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'Ukjent eller inaktiv konto'; END IF;
  v_is_sa := public.is_global_superadmin(v_auth);
  IF _admin AND NOT v_is_sa AND NOT EXISTS (SELECT 1 FROM public.user_memberships WHERE user_id = v_auth AND company_id = _company_id AND is_active) THEN
    RAISE EXCEPTION 'Personen er ikke aktivt medlem i selskapet';
  END IF;
  v_before_admin := public.has_order_intake(_user_account_id, _company_id);
  v_before_notify := COALESCE((SELECT is_active FROM public.order_notification_subscriptions WHERE user_account_id = _user_account_id AND company_id = _company_id), false);
  v_notify := _notify AND (_admin OR v_is_sa);

  IF NOT v_is_sa THEN
    IF _admin THEN
      INSERT INTO public.user_permission_overrides_v2 (user_account_id, permission_key, scope_company_id, mode)
      SELECT _user_account_id, 'orders.intake', _company_id, 'allow'
      WHERE NOT EXISTS (SELECT 1 FROM public.user_permission_overrides_v2 WHERE user_account_id = _user_account_id AND permission_key = 'orders.intake' AND scope_company_id = _company_id);
    ELSE
      DELETE FROM public.user_permission_overrides_v2 WHERE user_account_id = _user_account_id AND permission_key = 'orders.intake' AND scope_company_id = _company_id;
    END IF;
  END IF;

  INSERT INTO public.order_notification_subscriptions (user_account_id, company_id, is_active, updated_by, updated_at)
  VALUES (_user_account_id, _company_id, v_notify, auth.uid(), now())
  ON CONFLICT (user_account_id, company_id) DO UPDATE SET is_active = EXCLUDED.is_active, updated_by = EXCLUDED.updated_by, updated_at = now();

  IF v_before_admin IS DISTINCT FROM (_admin OR v_is_sa) OR v_before_notify IS DISTINCT FROM v_notify THEN
    INSERT INTO public.access_audit_log (user_id, company_id, module, level, action, details, performed_by)
    VALUES (v_auth, _company_id, 'orders.intake', CASE WHEN _admin OR v_is_sa THEN 'admin' ELSE 'none' END, 'order_intake_changed',
      jsonb_build_object('user_account_id', _user_account_id,
        'before', jsonb_build_object('admin', v_before_admin, 'notify', v_before_notify),
        'after', jsonb_build_object('admin', _admin OR v_is_sa, 'notify', v_notify)), auth.uid());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.list_order_intake_history(_company_id uuid)
RETURNS TABLE(performed_at timestamptz, person_name text, performed_by_name text, details jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_global_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Ingen tilgang' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT l.performed_at,
    (SELECT p.full_name FROM public.user_accounts ua JOIN public.people p ON p.id = ua.person_id WHERE ua.auth_user_id = l.user_id AND ua.is_active LIMIT 1),
    (SELECT p.full_name FROM public.user_accounts ua JOIN public.people p ON p.id = ua.person_id WHERE ua.auth_user_id = l.performed_by AND ua.is_active LIMIT 1),
    l.details
  FROM public.access_audit_log l
  WHERE l.module = 'orders.intake' AND l.company_id = _company_id
  ORDER BY l.performed_at DESC LIMIT 50;
END $$;

REVOKE ALL ON FUNCTION public.order_intake_recipients(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_order_intake(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_order_intake_members(uuid), public.search_order_intake_candidates(uuid, text),
  public.set_order_intake_member(uuid, uuid, boolean, boolean), public.list_order_intake_history(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.list_order_intake_members(uuid), public.search_order_intake_candidates(uuid, text),
  public.set_order_intake_member(uuid, uuid, boolean, boolean), public.list_order_intake_history(uuid) FROM anon;