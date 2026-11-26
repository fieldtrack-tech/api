-- Version geofences independently of rates so offline evidence uses the rules at capture time.
CREATE TABLE public.field_site_rules (
  organization_id uuid NOT NULL,
  site_id uuid NOT NULL,
  effective_at timestamptz NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  arrival_radius_m integer NOT NULL,
  departure_radius_m integer NOT NULL,
  is_active boolean NOT NULL,
  PRIMARY KEY (organization_id, site_id, effective_at),
  FOREIGN KEY (organization_id, site_id) REFERENCES public.field_sites(organization_id, id)
);
ALTER TABLE public.field_site_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.field_site_rules FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.field_site_rules TO service_role;

INSERT INTO public.field_site_rules
SELECT organization_id, id, created_at, latitude, longitude, arrival_radius_m, departure_radius_m, is_active
FROM public.field_sites;

ALTER TABLE public.field_visit_states
  ADD COLUMN rule_effective_at timestamptz,
  ADD COLUMN last_confirmed_at timestamptz,
  ADD COLUMN last_confirmed_session_id uuid REFERENCES public.attendance_sessions(id);

CREATE OR REPLACE FUNCTION public.version_field_site() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE effective timestamptz := clock_timestamp();
BEGIN
  IF TG_OP = 'INSERT' THEN effective := NEW.created_at; END IF;
  IF TG_OP = 'INSERT' OR ROW(NEW.visit_rate_minor, NEW.name) IS DISTINCT FROM ROW(OLD.visit_rate_minor, OLD.name) THEN
    INSERT INTO public.field_site_rates(organization_id, site_id, effective_at, rate_minor, site_name)
    VALUES (NEW.organization_id, NEW.id, effective, NEW.visit_rate_minor, NEW.name);
  END IF;
  IF TG_OP = 'INSERT' OR ROW(NEW.latitude, NEW.longitude, NEW.arrival_radius_m, NEW.departure_radius_m, NEW.is_active)
    IS DISTINCT FROM ROW(OLD.latitude, OLD.longitude, OLD.arrival_radius_m, OLD.departure_radius_m, OLD.is_active) THEN
    INSERT INTO public.field_site_rules VALUES
      (NEW.organization_id, NEW.id, effective, NEW.latitude, NEW.longitude, NEW.arrival_radius_m, NEW.departure_radius_m, NEW.is_active);
  END IF;
  RETURN NEW;
END $$;

-- Rules are written by the site trigger under the API's service role.
GRANT INSERT ON public.field_site_rules TO service_role;

