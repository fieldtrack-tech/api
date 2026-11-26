-- A verified visit is an earning record. Its GPS breadcrumb can expire independently.
ALTER TABLE public.field_visits
  ALTER COLUMN arrival_point_id DROP NOT NULL,
  DROP CONSTRAINT field_visits_arrival_point_id_fkey,
  ADD CONSTRAINT field_visits_arrival_point_id_fkey
    FOREIGN KEY (arrival_point_id) REFERENCES public.gps_locations(id) ON DELETE SET NULL;

CREATE INDEX field_visits_arrival_point_idx ON public.field_visits(arrival_point_id) WHERE arrival_point_id IS NOT NULL;
CREATE INDEX field_gps_retention_idx ON public.gps_locations(recorded_at, id);
CREATE INDEX field_attendance_gps_retention_idx ON public.attendance_sessions(checkin_at, id)
  WHERE start_latitude IS NOT NULL OR start_longitude IS NOT NULL OR start_accuracy_m IS NOT NULL;
CREATE INDEX field_selfie_retention_idx ON public.attendance_sessions(checkin_at, id) WHERE selfie_path IS NOT NULL;
CREATE INDEX field_selfie_path_idx ON public.attendance_sessions(selfie_path) WHERE selfie_path IS NOT NULL;
CREATE INDEX field_challenge_retention_idx ON public.attendance_selfie_challenges(expires_at);
CREATE INDEX field_crash_retention_idx ON public.mobile_crash_reports(created_at, id);
CREATE INDEX field_visit_state_retention_idx ON public.field_visit_states(last_recorded_at);

-- Once a session has lost any of its GPS trail, its last derived totals are
-- still useful, but recomputing from a partial or missing route would corrupt them.
ALTER TABLE public.attendance_sessions ADD COLUMN gps_history_pruned boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.field_evidence_cutoff()
RETURNS timestamptz LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT (statement_timestamp() AT TIME ZONE 'UTC' - interval '3 months') AT TIME ZONE 'UTC';
$$;

CREATE FUNCTION public.prune_field_evidence()
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  cutoff timestamptz := public.field_evidence_cutoff();
  gps_count integer;
  checkin_count integer;
  snapshot_count integer;
  state_count integer;
  crash_count integer;
BEGIN
  -- Multiple replicas can run the job. Only one prunes DB evidence per batch.
  IF NOT pg_try_advisory_xact_lock(hashtextextended('field-evidence-retention', 0)) THEN
    RETURN jsonb_build_object('more', false);
  END IF;

  WITH batch AS (
    SELECT id FROM public.gps_locations WHERE recorded_at < cutoff
    ORDER BY recorded_at, id LIMIT 5000 FOR UPDATE SKIP LOCKED
  ), deleted AS (
    DELETE FROM public.gps_locations g USING batch b WHERE g.id = b.id RETURNING g.session_id
  ), marked AS (
    UPDATE public.attendance_sessions a SET gps_history_pruned = true
    WHERE NOT a.gps_history_pruned AND a.id IN (SELECT session_id FROM deleted)
  )
  SELECT count(*) INTO gps_count FROM deleted;

  WITH batch AS (
    SELECT id FROM public.attendance_sessions WHERE checkin_at < cutoff
      AND (start_latitude IS NOT NULL OR start_longitude IS NOT NULL OR start_accuracy_m IS NOT NULL)
    ORDER BY checkin_at, id LIMIT 500 FOR UPDATE SKIP LOCKED
  )
  UPDATE public.attendance_sessions a SET start_latitude = NULL, start_longitude = NULL, start_accuracy_m = NULL
  FROM batch b WHERE a.id = b.id;
  GET DIAGNOSTICS checkin_count = ROW_COUNT;

  WITH batch AS (
    SELECT employee_id FROM public.employee_last_state WHERE last_location_at < cutoff
    ORDER BY last_location_at, employee_id LIMIT 500 FOR UPDATE SKIP LOCKED
  )
  UPDATE public.employee_last_state s SET last_latitude = NULL, last_longitude = NULL, last_location_at = NULL
  FROM batch b WHERE s.employee_id = b.employee_id;
  GET DIAGNOSTICS snapshot_count = ROW_COUNT;

  WITH batch AS (
    SELECT organization_id, employee_id, site_id FROM public.field_visit_states WHERE last_recorded_at < cutoff
    ORDER BY last_recorded_at, organization_id, employee_id, site_id LIMIT 500 FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.field_visit_states s USING batch b
  WHERE (s.organization_id, s.employee_id, s.site_id) = (b.organization_id, b.employee_id, b.site_id);
  GET DIAGNOSTICS state_count = ROW_COUNT;

  WITH batch AS (
    SELECT id FROM public.mobile_crash_reports WHERE created_at < cutoff
    ORDER BY created_at, id LIMIT 500 FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.mobile_crash_reports r USING batch b WHERE r.id = b.id;
  GET DIAGNOSTICS crash_count = ROW_COUNT;

  RETURN jsonb_build_object('gps', gps_count, 'checkins', checkin_count, 'snapshots', snapshot_count,
    'visit_states', state_count, 'crash_reports', crash_count,
    'more', gps_count = 5000 OR greatest(checkin_count, snapshot_count, state_count, crash_count) = 500);
END $$;

-- Delete bytes through the Storage API, then retire paths. Expired unused
-- challenges get a day of grace so a still-valid signed upload cannot recreate the object.
CREATE FUNCTION public.field_selfies_for_cleanup()
RETURNS text[] LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(array_agg(expired.path), ARRAY[]::text[])
  FROM (
    SELECT path, min(expired_at) AS expired_at
    FROM (
      SELECT c.object_path AS path, c.expires_at AS expired_at
      FROM public.attendance_selfie_challenges c
      WHERE ((c.consumed_at IS NULL AND c.expires_at < statement_timestamp() - interval '1 day')
        OR c.expires_at < public.field_evidence_cutoff())
        AND NOT EXISTS (SELECT 1 FROM public.attendance_sessions a
          WHERE a.selfie_path = c.object_path AND a.checkin_at >= public.field_evidence_cutoff())
      UNION ALL
      SELECT a.selfie_path, a.checkin_at FROM public.attendance_sessions a
      WHERE a.selfie_path IS NOT NULL AND a.checkin_at < public.field_evidence_cutoff()
    ) candidates
    GROUP BY path ORDER BY min(expired_at), path LIMIT 100
  ) expired;
$$;

CREATE FUNCTION public.complete_field_selfie_cleanup(p_paths text[])
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  UPDATE public.attendance_sessions a SET selfie_path = NULL
  WHERE a.selfie_path = ANY(p_paths) AND a.checkin_at < public.field_evidence_cutoff();
  DELETE FROM public.attendance_selfie_challenges c
  WHERE c.object_path = ANY(p_paths) AND
    ((c.consumed_at IS NULL AND c.expires_at < statement_timestamp() - interval '1 day')
    OR c.expires_at < public.field_evidence_cutoff())
    AND NOT EXISTS (SELECT 1 FROM public.attendance_sessions a WHERE a.selfie_path = c.object_path);
END $$;

REVOKE ALL ON FUNCTION public.field_evidence_cutoff(), public.prune_field_evidence(), public.field_selfies_for_cleanup(),
  public.complete_field_selfie_cleanup(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.field_evidence_cutoff(), public.prune_field_evidence(), public.field_selfies_for_cleanup(),
  public.complete_field_selfie_cleanup(text[]) TO service_role;
