-- FT-001: remove direct client execution of backend-owned RPCs.
-- Forward-only permission repair: no table/data/function-body changes, and no
-- rewrite of earlier applied migrations. Apply as the application migration
-- owner (normally postgres) after reviewing staging/live grants.
--
-- RLS does not protect a SECURITY DEFINER RPC whose caller chooses p_org_id.
-- These operations already go through the authenticated API's service client.
-- Handle every installed overload of known application RPCs; tolerate retired
-- functions without touching unrelated/public utility or extension routines.
DO $rpc_permissions$
DECLARE
  rpc record;
BEGIN
  FOR rpc IN
    SELECT pg_catalog.format('%I.%I(%s)', n.nspname, p.proname,
      pg_catalog.pg_get_function_identity_arguments(p.oid)) AS signature
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.proname = ANY (ARRAY[
        'get_org_latest_sessions',
        'get_active_map_markers',
        'generate_employee_code',
        'increment_employee_session_metrics',
        'increment_employee_expense_metrics',
        'increment_org_session_metrics',
        'get_expense_summary_by_employee',
        'list_inactive_employees',
        'list_sessions_by_segment',
        'reconcile_snapshot_tables',
        'backfill_feat1_snapshots',
        'increment_api_key_usage',
        'increment_api_key_error',
        'camera_attendance_checkin',
        'set_employee_basic_pay',
        'field_report'
      ])
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_depend d
        WHERE d.classid = 'pg_catalog.pg_proc'::regclass AND d.objid = p.oid
          AND d.deptype = 'e'
      )
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', rpc.signature);
    EXECUTE pg_catalog.format(
      'GRANT EXECUTE ON FUNCTION %s TO service_role', rpc.signature);
  END LOOP;

  -- The JWT hook is NOT a service/client RPC. Supabase Auth alone invokes it.
  FOR rpc IN
    SELECT pg_catalog.format('%I.%I(%s)', n.nspname, p.proname,
      pg_catalog.pg_get_function_identity_arguments(p.oid)) AS signature
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'custom_access_token_hook'
      AND p.prokind = 'f'
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', rpc.signature);
    EXECUTE pg_catalog.format(
      'GRANT EXECUTE ON FUNCTION %s TO supabase_auth_admin', rpc.signature);
  END LOOP;
END
$rpc_permissions$;

-- Function EXECUTE is granted to PUBLIC globally by PostgreSQL by default.
-- A per-schema REVOKE alone CANNOT remove that inherited global default.
-- Remove both global and additive public-schema client defaults for this DDL
-- owner; grant new public functions to the backend explicitly. Existing public
-- utilities keep their current permissions. Other DDL owners require their own
-- reviewed default-privilege policy; this does not modify unrelated role owners.
ALTER DEFAULT PRIVILEGES
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;