-- Reconcile a late arrival against the closest known trip boundaries.
-- Existing visit IDs, timestamps, and rates remain stable for recorded payments.
CREATE FUNCTION public.count_field_trip(
  arrival public.gps_locations, rule public.field_site_rules,
  p_checkin timestamptz, p_currency text, p_known_departure timestamptz DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  previous_arrival timestamptz;
  next_visit public.field_visits;
  departure timestamptz := p_known_departure;
  rate public.field_site_rates;
BEGIN
  SELECT v.arrived_at INTO previous_arrival FROM public.field_visits v
  WHERE v.organization_id = arrival.organization_id AND v.employee_id = arrival.employee_id AND v.site_id = rule.site_id
    AND v.arrived_at <= arrival.recorded_at ORDER BY v.arrived_at DESC LIMIT 1;

  IF departure IS NULL THEN
    SELECT g.recorded_at INTO departure FROM public.gps_locations g
    WHERE g.session_id = arrival.session_id AND g.recorded_at < arrival.recorded_at
      AND g.recorded_at >= greatest(p_checkin, rule.effective_at, arrival.recorded_at - interval '48 hours')
      AND (previous_arrival IS NULL OR g.recorded_at > previous_arrival)
      AND g.accuracy BETWEEN 0 AND 100
      AND public.field_distance_m(g.latitude, g.longitude, rule.latitude, rule.longitude) - g.accuracy >= rule.departure_radius_m
    ORDER BY g.recorded_at DESC LIMIT 1;
  END IF;
  IF departure IS NULL OR departure <= previous_arrival THEN RETURN false; END IF;

  SELECT * INTO next_visit FROM public.field_visits v
  WHERE v.organization_id = arrival.organization_id AND v.employee_id = arrival.employee_id AND v.site_id = rule.site_id
    AND v.arrived_at > arrival.recorded_at ORDER BY v.arrived_at LIMIT 1;
  IF next_visit.session_id = arrival.session_id
    AND (next_visit.departed_from_at <= arrival.recorded_at OR next_visit.departed_from_at IS NULL) THEN
    RETURN false;
  END IF;

  SELECT * INTO STRICT rate FROM public.field_site_rates r
  WHERE r.organization_id = arrival.organization_id AND r.site_id = rule.site_id AND r.effective_at <= arrival.recorded_at
  ORDER BY r.effective_at DESC, r.id DESC LIMIT 1;
  INSERT INTO public.field_visits(organization_id, employee_id, session_id, site_id,
    arrival_point_id, arrived_at, departed_from_at, site_name, rate_minor, currency)
  VALUES (arrival.organization_id, arrival.employee_id, arrival.session_id, rule.site_id, arrival.id,
    arrival.recorded_at, departure, rate.site_name, rate.rate_minor, p_currency)
  ON CONFLICT (site_id, arrival_point_id) DO NOTHING;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.detect_field_visit() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  rule public.field_site_rules;
  state public.field_visit_states;
  shift public.attendance_sessions;
  arrival public.gps_locations;
  distance_m double precision;
  currency_code text;
BEGIN
  IF NEW.accuracy IS NULL OR NEW.accuracy NOT BETWEEN 0 AND 100 THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text || NEW.employee_id::text, 0));

  SELECT * INTO shift FROM public.attendance_sessions a WHERE a.id = NEW.session_id
    AND a.organization_id = NEW.organization_id AND a.employee_id = NEW.employee_id AND a.selfie_verified
    AND NEW.recorded_at >= a.checkin_at AND (a.checkout_at IS NULL OR NEW.recorded_at <= a.checkout_at);
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT currency INTO currency_code FROM public.field_settings WHERE organization_id = NEW.organization_id;
  IF currency_code IS NULL THEN RETURN NEW; END IF;
  FOR rule IN
    SELECT version.* FROM public.field_sites s
    CROSS JOIN LATERAL (
      SELECT * FROM public.field_site_rules r WHERE r.organization_id = s.organization_id AND r.site_id = s.id
        AND r.effective_at <= NEW.recorded_at ORDER BY r.effective_at DESC LIMIT 1
    ) version
    WHERE s.organization_id = NEW.organization_id AND version.is_active ORDER BY s.id
  LOOP
    INSERT INTO public.field_visit_states(organization_id, employee_id, site_id)
    VALUES (NEW.organization_id, NEW.employee_id, rule.site_id) ON CONFLICT DO NOTHING;
    SELECT * INTO state FROM public.field_visit_states
    WHERE organization_id = NEW.organization_id AND employee_id = NEW.employee_id AND site_id = rule.site_id FOR UPDATE;

    distance_m := public.field_distance_m(NEW.latitude, NEW.longitude, rule.latitude, rule.longitude);
    IF NEW.recorded_at <= state.last_recorded_at THEN
      IF distance_m + NEW.accuracy <= rule.arrival_radius_m THEN
        arrival := NEW;
      ELSIF distance_m - NEW.accuracy >= rule.departure_radius_m THEN
        SELECT * INTO arrival FROM public.gps_locations g
        WHERE g.session_id = NEW.session_id AND g.recorded_at > NEW.recorded_at
          AND g.recorded_at <= coalesce(shift.checkout_at, clock_timestamp() + interval '5 seconds')
          AND g.recorded_at < coalesce((
            SELECT min(r.effective_at) FROM public.field_site_rules r WHERE r.organization_id = rule.organization_id
              AND r.site_id = rule.site_id AND r.effective_at > rule.effective_at
          ), 'infinity'::timestamptz)
          AND g.accuracy BETWEEN 0 AND 100
          AND public.field_distance_m(g.latitude, g.longitude, rule.latitude, rule.longitude) + g.accuracy <= rule.arrival_radius_m
        ORDER BY g.recorded_at LIMIT 1;
        IF arrival.id IS NULL AND shift.checkout_at IS NULL AND state.rule_effective_at = rule.effective_at
          AND (state.departure_session_id IS DISTINCT FROM NEW.session_id OR state.departed_at < NEW.recorded_at)
          AND NOT EXISTS (
            SELECT 1 FROM public.field_visits v WHERE v.organization_id = NEW.organization_id AND v.employee_id = NEW.employee_id
              AND v.site_id = rule.site_id AND v.arrived_at >= NEW.recorded_at
          ) THEN
          UPDATE public.field_visit_states SET armed = true, departed_at = NEW.recorded_at, departure_session_id = NEW.session_id
          WHERE organization_id = NEW.organization_id AND employee_id = NEW.employee_id AND site_id = rule.site_id;
        END IF;
      ELSE
        arrival := NULL;
      END IF;
      IF arrival.id IS NOT NULL AND public.count_field_trip(arrival, rule, shift.checkin_at, currency_code)
        AND state.departure_session_id = arrival.session_id AND state.departed_at <= arrival.recorded_at THEN
        UPDATE public.field_visit_states SET armed = false
        WHERE organization_id = NEW.organization_id AND employee_id = NEW.employee_id AND site_id = rule.site_id;
      END IF;
      CONTINUE;
    END IF;

    IF state.rule_effective_at IS DISTINCT FROM rule.effective_at THEN
      -- Preserve an existing departure from the initial rule after migration.
      state.armed := state.rule_effective_at IS NULL AND state.armed AND state.departed_at >= rule.effective_at;
    END IF;
    IF distance_m - NEW.accuracy >= rule.departure_radius_m THEN
      state.armed := true;
      state.departed_at := NEW.recorded_at;
      state.departure_session_id := NEW.session_id;
    ELSIF distance_m + NEW.accuracy <= rule.arrival_radius_m AND state.armed AND state.departure_session_id = NEW.session_id
      AND state.departed_at >= NEW.recorded_at - interval '48 hours' THEN
      PERFORM public.count_field_trip(NEW, rule, shift.checkin_at, currency_code, state.departed_at);
      state.armed := false;
    END IF;
    UPDATE public.field_visit_states SET armed = coalesce(state.armed, false), departed_at = state.departed_at,
      departure_session_id = state.departure_session_id, last_recorded_at = NEW.recorded_at, rule_effective_at = rule.effective_at
    WHERE organization_id = NEW.organization_id AND employee_id = NEW.employee_id AND site_id = rule.site_id;
  END LOOP;
  RETURN NEW;
