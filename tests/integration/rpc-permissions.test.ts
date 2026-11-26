import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const EMPLOYEE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EMPLOYEE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SESSION_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const migrationPath = new URL("../../supabase/migrations/20261124000200_rpc_permissions_hardening.sql", import.meta.url);

// Exercise the checked-in functions and migration in an isolated PGlite database.
function functionDefinition(sql: string, name: string): string {
  const expression = new RegExp(`create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${name}\\s*\\([\\s\\S]*?\\$\\$\\s*;`, "i");
  const definition = sql.match(expression)?.[0];
  if (!definition) throw new Error(`Missing checked-in function: public.${name}`);
  return definition;
}

describe("FT-001: service-only SQL RPC permissions", () => {
  let db: PGlite;
  let hardeningSql: string;

  async function asRole<T extends Record<string, unknown>>(role: string, sql: string, parameters: unknown[] = []) {
    // Roles are fixed test constants, never request/user input.
    await db.exec(`SET ROLE ${role}`);
    try { return await db.query<T>(sql, parameters); }
    finally { await db.exec("RESET ROLE"); }
  }

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE employee_browser;
      GRANT authenticated TO employee_browser;
      CREATE ROLE service_role BYPASSRLS;
      CREATE ROLE supabase_auth_admin;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, employee_browser, service_role, supabase_auth_admin;
      -- Model both normal PUBLIC defaults and Supabase's additive schema grants.
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;

      CREATE TYPE public.user_role AS ENUM ('ADMIN', 'EMPLOYEE');
      CREATE SEQUENCE public.employee_code_seq;
      CREATE TABLE public.users (id uuid PRIMARY KEY, role public.user_role, organization_id uuid);
      CREATE TABLE public.employees (id uuid PRIMARY KEY, organization_id uuid, user_id uuid, name text,
        employee_code text, is_active boolean DEFAULT true);
      CREATE TABLE public.attendance_sessions (id uuid PRIMARY KEY, organization_id uuid, employee_id uuid,
        checkin_at timestamptz DEFAULT now(), checkout_at timestamptz, total_distance_km float8,
        total_duration_seconds integer, distance_recalculation_status text DEFAULT 'pending',
        created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
      CREATE TABLE public.gps_locations (employee_id uuid, organization_id uuid, latitude float8,
        longitude float8, recorded_at timestamptz DEFAULT now());
      CREATE TABLE public.employee_latest_sessions (employee_id uuid, organization_id uuid, status text, session_id uuid);
      CREATE TABLE public.employee_daily_metrics (employee_id uuid, organization_id uuid, date date, sessions integer DEFAULT 0,
        distance_km float8 DEFAULT 0, duration_seconds integer DEFAULT 0, expenses_count integer DEFAULT 0,
        expenses_amount numeric DEFAULT 0, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
        UNIQUE (employee_id, date));
      CREATE TABLE public.org_daily_metrics (organization_id uuid, date date, total_sessions integer DEFAULT 0,
        total_distance_km float8 DEFAULT 0, total_duration_seconds integer DEFAULT 0,
        created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), UNIQUE (organization_id, date));
      CREATE TABLE public.api_keys (id uuid PRIMARY KEY, active boolean DEFAULT true, revoked_at timestamptz,
        request_count bigint DEFAULT 0, error_count bigint DEFAULT 0, last_used_at timestamptz);

      INSERT INTO public.users VALUES ('${EMPLOYEE_A}', 'EMPLOYEE', '${ORG_A}');
      INSERT INTO public.employees VALUES ('${EMPLOYEE_A}', '${ORG_A}', '${EMPLOYEE_A}', 'Tenant A Employee', 'EMP-A', true),
        ('${EMPLOYEE_B}', '${ORG_B}', '${EMPLOYEE_B}', 'Tenant B Employee', 'EMP-B', true);
      INSERT INTO public.attendance_sessions (id, organization_id, employee_id)
        VALUES ('${SESSION_A}', '${ORG_A}', '${EMPLOYEE_A}'), ('${SESSION_B}', '${ORG_B}', '${EMPLOYEE_B}');
      INSERT INTO public.gps_locations (employee_id, organization_id, latitude, longitude)
        VALUES ('${EMPLOYEE_A}', '${ORG_A}', 19, 73), ('${EMPLOYEE_B}', '${ORG_B}', 20, 74);
      INSERT INTO public.employee_latest_sessions VALUES ('${EMPLOYEE_A}', '${ORG_A}', 'ACTIVE', '${SESSION_A}'),
        ('${EMPLOYEE_B}', '${ORG_B}', 'ACTIVE', '${SESSION_B}');
      INSERT INTO public.api_keys (id) VALUES ('${SESSION_A}');

      ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.gps_locations ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.employee_latest_sessions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.employee_daily_metrics ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.org_daily_metrics ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
      GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO service_role;
    `);

    const baseline = await readFile(new URL("../../supabase/migrations/00000000000000_baseline_schema.sql", import.meta.url), "utf8");
    for (const name of ["get_active_map_markers", "get_org_latest_sessions", "generate_employee_code",
      "increment_employee_session_metrics", "increment_employee_expense_metrics", "increment_org_session_metrics"])
      await db.exec(functionDefinition(baseline, name));
    const apiKeys = await readFile(new URL("../../supabase/migrations/20260413000100_api_keys_platform.sql", import.meta.url), "utf8");
    for (const name of ["increment_api_key_usage", "increment_api_key_error"]) await db.exec(functionDefinition(apiKeys, name));
    const hook = await readFile(new URL("../../supabase/migrations/20260325000200_phase28a_auth_hook_hardening.sql", import.meta.url), "utf8");
    await db.exec(functionDefinition(hook, "custom_access_token_hook"));
    await db.exec(`
      -- The old baseline grant applies to every function, including overloads.
      CREATE FUNCTION public.get_active_map_markers(text) RETURNS text LANGUAGE sql SECURITY DEFINER AS $$ SELECT 'overload'::text $$;
      CREATE FUNCTION public.audit_public_utility() RETURNS text LANGUAGE sql AS $$ SELECT 'safe utility'::text $$;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
      GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
    `);

    hardeningSql = await readFile(migrationPath, "utf8");
    await db.exec(hardeningSql);
  }, 60_000);

  afterAll(async () => { if (db) await db.close(); });

  it.each(["anon", "authenticated", "employee_browser"])("denies %s direct map/session RPC access, including an arbitrary tenant", async (role) => {
    for (const org of [ORG_A, ORG_B]) {
      await expect(asRole(role, "SELECT * FROM public.get_active_map_markers($1::uuid)", [org]))
        .rejects.toMatchObject({ code: "42501" });
      await expect(asRole(role, "SELECT * FROM public.get_org_latest_sessions($1::uuid)", [org]))
        .rejects.toMatchObject({ code: "42501" });
    }
  });

  it("removes both inherited PUBLIC and explicit authenticated grants from every protected overload", async () => {
    const signatures = [
      "public.get_active_map_markers(uuid,integer)", "public.get_active_map_markers(text)",
      "public.get_org_latest_sessions(uuid,text,integer,integer)", "public.generate_employee_code(text)",
      "public.increment_employee_session_metrics(uuid,uuid,date,double precision,integer)",
      "public.increment_employee_expense_metrics(uuid,uuid,date,numeric)",
      "public.increment_org_session_metrics(uuid,date,double precision,integer)",
      "public.increment_api_key_usage(uuid)", "public.increment_api_key_error(uuid)",
    ];
    for (const signature of signatures) {
      for (const role of ["anon", "authenticated", "employee_browser"])
        expect((await db.query<{ allowed: boolean }>("SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed", [role, signature])).rows[0]?.allowed)
          .toBe(false);
      expect((await db.query<{ allowed: boolean }>("SELECT has_function_privilege('service_role',$1,'EXECUTE') AS allowed", [signature])).rows[0]?.allowed)
        .toBe(true);
    }
  });

  it("preserves the backend service-role map query and its organization filter", async () => {
    const a = await asRole<{ employee_id: string; employee_name: string }>("service_role", "SELECT * FROM public.get_active_map_markers($1::uuid)", [ORG_A]);
    const b = await asRole<{ employee_id: string; employee_name: string }>("service_role", "SELECT * FROM public.get_active_map_markers($1::uuid)", [ORG_B]);
    expect(a.rows).toHaveLength(1); expect(a.rows[0]?.employee_id).toBe(EMPLOYEE_A);
    expect(b.rows).toHaveLength(1); expect(b.rows[0]?.employee_id).toBe(EMPLOYEE_B);
  });

  it("denies direct metric mutation but preserves trusted worker operations", async () => {
    await expect(asRole("authenticated", "SELECT public.increment_employee_expense_metrics($1::uuid,$2::uuid,current_date,25::numeric)", [EMPLOYEE_B, ORG_B]))
      .rejects.toMatchObject({ code: "42501" });
    await asRole("service_role", "SELECT public.increment_employee_expense_metrics($1::uuid,$2::uuid,current_date,25::numeric)", [EMPLOYEE_B, ORG_B]);
    expect((await db.query<{ expenses_count: number }>("SELECT expenses_count FROM public.employee_daily_metrics WHERE employee_id=$1", [EMPLOYEE_B])).rows[0]?.expenses_count).toBe(1);
    await asRole("service_role", "SELECT public.increment_api_key_usage($1::uuid)", [SESSION_A]);
    expect((await db.query<{ request_count: number }>("SELECT request_count FROM public.api_keys WHERE id=$1", [SESSION_A])).rows[0]?.request_count).toBe(1);
  });

  it("allows only the Supabase Auth admin to invoke the JWT hook", async () => {
    for (const role of ["anon", "authenticated", "service_role"])
      await expect(asRole(role, "SELECT public.custom_access_token_hook('{}'::jsonb)")).rejects.toMatchObject({ code: "42501" });
    const hook = await asRole<{ event: { claims: { role: string; org_id: string; employee_id: string } } }>(
      "supabase_auth_admin", "SELECT public.custom_access_token_hook($1::jsonb) AS event", [JSON.stringify({ userId: EMPLOYEE_A, claims: { sub: EMPLOYEE_A } })]);
    expect(hook.rows[0]?.event.claims).toMatchObject({ role: "EMPLOYEE", org_id: ORG_A, employee_id: EMPLOYEE_A });
  });

  it("does not revoke an unrelated existing public utility", async () => {
    const result = await asRole<{ value: string }>("anon", "SELECT public.audit_public_utility() AS value");
    expect(result.rows[0]?.value).toBe("safe utility");
  });

  it("uses deny-by-default execution for new functions, including additive schema defaults", async () => {
    await db.exec("CREATE FUNCTION public.audit_future_rpc() RETURNS text LANGUAGE sql SECURITY DEFINER AS $$ SELECT 'future'::text $$");
    for (const role of ["anon", "authenticated", "employee_browser"])
      await expect(asRole(role, "SELECT public.audit_future_rpc()")).rejects.toMatchObject({ code: "42501" });
    expect((await asRole<{ value: string }>("service_role", "SELECT public.audit_future_rpc() AS value")).rows[0]?.value).toBe("future");
  });

  it("can be reapplied and tolerates functions retired from the installed schema", async () => {
    await db.exec(hardeningSql);
    expect((await db.query<{ routine: string | null }>("SELECT to_regprocedure('public.backfill_feat1_snapshots()')::text AS routine")).rows[0]?.routine).toBeNull();
    await expect(asRole("anon", "SELECT * FROM public.get_active_map_markers($1::uuid)", [ORG_B])).rejects.toMatchObject({ code: "42501" });
    expect((await asRole<{ employee_name: string }>("service_role", "SELECT employee_name FROM public.get_active_map_markers($1::uuid)", [ORG_B])).rows[0]?.employee_name).toBe("Tenant B Employee");
  });
});
