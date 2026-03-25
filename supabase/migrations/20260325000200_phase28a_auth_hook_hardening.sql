-- ========================================================================
-- Phase 28a -- Auth Hook Hardening (2026-03-25)
-- ========================================================================
--
-- CRITICAL: After running this migration you MUST enable the hook in
-- Supabase Dashboard -> Authentication -> Hooks ->
-- "Customize Access Token (JWT) Claims" -> Postgres ->
-- Schema: public  Function: custom_access_token_hook
--
-- If the hook is not enabled in the dashboard, NO custom claims
-- will be injected and ALL authenticated API calls will return 401.
-- ========================================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     UUID;
  v_role        public.user_role;
  v_employee_id UUID;
  v_org_id      UUID;
BEGIN
  -- Extract user UUID from the hook event.
  -- Supabase uses 'userId' at the event root in the current hook API.
  -- Fall back to claims.sub for forward-compatibility with newer versions.
  v_user_id := COALESCE(
    (event->>'userId')::uuid,
    (event->'claims'->>'sub')::uuid
  );

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'custom_access_token_hook: could not resolve userId from event';
    RETURN event;
  END IF;

  -- Resolve role + org_id from the authoritative public.users table.
  SELECT role, organization_id
  INTO v_role, v_org_id
  FROM public.users
  WHERE id = v_user_id
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE NOTICE 'custom_access_token_hook: no public.users row for userId=%', v_user_id;
    RETURN event;
  END IF;

  -- Inject role and org_id as top-level JWT claims.
  -- These appear as 'role' and 'org_id' directly on the decoded JWT payload.
  event := jsonb_set(event, '{claims,role}',   to_jsonb(v_role::text));
  event := jsonb_set(event, '{claims,org_id}', to_jsonb(v_org_id));

  -- For EMPLOYEE users, inject employee record UUID as a top-level claim.
  -- ADMIN users have no employee record; this claim is intentionally omitted.
  IF v_role = 'EMPLOYEE' THEN
    SELECT id INTO v_employee_id
    FROM public.employees
    WHERE user_id   = v_user_id
      AND is_active = TRUE
    LIMIT 1;

    IF v_employee_id IS NOT NULL THEN
      event := jsonb_set(event, '{claims,employee_id}', to_jsonb(v_employee_id));
    END IF;
  END IF;

  RETURN event;
END;
$$;

COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS
'Supabase Auth Hook -- REQUIRED for JWT claims (role, org_id, employee_id).
Must be enabled in: Supabase Dashboard -> Authentication -> Hooks ->
Customize Access Token (JWT) Claims -> Postgres -> public.custom_access_token_hook.
If disabled -> ALL authenticated API requests will fail with 401.
Injects into JWT top-level claims: role, org_id, employee_id (EMPLOYEE only).';

-- Permissions
-- Only supabase_auth_admin may invoke this function.
-- REVOKE from PUBLIC first (covers anon + authenticated), then
-- grant explicitly only to supabase_auth_admin.
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated;
GRANT USAGE  ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
