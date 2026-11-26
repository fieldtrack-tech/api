import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FieldPayment, FieldPaymentPreview, FieldReport } from "../../src/modules/field-operations/field-operations.schema.js";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const EMPLOYEE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NO_BASIC = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_EMPLOYEE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SITE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OLD_SHIFT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const NEW_SHIFT = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const OLD_POINT = "aaaabbbb-cccc-4ddd-8eee-ffff11112222";
const VISIT = "bbaaabba-bbbb-4bbb-8bbb-bbbb11112222";
const REQUEST = "faabaaaa-aaaa-4aaa-8aaa-aaaa11112222";

describe("field reporting, payment history and evidence retention", () => {
  let db: PGlite;
  const migration = (name: string) =>
    readFile(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), "utf8");

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      CREATE TABLE public.organizations(id uuid PRIMARY KEY);
      CREATE TABLE public.employees(id uuid PRIMARY KEY, organization_id uuid REFERENCES organizations(id),
        name text, employee_code text, is_active boolean DEFAULT true, created_at timestamptz);
      CREATE TABLE public.attendance_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid REFERENCES organizations(id), employee_id uuid REFERENCES employees(id),
        checkin_at timestamptz DEFAULT now(), checkout_at timestamptz);
      CREATE TABLE public.gps_locations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES organizations(id),
        employee_id uuid REFERENCES employees(id), session_id uuid REFERENCES attendance_sessions(id), latitude float8, longitude float8,
        accuracy float8, recorded_at timestamptz, sequence_number integer, UNIQUE(session_id, recorded_at));
      CREATE TABLE public.employee_last_state(employee_id uuid PRIMARY KEY, last_latitude float8,
        last_longitude float8, last_location_at timestamptz);
      CREATE TABLE public.mobile_crash_reports(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz);
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
    `);
    for (const name of ["20261124000100_field_operations", "20261126000100_field_arrival_live",
      "20261126000200_field_trip_integrity", "20261126000300_field_report_cycle",
      "20261126000400_field_evidence_retention", "20261126000500_field_payment_records"]) {
      await db.exec(await migration(name));
    }
    await db.exec(`
      INSERT INTO organizations VALUES ('${ORG}'), ('${OTHER_ORG}');
      INSERT INTO employees(id, organization_id, name, employee_code, created_at) VALUES
        ('${EMPLOYEE}', '${ORG}', 'Employee', 'E1', '2023-01-01'),
        ('${NO_BASIC}', '${ORG}', 'Other employee', 'E2', '2024-01-15'),
        ('${OTHER_EMPLOYEE}', '${OTHER_ORG}', 'Outside tenant', 'E3', '2023-01-01');
      INSERT INTO field_settings(organization_id, currency, timezone)
        VALUES ('${ORG}', 'INR', 'Asia/Kolkata'), ('${OTHER_ORG}', 'USD', 'America/New_York');
      INSERT INTO field_sites(id, organization_id, name, latitude, longitude, arrival_radius_m, departure_radius_m, visit_rate_minor, created_at)
        VALUES ('${SITE}', '${ORG}', 'Warehouse', 19, 73, 100, 300, 8500, '2023-01-01');
      INSERT INTO attendance_selfie_challenges(organization_id, employee_id, object_path, created_at, expires_at, consumed_at)
        VALUES ('${ORG}', '${EMPLOYEE}', 'old.jpg', '2024-01-31T18:00Z', '2024-01-31T18:05Z', '2024-01-31T18:04Z'),
          ('${ORG}', '${EMPLOYEE}', 'unused.jpg', now() - interval '2 days', now() - interval '2 days' + interval '5 minutes', NULL),
          ('${ORG}', '${EMPLOYEE}', 'recent-unused.jpg', now() - interval '1 hour', now() - interval '55 minutes', NULL),
          ('${ORG}', '${EMPLOYEE}', 'recent.jpg', now() - interval '2 hours', now() - interval '2 hours' + interval '5 minutes', now() - interval '2 hours');
      INSERT INTO attendance_sessions(id, organization_id, employee_id, checkin_at, checkout_at, selfie_path,
        start_latitude, start_longitude, start_accuracy_m) VALUES
        ('${OLD_SHIFT}', '${ORG}', '${EMPLOYEE}', '2024-01-31T18:00Z', '2024-01-31T20:00Z', 'old.jpg', 19, 73, 8),
        ('${NEW_SHIFT}', '${ORG}', '${EMPLOYEE}', now() - interval '2 hours', NULL, 'recent.jpg', 19, 73, 8);
      INSERT INTO attendance_sessions(organization_id, employee_id, checkin_at, checkout_at) VALUES
        ('${ORG}', '${EMPLOYEE}', '2024-02-01T05:00Z', '2024-02-01T07:00Z');
      INSERT INTO gps_locations(id, organization_id, employee_id, session_id, latitude, longitude, accuracy, recorded_at)
        VALUES ('${OLD_POINT}', '${ORG}', '${EMPLOYEE}', '${OLD_SHIFT}', 19, 73, 8, '2024-01-31T19:00Z'),
          (gen_random_uuid(), '${ORG}', '${EMPLOYEE}', '${NEW_SHIFT}', 19, 73, 8, now() - interval '1 minute');
      INSERT INTO field_visits(id, organization_id, employee_id, session_id, site_id, arrival_point_id, arrived_at,
        site_name, rate_minor, currency)
        VALUES ('${VISIT}', '${ORG}', '${EMPLOYEE}', '${OLD_SHIFT}', '${SITE}', '${OLD_POINT}',
          '2024-01-31T19:00Z', 'Warehouse', 8500, 'INR');
      INSERT INTO employee_basic_pay VALUES ('${ORG}', '${EMPLOYEE}', '2024-01-01', 3000000),
        ('${ORG}', '${EMPLOYEE}', '2024-02-01', 3500000);
      INSERT INTO employee_last_state VALUES ('${EMPLOYEE}', 19, 73, '2024-01-31T19:00Z');
      INSERT INTO mobile_crash_reports(created_at) VALUES ('2024-01-31T19:00Z'), (now());
    `);
  }, 30_000);

  afterAll(async () => { await db?.close(); });

  async function report(from: string, to: string, period: string, employee: string | null = EMPLOYEE) {
    const result = await db.query<{ report: FieldReport }>("SELECT field_report_cycle($1,$2,$3,$4,$5) AS report",
      [ORG, from, to, period, employee]);
    return result.rows[0]!.report;
  }

  async function preview(from: string, to: string, period: string, component = "both") {
    const result = await db.query<{ payment: FieldPaymentPreview }>(
      "SELECT preview_field_payment($1,$2,$3,$4,$5,$6) AS payment", [ORG, EMPLOYEE, from, to, period, component]);
    return result.rows[0]!.payment;
  }

  it("splits work at local midnight, counts check-ins once and includes legacy attendance", async () => {
    const january = (await report("2024-01-31", "2024-02-01", "day")).employees[0];
    expect(january).toMatchObject({ attendance_days: 1, attendance_count: 1, worked_seconds: 1800, visit_count: 0 });
    const february = (await report("2024-02-01", "2024-02-02", "day")).employees[0];
    expect(february).toMatchObject({ attendance_days: 1, attendance_count: 1, worked_seconds: 12600,
      basic_pay_minor: null, visit_count: 1, visit_pay_minor: 8500, total_pay_minor: 8500 });
    expect(february?.attendance).toHaveLength(2);
    expect(february?.days).toEqual([{ date: "2024-02-01", attendance_count: 1, worked_seconds: 12600,
      has_open_shift: false, visit_count: 1, visit_pay_minor: 8500 }]);
    const week = (await report("2024-01-29", "2024-02-05", "week")).employees[0];
    expect(week).toMatchObject({ attendance_days: 2, attendance_count: 2, worked_seconds: 14400, total_pay_minor: 8500 });
  });

  it("adds full calendar months at their own rates and scopes every report to the company", async () => {
    const cycle = await report("2024-01-01", "2024-03-01", "range", null);
    expect(cycle.employees).toHaveLength(2);
    expect(cycle.employees[0]).toMatchObject({ employee_id: EMPLOYEE, basic_pay_minor: 6500000, total_pay_minor: 6508500,
      basic_pay_months: [{ month: "2024-01-01", amount_minor: 3000000 }, { month: "2024-02-01", amount_minor: 3500000 }] });
    expect(cycle.employees[1]).toMatchObject({ employee_id: NO_BASIC, salary_configured: false, total_pay_minor: null });
    expect((await report("2024-02-01", "2024-03-01", "month", OTHER_EMPLOYEE)).employees).toEqual([]);
    await expect(report("2024-02-01", "2024-02-08", "week")).rejects.toThrow(/invalid report period/i);
  });

  it("shows live work hours while excluding time before check-in and after the report is read", async () => {
    const result = await db.query<{ dates: { today: string; tomorrow: string } }>(`
      SELECT jsonb_build_object('today', local_date, 'tomorrow', local_date + 1) AS dates
      FROM (SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS local_date) local
    `);
    const { today, tomorrow } = result.rows[0]!.dates;
    const row = (await report(today, tomorrow, "day")).employees[0];
    expect(row?.has_open_shift).toBe(true);
    expect(row?.worked_seconds).toBeGreaterThanOrEqual(0);
    expect(row?.worked_seconds).toBeLessThan(7205);
  });

  it("records visit and monthly pay once, makes retries idempotent and rejects stale previews", async () => {
    expect(await preview("2024-02-01", "2024-02-02", "day")).toMatchObject({ total_pay_minor: 8500, visit_count: 1, recordable: true });
    async function record(from: string, to: string, period: string, component: string, expected: number, id: string | null) {
      const result = await db.query<{ payment: FieldPayment }>(
        "SELECT record_field_payment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS payment",
        [ORG, EMPLOYEE, from, to, period, component, "admin", expected, "bank ref", id]);
      return result.rows[0]!.payment;
    }
    await expect(record("2024-02-01", "2024-02-02", "day", "visits", 8400, REQUEST)).rejects.toThrow(/amount changed/i);
    const payment = await record("2024-02-01", "2024-02-02", "day", "visits", 8500, REQUEST);
    expect(payment).toMatchObject({ from: "2024-02-01", total_pay_minor: 8500, reference: "bank ref" });
    expect(await record("2024-02-01", "2024-02-02", "day", "visits", 8500, REQUEST)).toEqual(payment);
    await expect(record("2024-02-01", "2024-02-02", "day", "visits", 8500, null)).rejects.toThrow(/no outstanding pay/i);
    expect(await preview("2024-02-01", "2024-03-01", "month")).toMatchObject({ basic_pay_minor: 3500000, visit_pay_minor: 0, total_pay_minor: 3500000 });
    await record("2024-02-01", "2024-03-01", "month", "both", 3500000, null);
    expect(await preview("2024-01-01", "2024-03-01", "range")).toMatchObject({ visit_pay_minor: 0, total_pay_minor: 3000000 });
  });

  it("prunes GPS evidence but keeps attendance, verified visits and recorded amounts", async () => {
    const pruned = await db.query<{ counts: Record<string, number> }>("SELECT prune_field_evidence() AS counts");
    expect(pruned.rows[0]?.counts).toMatchObject({ gps: 1, checkins: 1, snapshots: 1, crash_reports: 1, more: false });
    const expired = await db.query<{ paths: string[] }>("SELECT field_selfies_for_cleanup() AS paths");
    expect(expired.rows[0]?.paths).toEqual(["old.jpg", "unused.jpg"]);
    await db.query("SELECT complete_field_selfie_cleanup($1)", [expired.rows[0]?.paths]);
    expect((await db.query("SELECT selfie_path, gps_history_pruned FROM attendance_sessions WHERE id=$1", [OLD_SHIFT])).rows[0])
      .toEqual({ selfie_path: null, gps_history_pruned: true });
    expect((await db.query("SELECT arrival_point_id FROM field_visits WHERE id=$1", [VISIT])).rows[0]).toEqual({ arrival_point_id: null });
    expect((await db.query("SELECT id FROM gps_locations")).rows).toHaveLength(1);
    expect((await db.query("SELECT object_path FROM attendance_selfie_challenges ORDER BY object_path")).rows)
      .toEqual([{ object_path: "recent-unused.jpg" }, { object_path: "recent.jpg" }]);
    const oldReport = (await report("2024-02-01", "2024-03-01", "month")).employees[0];
    expect(oldReport).toMatchObject({ worked_seconds: 12600, visit_pay_minor: 8500, total_pay_minor: 3508500 });
    expect(oldReport?.attendance[0]).toMatchObject({ selfie_available: false, selfie_verified: true, start_latitude: null });
    expect((await db.query("SELECT total_pay_minor FROM field_payments ORDER BY total_pay_minor")).rows)
      .toEqual([{ total_pay_minor: 8500 }, { total_pay_minor: 3500000 }]);
    expect((await db.query<{ counts: Record<string, number> }>("SELECT prune_field_evidence() AS counts")).rows[0]?.counts)
      .toMatchObject({ gps: 0, checkins: 0, crash_reports: 0 });
  });

  it("preserves a recorded basic rate when a later salary change is made", async () => {
    const result = await db.query<{ dates: { current: string; next: string; after: string } }>(`
      SELECT jsonb_build_object('current', month, 'next', month + interval '1 month',
        'after', month + interval '2 months') AS dates
      FROM (SELECT date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date AS month) local
    `);
    const dates = result.rows[0]!.dates;
    const current = dates.current.slice(0, 10);
    const next = dates.next.slice(0, 10);
    const after = dates.after.slice(0, 10);
    await db.query("SELECT set_employee_basic_pay($1,$2,$3,4500000)", [ORG, EMPLOYEE, current]);
    await db.query("SELECT record_field_payment($1,$2,$3,$4,'month','basic','admin',4500000,NULL,NULL)", [ORG, EMPLOYEE, current, next]);
    await expect(db.query("SELECT set_employee_basic_pay($1,$2,$3,4600000)", [ORG, EMPLOYEE, current]))
      .rejects.toThrow(/already been recorded/i);
    await db.query("SELECT set_employee_basic_pay($1,$2,$3,4600000)", [ORG, EMPLOYEE, next]);
    expect((await report(current, next, "month")).employees[0]?.basic_pay_minor).toBe(4500000);
    expect((await report(next, after, "month")).employees[0]?.basic_pay_minor).toBe(4600000);
  });

  it("permits the backend service and denies direct client report, retention and payment access", async () => {
    const access = await db.query(`SELECT
      has_function_privilege('authenticated', 'field_report_cycle(uuid,date,date,text,uuid)', 'execute') AS client_report,
      has_function_privilege('anon', 'prune_field_evidence()', 'execute') AS client_retention,
      has_table_privilege('authenticated', 'field_payments', 'select') AS client_payment,
      has_table_privilege('service_role', 'field_payments', 'update') AS backend_update`);
    expect(access.rows[0]).toEqual({ client_report: false, client_retention: false, client_payment: false, backend_update: false });
    await db.exec("SET ROLE service_role");
    try {
      expect((await preview("2024-02-01", "2024-02-02", "day")).recordable).toBe(false);
      expect((await report("2024-02-01", "2024-02-02", "day")).employees).toHaveLength(1);
      await expect(db.query("SELECT prune_field_evidence()")).resolves.toBeDefined();
    } finally { await db.exec("RESET ROLE"); }
  });

  it("retains every attendance day and earning above the ordinary row limit", async () => {
    const fleet = await db.query<{ id: string }>("INSERT INTO organizations VALUES (gen_random_uuid()) RETURNING id");
    const organization = fleet.rows[0]!.id;
    await db.query("INSERT INTO field_settings(organization_id,currency,timezone) VALUES ($1,'INR','Asia/Kolkata')", [organization]);
    await db.query(`
      INSERT INTO employees(id, organization_id, name, employee_code, created_at)
      SELECT gen_random_uuid(), $1, 'Employee ' || i, 'F' || i, '2023-01-01'
      FROM generate_series(1, 520) AS i
    `, [organization]);
    const sites = await db.query<{ id: string }>(`
      INSERT INTO field_sites(organization_id,name,latitude,longitude,arrival_radius_m,departure_radius_m,visit_rate_minor,created_at)
      VALUES ($1,'Fleet Site',19,73,100,300,2600,'2023-01-01') RETURNING id
    `, [organization]);
    const site = sites.rows[0]!.id;
    await db.query(`
      WITH shifts AS (
        INSERT INTO attendance_sessions(organization_id,employee_id,checkin_at,checkout_at)
        SELECT e.organization_id, e.id, d, d + interval '5 hours'
        FROM employees e CROSS JOIN generate_series('2024-02-05T05:00Z'::timestamptz, '2024-02-11T05:00Z', interval '1 day') AS d
        WHERE e.organization_id = $1
        RETURNING id, organization_id, employee_id, checkin_at
      )
      INSERT INTO field_visits(organization_id,employee_id,session_id,site_id,arrived_at,site_name,rate_minor,currency)
      SELECT s.organization_id,s.employee_id,s.id,$2,s.checkin_at + interval '1 hour','Fleet Site',2600,'INR' FROM shifts s
    `, [organization, site]);
    const result = await db.query<{ report: FieldReport }>(
      "SELECT field_report_cycle($1,'2024-02-05','2024-02-12','week') AS report", [organization]);
    const rows = result.rows[0]!.report.employees;
    expect(rows).toHaveLength(520);
    for (const row of rows) {
      expect(row).toMatchObject({ attendance_days: 7, attendance_count: 7, worked_seconds: 126000,
        visit_count: 7, basic_pay_minor: null, visit_pay_minor: 18200, total_pay_minor: 18200 });
      expect(row.days).toHaveLength(7);
      expect(row.visits).toHaveLength(7);
      expect(row.attendance).toHaveLength(7);
    }
  });
});
