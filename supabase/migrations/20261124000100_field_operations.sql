-- Company field operations. Legacy attendance remains readable; all new API
-- check-ins require a one-use camera upload challenge and a fresh GPS fix.
CREATE TABLE public.field_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  timezone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.field_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  address text NOT NULL DEFAULT '',
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  arrival_radius_m integer NOT NULL CHECK (arrival_radius_m BETWEEN 25 AND 5000),
  departure_radius_m integer NOT NULL CHECK (departure_radius_m > arrival_radius_m AND departure_radius_m <= 50000),
  visit_rate_minor bigint NOT NULL CHECK (visit_rate_minor BETWEEN 0 AND 100000000000),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);

CREATE TABLE public.employee_basic_pay (
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  effective_month date NOT NULL CHECK (extract(day FROM effective_month) = 1),
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 0 AND 100000000000),
  PRIMARY KEY (organization_id, employee_id, effective_month)
);

CREATE TABLE public.field_site_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  site_id uuid NOT NULL,
  effective_at timestamptz NOT NULL,
  rate_minor bigint NOT NULL,
  site_name text NOT NULL,
  FOREIGN KEY (organization_id, site_id) REFERENCES public.field_sites(organization_id, id)
);
CREATE INDEX field_site_rates_lookup_idx ON public.field_site_rates(organization_id, site_id, effective_at DESC);

CREATE TABLE public.attendance_selfie_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  object_path text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
  consumed_at timestamptz
);

ALTER TABLE public.attendance_sessions
  ADD COLUMN start_latitude double precision,
  ADD COLUMN start_longitude double precision,
  ADD COLUMN start_accuracy_m double precision,
  ADD COLUMN selfie_path text,
  ADD COLUMN selfie_captured_at timestamptz;

-- Existing clients use the API for writes. Prevent direct Supabase writes from
-- bypassing the camera requirement or manufacturing payable GPS arrivals.
REVOKE INSERT, UPDATE, DELETE ON public.attendance_sessions, public.gps_locations FROM anon, authenticated;

CREATE TABLE public.field_visit_states (
  organization_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  site_id uuid NOT NULL,
  armed boolean NOT NULL DEFAULT false,
  departed_at timestamptz,
  departure_session_id uuid REFERENCES public.attendance_sessions(id),
  last_recorded_at timestamptz,
  PRIMARY KEY (organization_id, employee_id, site_id),
  FOREIGN KEY (organization_id, site_id) REFERENCES public.field_sites(organization_id, id)
);

CREATE TABLE public.field_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  session_id uuid NOT NULL REFERENCES public.attendance_sessions(id),
  site_id uuid NOT NULL,
  arrival_point_id uuid NOT NULL REFERENCES public.gps_locations(id),
  arrived_at timestamptz NOT NULL,
  departed_from_at timestamptz NOT NULL,
  site_name text NOT NULL,
  rate_minor bigint NOT NULL,
  currency text NOT NULL,
  UNIQUE (site_id, arrival_point_id),
  FOREIGN KEY (organization_id, site_id) REFERENCES public.field_sites(organization_id, id)
);
CREATE INDEX field_visits_report_idx ON public.field_visits(organization_id, arrived_at, employee_id);
CREATE INDEX field_sites_org_idx ON public.field_sites(organization_id) WHERE is_active;

