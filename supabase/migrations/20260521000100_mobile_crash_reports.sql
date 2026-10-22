CREATE TABLE IF NOT EXISTS public.mobile_crash_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.user_role NOT NULL,
  platform text NOT NULL CHECK (platform = 'android'),
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 255),
  raw_report text NOT NULL CHECK (length(raw_report) BETWEEN 1 AND 200000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mobile_crash_reports_org_created
  ON public.mobile_crash_reports (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mobile_crash_reports_user_created
  ON public.mobile_crash_reports (user_id, created_at DESC);

ALTER TABLE public.mobile_crash_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation_mobile_crash_reports"
  ON public.mobile_crash_reports;

CREATE POLICY "org_isolation_mobile_crash_reports"
  ON public.mobile_crash_reports FOR ALL
  USING (organization_id::text = coalesce(auth.jwt() ->> 'org_id', ''));
