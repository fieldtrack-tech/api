-- =============================================================================
-- Performance Indexes + Latest-Session-Per-Employee RPC
-- FieldTrack 2.0 — 2026-03-14
-- =============================================================================
-- This migration adds compound indexes for the admin org-sessions query
-- and creates a PostgreSQL function that returns the latest attendance
-- session per employee using DISTINCT ON (most efficient pattern in PG).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Performance indexes
-- ---------------------------------------------------------------------------

-- Best index for the DISTINCT ON (employee_id) + ORDER BY checkin_at DESC
-- pattern used in get_org_latest_sessions: allows PG to do a bitmap scan
-- per (organization_id, employee_id) block in checkin_at descending order.
CREATE INDEX IF NOT EXISTS idx_sessions_org_emp_checkin
    ON attendance_sessions (organization_id, employee_id, checkin_at DESC);

-- Supports admin queries that filter by (organization_id, employee_id)
-- without needing checkin_at ordering (e.g. employee history drilldown).
CREATE INDEX IF NOT EXISTS idx_sessions_org_employee
    ON attendance_sessions (organization_id, employee_id);

-- Speeds up session_summaries joins on session_id.
CREATE INDEX IF NOT EXISTS idx_summaries_session
    ON session_summaries (session_id);

-- ---------------------------------------------------------------------------
-- 2. get_org_latest_sessions — latest session per employee
-- ---------------------------------------------------------------------------
-- Returns one row per employee in an organisation, using DISTINCT ON to
-- efficiently pick the latest checkin.  Computes activity_status inline.
-- A window count (total_count) avoids a separate COUNT(*) round-trip.
--
-- Parameters:
--   p_org_id   — organization UUID (required, enforces tenant isolation)
--   p_status   — 'all' | 'active' | 'recent' | 'inactive'  (default 'all')
--   p_limit    — rows per page  (default 20, max enforced by caller)
--   p_offset   — row offset     (default 0)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_org_latest_sessions(
    p_org_id  UUID,
    p_status  TEXT    DEFAULT 'all',
    p_limit   INTEGER DEFAULT 20,
    p_offset  INTEGER DEFAULT 0
)
RETURNS TABLE (
    id                              UUID,
    employee_id                     UUID,
    organization_id                 UUID,
    checkin_at                      TIMESTAMPTZ,
    checkout_at                     TIMESTAMPTZ,
    total_distance_km               DOUBLE PRECISION,
    total_duration_seconds          INTEGER,
    distance_recalculation_status   TEXT,
    created_at                      TIMESTAMPTZ,
    updated_at                      TIMESTAMPTZ,
    employee_code                   TEXT,
    employee_name                   TEXT,
    activity_status                 TEXT,
    total_count                     BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    WITH latest AS (
        -- DISTINCT ON picks the row with the highest checkin_at per employee.
        -- The compound index idx_sessions_org_emp_checkin makes this fast.
        SELECT DISTINCT ON (s.employee_id)
            s.id,
            s.employee_id,
            s.organization_id,
            s.checkin_at,
            s.checkout_at,
            s.total_distance_km,
            s.total_duration_seconds,
            s.distance_recalculation_status::TEXT,
            s.created_at,
            s.updated_at,
            e.employee_code,
            e.name AS employee_name,
            CASE
                WHEN s.checkout_at IS NULL
                    THEN 'ACTIVE'
                WHEN s.checkout_at > NOW() - INTERVAL '24 hours'
                    THEN 'RECENT'
                ELSE 'INACTIVE'
            END AS activity_status
        FROM attendance_sessions s
        JOIN employees e ON e.id = s.employee_id
        WHERE s.organization_id = p_org_id
        ORDER BY s.employee_id, s.checkin_at DESC
    ),
    filtered AS (
        -- Apply optional status filter after the DISTINCT ON CTE.
        SELECT *
        FROM latest
        WHERE
            p_status = 'all'
            OR (p_status = 'active'   AND activity_status = 'ACTIVE')
            OR (p_status = 'recent'   AND activity_status = 'RECENT')
            OR (p_status = 'inactive' AND activity_status = 'INACTIVE')
    ),
    counted AS (
        -- Sort by activity priority (ACTIVE first), then by latest checkin.
        -- Window count avoids a separate COUNT(*) query.
        SELECT
            *,
            COUNT(*) OVER() AS total_count
        FROM filtered
        ORDER BY
            CASE activity_status
                WHEN 'ACTIVE'   THEN 1
                WHEN 'RECENT'   THEN 2
                ELSE                 3
            END,
            checkin_at DESC
    )
    SELECT * FROM counted
    LIMIT p_limit OFFSET p_offset;
$$;

-- Grant execute to the authenticated and service roles used by Supabase.
GRANT EXECUTE ON FUNCTION get_org_latest_sessions(UUID, TEXT, INTEGER, INTEGER)
    TO authenticated, service_role;
