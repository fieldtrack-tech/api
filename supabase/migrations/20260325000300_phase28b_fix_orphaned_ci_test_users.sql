-- ========================================================================
-- Phase 28b -- Fix Orphaned CI Test Users (2026-03-25)
-- ========================================================================
-- Three auth.users (rajashish147@gmail.com, admin@test.com,
-- employee@test.com) had no public.users rows.
-- The JWT hook silently skips users not in public.users, so their
-- JWTs never received role/org_id claims -> 401 on every CI call.
--
-- This migration inserts public.users rows for these accounts.
-- The fn_auto_create_employee trigger is disabled during execution
-- to avoid sequence-cache conflicts; the employees row is inserted
-- manually for the CI employee account.
-- ========================================================================

-- Disable the INSERT trigger temporarily to avoid sequence-cache
-- conflicts during the CI employee insert.
ALTER TABLE public.users DISABLE TRIGGER trg_auto_create_employee;

DO $$
DECLARE
  v_org_id UUID := 'a0000001-f001-4000-8000-000000000001';
BEGIN
  -- Personal developer account (rajashish147@gmail.com) -- ADMIN
  INSERT INTO public.users (id, organization_id, email, role)
  VALUES (
    'c9cd92b3-f281-4e59-9178-3d1a2038ded4',
    v_org_id,
    'rajashish147@gmail.com',
    'ADMIN'
  )
  ON CONFLICT (id) DO NOTHING;

  -- CI smoke test admin account (admin@test.com) -- ADMIN
  INSERT INTO public.users (id, organization_id, email, role)
  VALUES (
    '05ae375d-b8dd-4e5e-a660-422e85a0762f',
    v_org_id,
    'admin@test.com',
    'ADMIN'
  )
  ON CONFLICT (id) DO NOTHING;

  -- CI smoke test employee account (employee@test.com) -- EMPLOYEE
  INSERT INTO public.users (id, organization_id, email, role)
  VALUES (
    'da2dc04e-a3fe-4d88-89cf-7aa5f2817f73',
    v_org_id,
    'employee@test.com',
    'EMPLOYEE'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Create employees row for CI employee using a test-reserved code.
  -- 'CITEST01' cannot conflict with sequenced EMP#### production codes.
  INSERT INTO public.employees (
    id, organization_id, user_id, name,
    phone, employee_code, is_active,
    last_activity_at, created_at, updated_at
  )
  SELECT
    gen_random_uuid(),
    v_org_id,
    'da2dc04e-a3fe-4d88-89cf-7aa5f2817f73',
    'CI Test Employee',
    NULL,
    'CITEST01',
    TRUE,
    NULL,
    now(),
    now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.employees
    WHERE user_id = 'da2dc04e-a3fe-4d88-89cf-7aa5f2817f73'::uuid
  );
END;
$$;

-- Re-enable trigger for all future inserts
ALTER TABLE public.users ENABLE TRIGGER trg_auto_create_employee;