END $$;

-- A single transaction validates ownership and shift boundaries, stores valid
-- siblings of discarded points, and serializes visit processing with checkout.
CREATE FUNCTION public.ingest_field_gps(p_org uuid, p_employee uuid, p_session uuid, p_points jsonb, p_allow_closed boolean)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  shift public.attendance_sessions;
  received_at timestamptz := clock_timestamp();
  oldest_fix timestamptz;
  newest_fix timestamptz;
  discarded jsonb;
  saved jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text || p_employee::text, 0));
  PERFORM 1 FROM public.employees WHERE organization_id = p_org AND id = p_employee AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee is inactive.' USING ERRCODE = '42501'; END IF;

  SELECT * INTO shift FROM public.attendance_sessions a
  WHERE a.organization_id = p_org AND a.employee_id = p_employee AND a.id = p_session FOR SHARE;
  IF NOT FOUND OR (shift.checkout_at IS NOT NULL
    AND (NOT p_allow_closed OR shift.checkout_at < received_at - interval '48 hours')) THEN
    RAISE EXCEPTION 'Cannot record location: invalid or closed attendance session.' USING ERRCODE = 'P0002';
  END IF;
  oldest_fix := greatest(shift.checkin_at, received_at - interval '48 hours');
  newest_fix := coalesce(shift.checkout_at, received_at + interval '5 seconds');

  WITH incoming AS MATERIALIZED (
    SELECT p.*, p.recorded_at::timestamptz AS fix_time
    FROM jsonb_to_recordset(p_points) AS p(latitude float8, longitude float8, accuracy float8, recorded_at text, sequence_number integer)
  ), inserted AS (
    INSERT INTO public.gps_locations(organization_id, employee_id, session_id, latitude, longitude, accuracy, recorded_at, sequence_number)
    SELECT p_org, p_employee, p_session, latitude, longitude, accuracy, fix_time, sequence_number
    FROM incoming WHERE fix_time BETWEEN oldest_fix AND newest_fix ORDER BY fix_time
    ON CONFLICT (session_id, recorded_at) DO NOTHING RETURNING *
  )
  SELECT (SELECT coalesce(jsonb_agg(recorded_at), '[]') FROM incoming WHERE fix_time NOT BETWEEN oldest_fix AND newest_fix),
         (SELECT coalesce(jsonb_agg(to_jsonb(inserted) ORDER BY recorded_at), '[]') FROM inserted)
  INTO discarded, saved;
  IF NOT p_allow_closed AND jsonb_array_length(discarded) = 0 AND jsonb_array_length(saved) = 0 THEN
    -- A retry of the single-location endpoint returns the existing record.
    SELECT jsonb_build_array(to_jsonb(g)) INTO saved FROM public.gps_locations g
    WHERE g.session_id = p_session AND g.recorded_at = (p_points->0->>'recorded_at')::timestamptz;
  END IF;
  RETURN jsonb_build_object('inserted', saved, 'discarded_recorded_at', discarded, 'closed', shift.checkout_at IS NOT NULL);
