-- Reports use company-local dates and keep monthly basic pay separate from visit earnings.
CREATE FUNCTION public.validate_field_report_cycle(p_from date, p_to date, p_period text)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_to)
    OR p_to - p_from NOT BETWEEN 1 AND 366 OR p_period IS NULL
    OR p_period NOT IN ('day', 'week', 'month', 'range')
    OR (p_period = 'day' AND p_to <> p_from + 1)
    OR (p_period = 'week' AND (extract(isodow FROM p_from) <> 1 OR p_to <> p_from + 7))
    OR (p_period = 'month' AND (extract(day FROM p_from) <> 1 OR p_to <> (p_from + interval '1 month')::date)) THEN
    RAISE EXCEPTION 'Invalid report period or date range.' USING ERRCODE = '22023';
  END IF;
END $$;

CREATE FUNCTION public.field_basic_pay_for_range(
  p_org uuid, p_employee uuid, p_created_at timestamptz, p_from date, p_to date, p_timezone text
) RETURNS TABLE (month date, amount_minor bigint) LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT m.month::date, b.amount_minor
  FROM generate_series(date_trunc('month', p_from::timestamp), p_to::timestamp, interval '1 month') m(month)
  LEFT JOIN LATERAL (
    SELECT b.amount_minor FROM public.employee_basic_pay b
    WHERE b.organization_id = p_org AND b.employee_id = p_employee AND b.effective_month <= m.month
    ORDER BY b.effective_month DESC LIMIT 1
  ) b ON true
  WHERE m.month >= p_from AND m.month + interval '1 month' <= p_to
    AND p_created_at < ((m.month + interval '1 month') AT TIME ZONE p_timezone);
$$;