-- These tables are accessed through the authenticated API, never directly by
-- the browser/mobile Supabase client. Default-deny RLS and service-only RPCs.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['field_settings','field_sites','employee_basic_pay',
    'attendance_selfie_challenges','field_visit_states','field_visits','field_site_rates'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('attendance-selfies', 'attendance-selfies', false, 5242880, ARRAY['image/jpeg'])
ON CONFLICT (id) DO NOTHING;

CREATE FUNCTION public.field_distance_m(a double precision, b double precision,
  c double precision, d double precision) RETURNS double precision
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT 6371000 * 2 * asin(sqrt(least(1.0,
    power(sin(radians(c-a)/2),2) + cos(radians(a))*cos(radians(c))*power(sin(radians(d-b)/2),2))))
$$;

CREATE FUNCTION public.version_field_site() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.field_site_rates(organization_id, site_id, effective_at, rate_minor, site_name)
    VALUES (NEW.organization_id, NEW.id, NEW.created_at, NEW.visit_rate_minor, NEW.name);
  ELSE
    IF NEW.visit_rate_minor IS DISTINCT FROM OLD.visit_rate_minor OR NEW.name IS DISTINCT FROM OLD.name THEN
      INSERT INTO public.field_site_rates(organization_id, site_id, effective_at, rate_minor, site_name)
      VALUES (NEW.organization_id, NEW.id, clock_timestamp(), NEW.visit_rate_minor, NEW.name);
    END IF;
    IF ROW(NEW.latitude, NEW.longitude, NEW.arrival_radius_m, NEW.departure_radius_m, NEW.is_active)
      IS DISTINCT FROM ROW(OLD.latitude, OLD.longitude, OLD.arrival_radius_m, OLD.departure_radius_m, OLD.is_active) THEN
      -- Changing a geofence must not manufacture an arrival from old GPS fixes.
      UPDATE public.field_visit_states SET armed = false, departed_at = NULL, departure_session_id = NULL,
        last_recorded_at = greatest(last_recorded_at, clock_timestamp())
      WHERE organization_id = NEW.organization_id AND site_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER field_site_version AFTER INSERT OR UPDATE ON public.field_sites
FOR EACH ROW EXECUTE FUNCTION public.version_field_site();

-- Serialize points for an employee, ignore older/replayed points, and require
-- a confidently distant GPS observation before EACH arrival, including the
-- first. State survives check-out/restart: restarting a session is not a visit.
CREATE FUNCTION public.detect_field_visit() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE site public.field_sites; state public.field_visit_states;
  distance_m double precision; currency_code text; historical_rate public.field_site_rates;
BEGIN
  IF NEW.accuracy IS NULL OR NEW.accuracy < 0 OR NEW.accuracy > 100 THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text || NEW.employee_id::text, 0));
  IF NOT EXISTS (SELECT 1 FROM public.attendance_sessions a WHERE a.id = NEW.session_id
      AND a.organization_id = NEW.organization_id AND a.employee_id = NEW.employee_id
      AND a.selfie_path IS NOT NULL
      AND NEW.recorded_at >= a.checkin_at AND (a.checkout_at IS NULL OR NEW.recorded_at <= a.checkout_at))
    THEN RETURN NEW; END IF;
  SELECT currency INTO currency_code FROM public.field_settings WHERE organization_id = NEW.organization_id;
  IF currency_code IS NULL THEN RETURN NEW; END IF;
  FOR site IN SELECT * FROM public.field_sites WHERE organization_id = NEW.organization_id AND is_active
    AND created_at <= NEW.recorded_at ORDER BY id LOOP
    INSERT INTO public.field_visit_states(organization_id, employee_id, site_id)
    VALUES (NEW.organization_id, NEW.employee_id, site.id) ON CONFLICT DO NOTHING;
    SELECT * INTO state FROM public.field_visit_states WHERE organization_id = NEW.organization_id
      AND employee_id = NEW.employee_id AND site_id = site.id FOR UPDATE;
    IF state.last_recorded_at IS NOT NULL AND NEW.recorded_at <= state.last_recorded_at THEN CONTINUE; END IF;
    distance_m := public.field_distance_m(NEW.latitude, NEW.longitude, site.latitude, site.longitude);
    IF distance_m - NEW.accuracy >= site.departure_radius_m THEN
      -- Keep the last distant fix as evidence for the next arrival.
      state.armed := true; state.departed_at := NEW.recorded_at; state.departure_session_id := NEW.session_id;
    ELSIF distance_m + NEW.accuracy <= site.arrival_radius_m AND state.armed AND state.departure_session_id = NEW.session_id THEN
      SELECT * INTO historical_rate FROM public.field_site_rates WHERE organization_id = NEW.organization_id
        AND site_id = site.id AND effective_at <= NEW.recorded_at ORDER BY effective_at DESC, id DESC LIMIT 1;
      INSERT INTO public.field_visits(organization_id, employee_id, session_id, site_id,
        arrival_point_id, arrived_at, departed_from_at, site_name, rate_minor, currency)
      VALUES (NEW.organization_id, NEW.employee_id, NEW.session_id, site.id, NEW.id,
        NEW.recorded_at, state.departed_at, historical_rate.site_name, historical_rate.rate_minor, currency_code);
      state.armed := false;
    END IF;
    UPDATE public.field_visit_states SET armed = state.armed, departed_at = state.departed_at, departure_session_id = state.departure_session_id,
      last_recorded_at = NEW.recorded_at WHERE organization_id = NEW.organization_id
      AND employee_id = NEW.employee_id AND site_id = site.id;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER gps_field_visit AFTER INSERT ON public.gps_locations