END $$;

REVOKE ALL ON FUNCTION public.count_field_trip(public.gps_locations,public.field_site_rules,timestamptz,text,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_field_trip(public.gps_locations,public.field_site_rules,timestamptz,text,timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.ingest_field_gps(uuid,uuid,uuid,jsonb,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_field_gps(uuid,uuid,uuid,jsonb,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.confirm_field_arrival(
  p_org uuid, p_employee uuid, p_site uuid, p_lat double precision,
  p_lng double precision, p_accuracy double precision, p_recorded_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  rule public.field_site_rules;
  shift public.attendance_sessions;
  point public.gps_locations;
  visit public.field_visits;
  rate public.field_site_rates;
  currency_code text;
BEGIN
  IF p_lat IS NULL OR p_lat NOT BETWEEN -90 AND 90 OR p_lng IS NULL OR p_lng NOT BETWEEN -180 AND 180
    OR p_accuracy IS NULL OR p_accuracy NOT BETWEEN 0 AND 100 OR p_recorded_at IS NULL
    OR p_recorded_at < clock_timestamp() - interval '60 seconds'
    OR p_recorded_at > clock_timestamp() + interval '5 seconds' THEN
    RAISE EXCEPTION 'A fresh, accurate GPS fix is required. Try again outdoors.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text || p_employee::text, 0));
  PERFORM 1 FROM public.employees WHERE organization_id = p_org AND id = p_employee AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee is inactive.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO shift FROM public.attendance_sessions a
  WHERE a.organization_id = p_org AND a.employee_id = p_employee AND a.checkout_at IS NULL AND a.selfie_verified
  FOR SHARE;
  IF NOT FOUND OR p_recorded_at < shift.checkin_at THEN
    RAISE EXCEPTION 'Start a selfie-verified shift before confirming arrival.' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.field_sites WHERE organization_id = p_org AND id = p_site AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Work site not found.' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO STRICT rule FROM public.field_site_rules r
  WHERE r.organization_id = p_org AND r.site_id = p_site ORDER BY r.effective_at DESC LIMIT 1;
  IF p_recorded_at < rule.effective_at THEN
    RAISE EXCEPTION 'The site location changed. Capture a new GPS fix.' USING ERRCODE = '22023';
  END IF;
  IF public.field_distance_m(p_lat, p_lng, rule.latitude, rule.longitude) + p_accuracy > rule.arrival_radius_m THEN
    RAISE EXCEPTION 'GPS does not confirm that you are inside this work site. Move closer and retry.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.gps_locations(organization_id, employee_id, session_id, latitude, longitude, accuracy, recorded_at)
  VALUES (p_org, p_employee, shift.id, p_lat, p_lng, p_accuracy, p_recorded_at)
  ON CONFLICT (session_id, recorded_at) DO NOTHING RETURNING * INTO point;
  IF NOT FOUND THEN
    SELECT * INTO point FROM public.gps_locations g WHERE g.session_id = shift.id AND g.recorded_at = p_recorded_at;
    IF ROW(point.latitude, point.longitude, point.accuracy) IS DISTINCT FROM ROW(p_lat, p_lng, p_accuracy) THEN
      RAISE EXCEPTION 'This GPS timestamp is already in use. Capture a new fix.' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT s.currency INTO STRICT currency_code FROM public.field_settings s WHERE s.organization_id = p_org;
  UPDATE public.field_visit_states SET last_confirmed_at = p_recorded_at, last_confirmed_session_id = shift.id
  WHERE organization_id = p_org AND employee_id = p_employee AND site_id = p_site
    AND (last_confirmed_at IS NULL OR last_confirmed_at < p_recorded_at);
  SELECT * INTO visit FROM public.field_visits v
  WHERE v.organization_id = p_org AND v.employee_id = p_employee AND v.site_id = p_site
  ORDER BY v.arrived_at DESC LIMIT 1;

  IF visit.id IS NULL THEN
    SELECT * INTO STRICT rate FROM public.field_site_rates r
    WHERE r.organization_id = p_org AND r.site_id = p_site AND r.effective_at <= p_recorded_at
    ORDER BY r.effective_at DESC, r.id DESC LIMIT 1;
    INSERT INTO public.field_visits(organization_id, employee_id, session_id, site_id, arrival_point_id,
      arrived_at, departed_from_at, site_name, rate_minor, currency)
    VALUES (p_org, p_employee, shift.id, p_site, point.id, p_recorded_at, NULL, rate.site_name, rate.rate_minor, currency_code)
    RETURNING * INTO visit;
    UPDATE public.field_visit_states SET armed = false
    WHERE organization_id = p_org AND employee_id = p_employee AND site_id = p_site AND departed_at <= p_recorded_at;
  ELSIF visit.session_id <> shift.id OR visit.arrived_at > p_recorded_at OR
    visit.arrived_at < rule.effective_at OR EXISTS (
      SELECT 1 FROM public.field_visit_states s WHERE s.organization_id = p_org AND s.employee_id = p_employee
        AND s.site_id = p_site AND s.armed AND s.departed_at BETWEEN visit.arrived_at AND p_recorded_at
    ) THEN
    RETURN jsonb_build_object('visit_id', NULL, 'site_id', p_site, 'arrived_at', p_recorded_at,
      'amount_minor', 0, 'currency', currency_code, 'payable', false);
  END IF;

  RETURN jsonb_build_object('visit_id', visit.id, 'site_id', visit.site_id, 'arrived_at', visit.arrived_at,
    'amount_minor', visit.rate_minor, 'currency', visit.currency, 'payable', true);
END $$;

-- Employee drill-down reaches the selected shift even for fleets above the map cap.
CREATE FUNCTION public.get_active_map_markers(p_org_id uuid, p_limit integer, p_employee_id uuid)
RETURNS TABLE (employee_id uuid, latitude double precision, longitude double precision,
  recorded_at timestamptz, employee_name text, employee_code text, status text, session_id uuid)
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT e.id, g.latitude, g.longitude, g.recorded_at, e.name, e.employee_code, 'ACTIVE'::text, a.id
  FROM public.attendance_sessions a
  JOIN public.employees e ON e.organization_id = a.organization_id AND e.id = a.employee_id AND e.is_active
  CROSS JOIN LATERAL (
    SELECT p.latitude, p.longitude, p.recorded_at FROM public.gps_locations p
    WHERE p.organization_id = a.organization_id AND p.employee_id = a.employee_id AND p.session_id = a.id
      AND p.recorded_at <= now()
    ORDER BY p.recorded_at DESC LIMIT 1
  ) g
  WHERE a.organization_id = p_org_id AND a.checkout_at IS NULL
    AND (p_employee_id IS NULL OR e.id = p_employee_id)
  ORDER BY e.id LIMIT greatest(0, least(coalesce(p_limit, 1000), 1000));
$$;

CREATE OR REPLACE FUNCTION public.get_active_map_markers(p_org_id uuid, p_limit integer DEFAULT 1000)
RETURNS TABLE (employee_id uuid, latitude double precision, longitude double precision,
  recorded_at timestamptz, employee_name text, employee_code text, status text, session_id uuid)
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT * FROM public.get_active_map_markers(p_org_id, p_limit, NULL::uuid);
$$;

REVOKE ALL ON FUNCTION public.get_active_map_markers(uuid,integer,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_map_markers(uuid,integer,uuid) TO service_role;