CREATE FUNCTION public.field_report_cycle(
  p_org uuid, p_from date, p_to date, p_period text, p_employee uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  tz text;
  code text;
  start_at timestamptz;
  end_at timestamptz;
  report_at timestamptz := statement_timestamp();
  employee_rows jsonb;
BEGIN
  PERFORM public.validate_field_report_cycle(p_from, p_to, p_period);

  SELECT s.timezone, s.currency INTO tz, code FROM public.field_settings s WHERE s.organization_id = p_org;
  IF tz IS NULL THEN
    RAISE EXCEPTION 'Configure company settings first' USING ERRCODE = 'P0001';
  END IF;
  start_at := p_from::timestamp AT TIME ZONE tz;
  end_at := p_to::timestamp AT TIME ZONE tz;

  WITH employees AS MATERIALIZED (
    SELECT e.id, e.name, e.employee_code, e.created_at
    FROM public.employees e
    WHERE e.organization_id = p_org AND (p_employee IS NULL OR e.id = p_employee) AND e.created_at < end_at
  ),
  shifts AS MATERIALIZED (
    SELECT a.id, a.employee_id, a.checkin_at, a.checkout_at, a.start_latitude, a.start_longitude,
      a.selfie_path, a.selfie_verified, a.selfie_captured_at,
      least(a.checkout_at, report_at) AS worked_until
    FROM public.attendance_sessions a JOIN employees e ON e.id = a.employee_id
    WHERE a.organization_id = p_org AND a.checkin_at < end_at
      AND (a.checkin_at >= start_at OR (report_at > start_at AND (a.checkout_at IS NULL OR a.checkout_at > start_at)))
  ),
  shift_days AS (
    SELECT a.employee_id, d.day::date AS day,
      count(*) FILTER (WHERE a.checkin_at >= bounds.start_at) AS checkins,
      floor(sum(greatest(0, extract(epoch FROM
        least(a.worked_until, bounds.end_at) - greatest(a.checkin_at, bounds.start_at)))))::bigint AS seconds,
      bool_or(a.checkout_at IS NULL) AS open_shift
    FROM shifts a
    CROSS JOIN LATERAL generate_series(
      greatest(p_from, (a.checkin_at AT TIME ZONE tz)::date)::timestamp,
      least(p_to - 1, (greatest(a.checkin_at, a.worked_until) AT TIME ZONE tz)::date)::timestamp, interval '1 day'
    ) d(day)
    CROSS JOIN LATERAL (
      SELECT d.day AT TIME ZONE tz AS start_at, (d.day + interval '1 day') AT TIME ZONE tz AS end_at
    ) bounds
    WHERE a.checkin_at >= bounds.start_at OR a.worked_until > bounds.start_at
    GROUP BY a.employee_id, d.day
  ),
  attendance AS (
    SELECT a.employee_id, jsonb_agg(jsonb_build_object(
      'id', a.id, 'checkin_at', a.checkin_at, 'checkout_at', a.checkout_at,
      'start_latitude', a.start_latitude, 'start_longitude', a.start_longitude,
      'selfie_available', a.selfie_path IS NOT NULL, 'selfie_verified', a.selfie_verified,
      'selfie_captured_at', a.selfie_captured_at
    ) ORDER BY a.checkin_at, a.id) AS details
    FROM shifts a GROUP BY a.employee_id
  ),
  visits AS MATERIALIZED (
    SELECT v.id, v.employee_id, v.site_id, v.site_name, v.arrived_at, v.departed_from_at, v.rate_minor
    FROM public.field_visits v JOIN employees e ON e.id = v.employee_id
    WHERE v.organization_id = p_org AND v.arrived_at >= start_at AND v.arrived_at < end_at
  ),
  visit_days AS (
    SELECT v.employee_id, (v.arrived_at AT TIME ZONE tz)::date AS day,
      count(*) AS visits, sum(v.rate_minor) AS visit_pay
    FROM visits v GROUP BY v.employee_id, (v.arrived_at AT TIME ZONE tz)::date
  ),
  visit_details AS (
    SELECT v.employee_id, jsonb_agg(jsonb_build_object(
      'id', v.id, 'site_id', v.site_id, 'site_name', v.site_name, 'arrived_at', v.arrived_at,
      'departed_from_at', v.departed_from_at, 'rate_minor', v.rate_minor
    ) ORDER BY v.arrived_at, v.id) AS details
    FROM visits v GROUP BY v.employee_id
  ),
  daily_totals AS (
    SELECT coalesce(s.employee_id, v.employee_id) AS employee_id,
      coalesce(s.day, v.day) AS day, s.day IS NOT NULL AS attended,
      coalesce(s.checkins, 0) AS checkins, coalesce(s.seconds, 0) AS seconds,
      coalesce(s.open_shift, false) AS open_shift,
      coalesce(v.visits, 0) AS visits, coalesce(v.visit_pay, 0) AS visit_pay
    FROM shift_days s FULL OUTER JOIN visit_days v USING (employee_id, day)
  ),
  work AS (
    SELECT d.employee_id, count(*) FILTER (WHERE d.attended) AS attendance_days,
      sum(d.checkins) AS checkins, sum(d.seconds) AS seconds, bool_or(d.open_shift) AS open_shift,
      sum(d.visits) AS visits, sum(d.visit_pay) AS visit_pay,
      jsonb_agg(jsonb_build_object('date', d.day, 'attendance_count', d.checkins, 'worked_seconds', d.seconds,
        'has_open_shift', d.open_shift, 'visit_count', d.visits, 'visit_pay_minor', d.visit_pay) ORDER BY d.day) AS days
    FROM daily_totals d GROUP BY d.employee_id
  ),
  salary AS (
    SELECT e.id AS employee_id, bool_and(m.amount_minor IS NOT NULL) AS configured,
      sum(m.amount_minor) AS basic_pay,
      jsonb_agg(jsonb_build_object('month', m.month, 'amount_minor', m.amount_minor) ORDER BY m.month) AS months
    FROM employees e
    CROSS JOIN LATERAL public.field_basic_pay_for_range(p_org, e.id, e.created_at, p_from, p_to, tz) m
    GROUP BY e.id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'employee_id', e.id, 'employee_name', e.name, 'employee_code', e.employee_code,
    'attendance_days', coalesce(w.attendance_days, 0), 'attendance_count', coalesce(w.checkins, 0),
    'worked_seconds', coalesce(w.seconds, 0), 'has_open_shift', coalesce(w.open_shift, false),
    'days', coalesce(w.days, '[]'::jsonb), 'salary_configured', coalesce(s.configured, true),
    'basic_pay_minor', CASE WHEN s.configured THEN s.basic_pay END,
    'basic_pay_months', coalesce(s.months, '[]'::jsonb), 'visit_count', coalesce(w.visits, 0),
    'visit_pay_minor', coalesce(w.visit_pay, 0),
    'total_pay_minor', CASE WHEN s.configured IS DISTINCT FROM false THEN coalesce(s.basic_pay, 0) + coalesce(w.visit_pay, 0) END,
    'visits', coalesce(v.details, '[]'::jsonb), 'attendance', coalesce(a.details, '[]'::jsonb)
  ) ORDER BY e.name, e.id), '[]'::jsonb) INTO employee_rows
  FROM employees e
  LEFT JOIN work w ON w.employee_id = e.id
  LEFT JOIN attendance a ON a.employee_id = e.id
  LEFT JOIN visit_details v ON v.employee_id = e.id
  LEFT JOIN salary s ON s.employee_id = e.id;

  RETURN jsonb_build_object('from', p_from, 'to_exclusive', p_to, 'timezone', tz, 'currency', code,
    'period', p_period, 'employees', employee_rows);
END $$;

REVOKE ALL ON FUNCTION public.validate_field_report_cycle(date,date,text),
  public.field_basic_pay_for_range(uuid,uuid,timestamptz,date,date,text),
  public.field_report_cycle(uuid,date,date,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_field_report_cycle(date,date,text),
  public.field_basic_pay_for_range(uuid,uuid,timestamptz,date,date,text),
  public.field_report_cycle(uuid,date,date,text,uuid) TO service_role;