FOR EACH ROW EXECUTE FUNCTION public.detect_field_visit();

CREATE FUNCTION public.camera_attendance_checkin(p_org uuid, p_employee uuid, p_challenge uuid,
  p_lat double precision, p_lng double precision, p_accuracy double precision,
  p_captured_at timestamptz) RETURNS public.attendance_sessions
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE challenge public.attendance_selfie_challenges; session public.attendance_sessions;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text || p_employee::text, 0));
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = p_employee AND organization_id = p_org AND is_active)
    THEN RAISE EXCEPTION 'Employee is not active in this organization' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.attendance_sessions WHERE employee_id = p_employee
    AND organization_id = p_org AND checkout_at IS NULL)
    THEN RAISE EXCEPTION 'You already have an active attendance session' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO challenge FROM public.attendance_selfie_challenges WHERE id = p_challenge
    AND organization_id = p_org AND employee_id = p_employee FOR UPDATE;
  IF challenge.id IS NULL OR challenge.consumed_at IS NOT NULL OR challenge.expires_at < now()
    OR p_captured_at < challenge.created_at - interval '30 seconds'
    OR p_captured_at > now() + interval '30 seconds' OR p_captured_at < now() - interval '2 minutes'
    THEN RAISE EXCEPTION 'Selfie expired or already used. Take a new photo.' USING ERRCODE = 'P0001'; END IF;
  IF p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 OR p_accuracy NOT BETWEEN 0 AND 100
    OR p_lat IS NULL OR p_lng IS NULL OR p_accuracy IS NULL OR p_captured_at IS NULL
    THEN RAISE EXCEPTION 'A valid, accurate GPS fix and capture time are required' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.attendance_sessions(organization_id, employee_id, start_latitude,
    start_longitude, start_accuracy_m, selfie_path, selfie_captured_at)
  VALUES (p_org, p_employee, p_lat, p_lng, p_accuracy, challenge.object_path, p_captured_at) RETURNING * INTO session;
  UPDATE public.attendance_selfie_challenges SET consumed_at = now() WHERE id = challenge.id;
  INSERT INTO public.gps_locations(organization_id, employee_id, session_id, latitude, longitude, accuracy, recorded_at)
  VALUES (p_org, p_employee, session.id, p_lat, p_lng, p_accuracy, session.checkin_at);
  RETURN session;
END $$;

-- Salary is monthly, NOT attendance-prorated. New salary changes may start in
-- the current/future month only; an ended month's basic pay cannot be rewritten.
CREATE FUNCTION public.set_employee_basic_pay(p_org uuid, p_employee uuid, p_month date, p_amount bigint)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE tz text;
BEGIN
  SELECT timezone INTO tz FROM public.field_settings WHERE organization_id = p_org;
  IF tz IS NULL THEN RAISE EXCEPTION 'Configure company settings first' USING ERRCODE = 'P0001'; END IF;
  IF p_month < date_trunc('month', now() AT TIME ZONE tz)::date THEN
    RAISE EXCEPTION 'Basic pay changes cannot rewrite a past month' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = p_employee AND organization_id = p_org) THEN
    RAISE EXCEPTION 'Employee not found in this organization' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.employee_basic_pay VALUES (p_org, p_employee, p_month, p_amount)
  ON CONFLICT (organization_id, employee_id, effective_month) DO UPDATE SET amount_minor = EXCLUDED.amount_minor;
END $$;

