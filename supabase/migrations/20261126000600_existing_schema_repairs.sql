-- Restore the column contract used by the employee daily metrics worker.
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS expenses_employee_idempotency_key
  ON public.expenses(organization_id, employee_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE OR REPLACE FUNCTION public.reconcile_snapshot_tables()
RETURNS INT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  total_rows INT := 0;
  row_count INT;
BEGIN
  -- ── 1. employee_last_state ───────────────────────────────────────────
  -- Rebuild from the latest attendance_session per employee.
  INSERT INTO employee_last_state (
    employee_id, organization_id, last_session_id,
    is_checked_in, last_check_in_at, last_check_out_at
  )
  SELECT DISTINCT ON (s.employee_id)
    s.employee_id,
    s.organization_id,
    s.id AS last_session_id,
    (s.checkout_at IS NULL) AS is_checked_in,
    s.checkin_at AS last_check_in_at,
    s.checkout_at AS last_check_out_at
  FROM attendance_sessions s
  ORDER BY s.employee_id, s.checkin_at DESC
  ON CONFLICT (employee_id) DO UPDATE SET
    last_session_id   = EXCLUDED.last_session_id,
    is_checked_in     = EXCLUDED.is_checked_in,
    last_check_in_at  = EXCLUDED.last_check_in_at,
    last_check_out_at = EXCLUDED.last_check_out_at,
    updated_at        = now();
  GET DIAGNOSTICS row_count = ROW_COUNT;
  total_rows := total_rows + row_count;

  -- ── 2. active_users ──────────────────────────────────────────────────
  -- Remove stale rows (no longer checked in)
  DELETE FROM active_users au
  WHERE NOT EXISTS (
    SELECT 1 FROM attendance_sessions s
    WHERE s.employee_id = au.employee_id
      AND s.checkout_at IS NULL
  );
  -- Insert missing rows
  INSERT INTO active_users (employee_id, organization_id, session_id, last_seen_at)
  SELECT s.employee_id, s.organization_id, s.id, now()
  FROM attendance_sessions s
  WHERE s.checkout_at IS NULL
  ON CONFLICT (employee_id) DO UPDATE SET
    session_id   = EXCLUDED.session_id,
    last_seen_at = now();
  GET DIAGNOSTICS row_count = ROW_COUNT;
  total_rows := total_rows + row_count;

  -- ── 3. employee_latest_sessions ──────────────────────────────────────
  -- Rebuild latest session + computed status per employee.
  INSERT INTO employee_latest_sessions (
    employee_id, organization_id, session_id,
    latest_checkin, latest_checkout,
    total_distance_km, total_duration_seconds,
    status, updated_at
  )
  SELECT DISTINCT ON (s.employee_id)
    s.employee_id,
    s.organization_id,
    s.id,
    s.checkin_at,
    s.checkout_at,
    s.total_distance_km,
    s.total_duration_seconds,
    CASE
      WHEN s.checkout_at IS NULL THEN 'ACTIVE'
      WHEN s.checkout_at >= now() - interval '24 hours' THEN 'RECENT'
      ELSE 'INACTIVE'
    END,
    now()
  FROM attendance_sessions s
  ORDER BY s.employee_id, s.checkin_at DESC
  ON CONFLICT (employee_id) DO UPDATE SET
    session_id             = EXCLUDED.session_id,
    latest_checkin         = EXCLUDED.latest_checkin,
    latest_checkout        = EXCLUDED.latest_checkout,
    total_distance_km      = EXCLUDED.total_distance_km,
    total_duration_seconds = EXCLUDED.total_duration_seconds,
    status                 = EXCLUDED.status,
    updated_at             = now();
  GET DIAGNOSTICS row_count = ROW_COUNT;
  total_rows := total_rows + row_count;

  -- ── 4. employee_metrics_snapshot ─────────────────────────────────────
  -- Recompute cumulative metrics from daily metrics + approved expenses.
  INSERT INTO employee_metrics_snapshot (
    employee_id, organization_id,
    total_sessions, total_hours, total_distance, total_expenses,
    last_active_at, updated_at
  )
  SELECT
    e.id AS employee_id,
    e.organization_id,
    COALESCE(m.total_sessions, 0),
    COALESCE(m.total_hours, 0),
    COALESCE(m.total_distance, 0),
    COALESCE(exp.total_expenses, 0),
    m.last_active_at,
    now()
  FROM employees e
  LEFT JOIN (
    SELECT
      employee_id,
      SUM(sessions) AS total_sessions,
      SUM(duration_seconds)::numeric / 3600 AS total_hours,
      SUM(distance_km) AS total_distance,
      MAX(date) AS last_active_at
    FROM employee_daily_metrics
    GROUP BY employee_id
  ) m ON m.employee_id = e.id
  LEFT JOIN (
    SELECT employee_id, SUM(amount) AS total_expenses
    FROM expenses
    WHERE status = 'APPROVED'
    GROUP BY employee_id
  ) exp ON exp.employee_id = e.id
  ON CONFLICT (employee_id) DO UPDATE SET
    total_sessions = EXCLUDED.total_sessions,
    total_hours    = EXCLUDED.total_hours,
    total_distance = EXCLUDED.total_distance,
    total_expenses = EXCLUDED.total_expenses,
    last_active_at = EXCLUDED.last_active_at,
    updated_at     = now();
  GET DIAGNOSTICS row_count = ROW_COUNT;
  total_rows := total_rows + row_count;

  -- ── 5. pending_expenses ──────────────────────────────────────────────
  -- Remove expenses no longer PENDING, insert missing PENDING ones.
  DELETE FROM pending_expenses pe
  WHERE NOT EXISTS (
    SELECT 1 FROM expenses ex
    WHERE ex.id = pe.id AND ex.status = 'PENDING'
  );
  INSERT INTO pending_expenses (id, organization_id, employee_id, amount, submitted_at)
  SELECT ex.id, ex.organization_id, ex.employee_id, ex.amount, ex.created_at
  FROM expenses ex
  WHERE ex.status = 'PENDING'
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  total_rows := total_rows + row_count;

  RETURN total_rows;
END;
$$;
