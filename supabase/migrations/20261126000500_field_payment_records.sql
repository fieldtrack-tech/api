CREATE TABLE public.field_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  period_from date NOT NULL,
  to_exclusive date NOT NULL CHECK (to_exclusive > period_from),
  component text NOT NULL CHECK (component IN ('visits', 'basic', 'both')),
  currency text NOT NULL,
  basic_pay_minor bigint CHECK (basic_pay_minor >= 0),
  visit_pay_minor bigint NOT NULL CHECK (visit_pay_minor >= 0),
  total_pay_minor bigint GENERATED ALWAYS AS (coalesce(basic_pay_minor, 0) + visit_pay_minor) STORED,
  recorded_by text NOT NULL,
  reference text CHECK (length(reference) <= 160),
  request_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (organization_id, employee_id, request_id),
  UNIQUE (organization_id, employee_id, id),
  CHECK (coalesce(basic_pay_minor, 0) + visit_pay_minor > 0)
);
CREATE INDEX field_payments_history_idx ON public.field_payments(organization_id, employee_id, created_at DESC, id);

CREATE TABLE public.field_payment_visits (
  visit_id uuid PRIMARY KEY REFERENCES public.field_visits(id),
  payment_id uuid NOT NULL REFERENCES public.field_payments(id),
  rate_minor bigint NOT NULL
);

CREATE TABLE public.field_payment_months (
  organization_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  month date NOT NULL,
  payment_id uuid NOT NULL,
  amount_minor bigint NOT NULL,
  PRIMARY KEY (organization_id, employee_id, month),
  FOREIGN KEY (organization_id, employee_id, payment_id)
    REFERENCES public.field_payments(organization_id, employee_id, id)
);

ALTER TABLE public.field_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_payment_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_payment_months ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.field_payments, public.field_payment_visits, public.field_payment_months
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.field_payments TO service_role;

-- Both preview and recording select the same unpaid work and monthly amounts.
CREATE FUNCTION public.field_payment_candidates(
  p_org uuid, p_employee uuid, p_from date, p_to date, p_period text, p_component text
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  tz text;
  code text;
  employee_created_at timestamptz;
  visit_pay bigint;
  basic_pay bigint;
  visit_rows jsonb;
  month_rows jsonb;
  missing_months date[];
  total bigint;
BEGIN
  PERFORM public.validate_field_report_cycle(p_from, p_to, p_period);
  IF p_component IS NULL OR p_component NOT IN ('visits', 'basic', 'both') THEN
    RAISE EXCEPTION 'Invalid payment component.' USING ERRCODE = '22023';
  END IF;
  SELECT s.timezone, s.currency INTO tz, code FROM public.field_settings s WHERE s.organization_id = p_org;
  IF tz IS NULL THEN
    RAISE EXCEPTION 'Configure company settings first' USING ERRCODE = 'P0001';
  END IF;
  SELECT e.created_at INTO employee_created_at FROM public.employees e WHERE e.organization_id = p_org AND e.id = p_employee;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found in this organization.' USING ERRCODE = 'P0002';
  END IF;

  SELECT coalesce(sum(v.rate_minor), 0), coalesce(jsonb_agg(jsonb_build_object('visit_id', v.id, 'rate_minor', v.rate_minor)), '[]'::jsonb)
  INTO visit_pay, visit_rows
  FROM public.field_visits v
  WHERE p_component IN ('visits', 'both')
    AND v.organization_id = p_org AND v.employee_id = p_employee AND v.arrived_at >= (p_from::timestamp AT TIME ZONE tz)
    AND v.arrived_at < (p_to::timestamp AT TIME ZONE tz) AND v.rate_minor > 0
    AND NOT EXISTS (SELECT 1 FROM public.field_payment_visits p WHERE p.visit_id = v.id);

  SELECT sum(m.amount_minor),
    coalesce(jsonb_agg(jsonb_build_object('month', m.month, 'amount_minor', m.amount_minor))
      FILTER (WHERE m.amount_minor > 0), '[]'::jsonb),
    coalesce(array_agg(m.month ORDER BY m.month) FILTER (WHERE m.amount_minor IS NULL), ARRAY[]::date[])
  INTO basic_pay, month_rows, missing_months
  FROM public.field_basic_pay_for_range(p_org, p_employee, employee_created_at, p_from, p_to, tz) m
  WHERE p_component IN ('basic', 'both')
    AND NOT EXISTS (SELECT 1 FROM public.field_payment_months p
      WHERE p.organization_id = p_org AND p.employee_id = p_employee AND p.month = m.month);

  IF cardinality(missing_months) = 0 THEN
    total := coalesce(basic_pay, 0) + visit_pay;
  ELSE
    basic_pay := NULL;
  END IF;

  RETURN jsonb_build_object('employee_id', p_employee, 'from', p_from, 'to_exclusive', p_to, 'currency', code,
    'basic_pay_minor', basic_pay, 'visit_pay_minor', visit_pay, 'total_pay_minor', total,
    'visit_count', jsonb_array_length(visit_rows), 'missing_salary_months', missing_months,
    'recordable', coalesce(total > 0, false),
    'reason', CASE WHEN total IS NULL THEN 'Set basic pay for the included calendar months or record visit pay separately.'
      WHEN total = 0 THEN 'There is no outstanding pay for this selection.' END,
    'visits', visit_rows, 'months', month_rows);
END $$;

CREATE FUNCTION public.preview_field_payment(
  p_org uuid, p_employee uuid, p_from date, p_to date, p_period text, p_component text
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.field_payment_candidates(p_org, p_employee, p_from, p_to, p_period, p_component) - 'visits' - 'months';
$$;

CREATE FUNCTION public.record_field_payment(
  p_org uuid, p_employee uuid, p_from date, p_to date, p_period text, p_component text,
  p_actor text, p_expected_total bigint, p_reference text, p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  payment public.field_payments;
  candidates jsonb;
  reference text := nullif(trim(p_reference), '');
BEGIN
  PERFORM public.validate_field_report_cycle(p_from, p_to, p_period);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text || p_employee::text, 0));

  SELECT * INTO payment FROM public.field_payments p
  WHERE p.organization_id = p_org AND p.employee_id = p_employee AND p.request_id = p_request_id;
  IF FOUND THEN
    IF ROW(payment.period_from, payment.to_exclusive, payment.component, payment.total_pay_minor, payment.reference)
      IS DISTINCT FROM ROW(p_from, p_to, p_component, p_expected_total, reference) THEN
      RAISE EXCEPTION 'This request ID has already been used for a different payment.' USING ERRCODE = '22023';
    END IF;
  ELSE
    candidates := public.field_payment_candidates(p_org, p_employee, p_from, p_to, p_period, p_component);
    IF NOT (candidates->>'recordable')::boolean THEN
      RAISE EXCEPTION '%', candidates->>'reason' USING ERRCODE = '22023';
    END IF;
    IF (candidates->>'total_pay_minor')::bigint IS DISTINCT FROM p_expected_total THEN
      RAISE EXCEPTION 'The outstanding amount changed. Refresh the payment preview and try again.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.field_payments(organization_id, employee_id, period_from, to_exclusive, component, currency,
      basic_pay_minor, visit_pay_minor, recorded_by, reference, request_id)
    VALUES (p_org, p_employee, p_from, p_to, p_component, candidates->>'currency',
      (candidates->>'basic_pay_minor')::bigint, (candidates->>'visit_pay_minor')::bigint, p_actor, reference, p_request_id)
    RETURNING * INTO payment;

    INSERT INTO public.field_payment_visits(visit_id, payment_id, rate_minor)
    SELECT v.visit_id, payment.id, v.rate_minor
    FROM jsonb_to_recordset(candidates->'visits') AS v(visit_id uuid, rate_minor bigint);

    INSERT INTO public.field_payment_months(organization_id, employee_id, month, payment_id, amount_minor)
    SELECT p_org, p_employee, m.month, payment.id, m.amount_minor
    FROM jsonb_to_recordset(candidates->'months') AS m(month date, amount_minor bigint);
  END IF;
  RETURN to_jsonb(payment) - 'organization_id' - 'period_from' - 'request_id'
    || jsonb_build_object('from', payment.period_from);