CREATE FUNCTION public.field_report(p_org uuid, p_from date, p_to date, p_monthly boolean, p_employee uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE tz text; code text; start_at timestamptz; end_at timestamptz; result jsonb;
BEGIN
  SELECT timezone, currency INTO tz, code FROM public.field_settings WHERE organization_id = p_org;
  IF tz IS NULL THEN RAISE EXCEPTION 'Configure company settings first' USING ERRCODE = 'P0001'; END IF;
  start_at := p_from::timestamp AT TIME ZONE tz;
  end_at := p_to::timestamp AT TIME ZONE tz;
  SELECT coalesce(jsonb_agg(row_data ORDER BY employee_name), '[]'::jsonb) INTO result FROM (
    SELECT e.name AS employee_name, jsonb_build_object(
      'employee_id', e.id, 'employee_name', e.name, 'employee_code', e.employee_code,
      'basic_pay_minor', CASE WHEN p_monthly THEN salary.amount_minor ELSE NULL END,
      'salary_configured', salary.amount_minor IS NOT NULL,
      'attendance_days', (SELECT count(DISTINCT (a.checkin_at AT TIME ZONE tz)::date)
        FROM public.attendance_sessions a WHERE a.organization_id = p_org AND a.employee_id = e.id
        AND a.checkin_at >= start_at AND a.checkin_at < end_at AND a.selfie_path IS NOT NULL),
      'attendance', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'checkin_at', a.checkin_at,
        'checkout_at', a.checkout_at, 'start_latitude', a.start_latitude, 'start_longitude', a.start_longitude,
        'selfie_available', a.selfie_path IS NOT NULL, 'selfie_captured_at', a.selfie_captured_at) ORDER BY a.checkin_at)
        FROM public.attendance_sessions a WHERE a.organization_id = p_org AND a.employee_id = e.id
        AND a.checkin_at >= start_at AND a.checkin_at < end_at), '[]'::jsonb),
      'visits', coalesce((SELECT jsonb_agg(jsonb_build_object('id', v.id, 'site_id', v.site_id,
        'site_name', v.site_name, 'arrived_at', v.arrived_at, 'departed_from_at', v.departed_from_at,
        'rate_minor', v.rate_minor) ORDER BY v.arrived_at) FROM public.field_visits v
        WHERE v.organization_id = p_org AND v.employee_id = e.id AND v.arrived_at >= start_at AND v.arrived_at < end_at), '[]'::jsonb),
      'visit_count', coalesce(totals.visit_count, 0), 'visit_pay_minor', coalesce(totals.amount, 0),
      'total_pay_minor', CASE WHEN p_monthly AND salary.amount_minor IS NOT NULL
        THEN salary.amount_minor + coalesce(totals.amount, 0) ELSE NULL END
    ) AS row_data FROM public.employees e
    LEFT JOIN LATERAL (SELECT b.amount_minor FROM public.employee_basic_pay b WHERE b.organization_id = p_org
      AND b.employee_id = e.id AND b.effective_month <= p_from ORDER BY b.effective_month DESC LIMIT 1) salary ON true
    LEFT JOIN LATERAL (SELECT count(*) AS visit_count, sum(v.rate_minor) AS amount FROM public.field_visits v
      WHERE v.organization_id = p_org AND v.employee_id = e.id AND v.arrived_at >= start_at AND v.arrived_at < end_at) totals ON true
    WHERE e.organization_id = p_org AND (p_employee IS NULL OR e.id = p_employee)
      AND (e.created_at < end_at)
  ) rows;
  RETURN jsonb_build_object('from', p_from, 'to_exclusive', p_to, 'timezone', tz, 'currency', code,
    'period', CASE WHEN p_monthly THEN 'month' ELSE 'week' END, 'employees', result);
END $$;

REVOKE ALL ON FUNCTION public.camera_attendance_checkin(uuid,uuid,uuid,double precision,double precision,double precision,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_employee_basic_pay(uuid,uuid,date,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.field_report(uuid,date,date,boolean,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.camera_attendance_checkin(uuid,uuid,uuid,double precision,double precision,double precision,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_employee_basic_pay(uuid,uuid,date,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.field_report(uuid,date,date,boolean,uuid) TO service_role;
