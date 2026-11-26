-- Refresh employee tracking from the current shift so reordered jobs cannot
-- restore an old shift or overwrite a newer position with an older fix.
CREATE FUNCTION public.refresh_employee_tracking(p_org uuid, p_employee uuid)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  shift public.attendance_sessions;
  fix public.gps_locations;
  tracking boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text || p_employee::text, 0));
  SELECT * INTO shift FROM public.attendance_sessions
    WHERE organization_id = p_org AND employee_id = p_employee
    ORDER BY checkin_at DESC, id DESC LIMIT 1 FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  tracking := shift.checkout_at IS NULL AND EXISTS (
    SELECT 1 FROM public.employees WHERE organization_id = p_org AND id = p_employee AND is_active
  );
  SELECT * INTO fix FROM public.gps_locations
    WHERE organization_id = p_org AND employee_id = p_employee AND session_id = shift.id
      AND recorded_at BETWEEN public.field_evidence_cutoff() AND least(coalesce(shift.checkout_at, now()), now())
    ORDER BY recorded_at DESC LIMIT 1;

  INSERT INTO public.employee_last_state (
    employee_id, organization_id, last_session_id, is_checked_in, last_check_in_at,
    last_check_out_at, last_latitude, last_longitude, last_location_at
  ) VALUES (
    p_employee, p_org, shift.id, tracking, shift.checkin_at, shift.checkout_at,
    fix.latitude, fix.longitude, fix.recorded_at
  )
  ON CONFLICT (employee_id) DO UPDATE SET organization_id = EXCLUDED.organization_id,
    last_session_id = EXCLUDED.last_session_id, is_checked_in = EXCLUDED.is_checked_in,
    last_check_in_at = EXCLUDED.last_check_in_at, last_check_out_at = EXCLUDED.last_check_out_at,
    last_latitude = EXCLUDED.last_latitude, last_longitude = EXCLUDED.last_longitude,
    last_location_at = EXCLUDED.last_location_at;

  IF tracking THEN
    INSERT INTO public.active_users (employee_id, organization_id, session_id, last_seen_at)
    VALUES (p_employee, p_org, shift.id, coalesce(fix.recorded_at, shift.checkin_at))
    ON CONFLICT (employee_id) DO UPDATE SET session_id = EXCLUDED.session_id,
      last_seen_at = EXCLUDED.last_seen_at;
  ELSE
    DELETE FROM public.active_users WHERE organization_id = p_org AND employee_id = p_employee;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.refresh_employee_tracking(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_employee_tracking(uuid,uuid) TO service_role;