END $$;

-- Previously paid salary months keep their recorded rate. A later effective
-- month can change the rate without reopening an earlier payment.
CREATE OR REPLACE FUNCTION public.set_employee_basic_pay(p_org uuid, p_employee uuid, p_month date, p_amount bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  tz text;
  next_month date;
BEGIN
  SELECT s.timezone INTO tz FROM public.field_settings s WHERE s.organization_id = p_org;
  IF tz IS NULL THEN RAISE EXCEPTION 'Configure company settings first' USING ERRCODE = 'P0001'; END IF;
  IF p_month < date_trunc('month', now() AT TIME ZONE tz)::date THEN
    RAISE EXCEPTION 'Basic pay changes cannot rewrite a past month' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = p_employee AND organization_id = p_org) THEN
    RAISE EXCEPTION 'Employee not found in this organization' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text || p_employee::text, 0));
  SELECT min(b.effective_month) INTO next_month FROM public.employee_basic_pay b
  WHERE b.organization_id = p_org AND b.employee_id = p_employee AND b.effective_month > p_month;
  IF EXISTS (SELECT 1 FROM public.field_payment_months p WHERE p.organization_id = p_org AND p.employee_id = p_employee
    AND p.month >= p_month AND (next_month IS NULL OR p.month < next_month) AND p.amount_minor IS DISTINCT FROM p_amount) THEN
    RAISE EXCEPTION 'Basic pay has already been recorded for a month affected by this change. Choose a later effective month.'
      USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.employee_basic_pay(organization_id, employee_id, effective_month, amount_minor)
  VALUES (p_org, p_employee, p_month, p_amount)
  ON CONFLICT (organization_id, employee_id, effective_month) DO UPDATE SET amount_minor = EXCLUDED.amount_minor;
END $$;

REVOKE ALL ON FUNCTION public.field_payment_candidates(uuid,uuid,date,date,text,text),
  public.preview_field_payment(uuid,uuid,date,date,text,text),
  public.record_field_payment(uuid,uuid,date,date,text,text,text,bigint,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preview_field_payment(uuid,uuid,date,date,text,text),
  public.record_field_payment(uuid,uuid,date,date,text,text,text,bigint,text,uuid) TO service_role;
