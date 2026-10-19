UPDATE public.tripletex_connections
SET capabilities = (SELECT array_agg(DISTINCT c ORDER BY c) FROM unnest(capabilities || ARRAY['employees_read','project_participants_write']) c), updated_at = now()
WHERE id = '6591d8c2-7712-4cad-9ac0-869fbaa32eac' AND company_id = 'a0000000-0000-0000-0000-000000000001' AND environment = 'test';