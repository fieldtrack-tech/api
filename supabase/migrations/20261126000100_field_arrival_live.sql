-- Preserve attendance independently from short-lived image and GPS evidence.
ALTER TABLE public.attendance_sessions ADD COLUMN selfie_verified boolean NOT NULL DEFAULT false;
UPDATE public.attendance_sessions SET selfie_verified = true WHERE selfie_path IS NOT NULL;

CREATE FUNCTION public.mark_camera_attendance_verified() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.selfie_path IS NOT NULL THEN NEW.selfie_verified := true; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER camera_attendance_verified BEFORE INSERT OR UPDATE OF selfie_path ON public.attendance_sessions
FOR EACH ROW EXECUTE FUNCTION public.mark_camera_attendance_verified();

-- A manually verified first arrival has no departure evidence. Repeats still
-- require a distant fix followed by a confident arrival in the same shift.
ALTER TABLE public.field_visits ALTER COLUMN departed_from_at DROP NOT NULL;
CREATE INDEX field_visits_employee_site_time ON public.field_visits(organization_id, employee_id, site_id, arrived_at DESC);

CREATE FUNCTION public.confirm_field_arrival(
  p_org uuid, p_employee uuid, p_site uuid, p_lat double precision,
  p_lng double precision, p_accuracy double precision, p_recorded_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  site public.field_sites;
  shift public.attendance_sessions;
  point public.gps_locations;
  visit public.field_visits;
  state public.field_visit_states;
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
  SELECT * INTO shift FROM public.attendance_sessions a
  WHERE a.organization_id = p_org AND a.employee_id = p_employee
    AND a.checkout_at IS NULL AND a.selfie_verified
    AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id = p_employee AND e.organization_id = p_org AND e.is_active)
  FOR UPDATE;
  IF NOT FOUND OR p_recorded_at < shift.checkin_at THEN
    RAISE EXCEPTION 'Start a selfie-verified shift before confirming arrival.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO site FROM public.field_sites s
  WHERE s.organization_id = p_org AND s.id = p_site AND s.is_active AND s.created_at <= p_recorded_at
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work site not found.' USING ERRCODE = 'P0002';
  END IF;
  IF public.field_distance_m(p_lat, p_lng, site.latitude, site.longitude) + p_accuracy > site.arrival_radius_m THEN
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

  -- The GPS trigger may already have counted this arrival. A confirmation of
  -- an existing arrival returns its original receipt and cannot pay twice.
  SELECT * INTO visit FROM public.field_visits v
  WHERE v.organization_id = p_org AND v.employee_id = p_employee AND v.site_id = p_site
  ORDER BY v.arrived_at DESC LIMIT 1;
  SELECT * INTO state FROM public.field_visit_states s
  WHERE s.organization_id = p_org AND s.employee_id = p_employee AND s.site_id = p_site;

  IF visit.id IS NULL THEN
    IF state.last_recorded_at > p_recorded_at THEN
      RAISE EXCEPTION 'A newer GPS fix is already recorded. Capture a new fix.' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO STRICT rate FROM public.field_site_rates r
    WHERE r.organization_id = p_org AND r.site_id = p_site AND r.effective_at <= p_recorded_at
    ORDER BY r.effective_at DESC, r.id DESC LIMIT 1;
    SELECT s.currency INTO STRICT currency_code FROM public.field_settings s WHERE s.organization_id = p_org;
    INSERT INTO public.field_visits(organization_id, employee_id, session_id, site_id, arrival_point_id,
      arrived_at, departed_from_at, site_name, rate_minor, currency)
    VALUES (p_org, p_employee, shift.id, p_site, point.id, p_recorded_at, NULL, rate.site_name, rate.rate_minor, currency_code)
    RETURNING * INTO visit;
    UPDATE public.field_visit_states SET armed = false
    WHERE organization_id = p_org AND employee_id = p_employee AND site_id = p_site;
  ELSIF visit.session_id <> shift.id OR visit.arrived_at > p_recorded_at
    OR (state.armed AND state.departed_at > visit.arrived_at) THEN
    RAISE EXCEPTION 'A new payable visit needs a recorded departure and return during this shift.' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object('visit_id', visit.id, 'site_id', visit.site_id,
    'arrived_at', visit.arrived_at, 'amount_minor', visit.rate_minor, 'currency', visit.currency);
END $$;

REVOKE ALL ON FUNCTION public.confirm_field_arrival(uuid,uuid,uuid,double precision,double precision,double precision,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_field_arrival(uuid,uuid,uuid,double precision,double precision,double precision,timestamptz)
  TO service_role;

-- The latest GPS point is read directly from the active shift, even when the
-- queue is delayed. Historic fixes never appear as a live marker.
CREATE OR REPLACE FUNCTION public.get_active_map_markers(p_org_id uuid, p_limit integer DEFAULT 1000)
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
  ORDER BY e.id LIMIT greatest(0, least(coalesce(p_limit, 1000), 1000));
$$;

REVOKE ALL ON FUNCTION public.get_active_map_markers(uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_map_markers(uuid,integer) TO service_role;
