// Isolated PostgreSQL (PGlite) verification. No .env, network, Supabase project,
// or production data is used. Install PGlite in a temporary directory, then
// set FIELDTRACK_PGLITE_MODULE to its dist/index.js file URL to run this script.
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const { PGlite } = await import(process.env.FIELDTRACK_PGLITE_MODULE ?? "@electric-sql/pglite");
const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE public.organizations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
    CREATE TABLE public.employees(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES organizations(id),
      name text, employee_code text, is_active boolean DEFAULT true, created_at timestamptz DEFAULT now());
    CREATE TABLE public.attendance_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES organizations(id),
      employee_id uuid REFERENCES employees(id), checkin_at timestamptz DEFAULT now(), checkout_at timestamptz,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), total_distance_km float8, total_duration_seconds integer,
      distance_recalculation_status text DEFAULT 'pending');
    CREATE TABLE public.gps_locations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES organizations(id),
      employee_id uuid REFERENCES employees(id), session_id uuid REFERENCES attendance_sessions(id), latitude float8, longitude float8,
      accuracy float8, recorded_at timestamptz, UNIQUE(session_id, recorded_at));
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/20261124000100_field_operations.sql", import.meta.url), "utf8"));
  const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const org = (await scalar("INSERT INTO organizations(name) VALUES('Test') RETURNING id")).id;
  const otherOrg = (await scalar("INSERT INTO organizations(name) VALUES('Other') RETURNING id")).id;
  const employee = (await scalar("INSERT INTO employees(organization_id,name,employee_code,created_at) VALUES($1,'Employee','EMP1',now()-interval '1 year') RETURNING id", [org])).id;
  const noSalaryEmployee = (await scalar("INSERT INTO employees(organization_id,name,employee_code,created_at) VALUES($1,'No salary','EMP2',now()-interval '1 year') RETURNING id", [org])).id;
  await db.query("INSERT INTO field_settings(organization_id,currency,timezone) VALUES($1,'INR','Asia/Kolkata')", [org]);
  const site = (await scalar(`INSERT INTO field_sites(organization_id,name,latitude,longitude,arrival_radius_m,departure_radius_m,visit_rate_minor,created_at)
    VALUES($1,'Warehouse',0,0,100,500,12500,now()-interval '3 hours') RETURNING id`, [org])).id;
  const session = (await scalar(`INSERT INTO attendance_sessions(organization_id,employee_id,checkin_at,selfie_path)
    VALUES($1,$2,now()-interval '2 hours','private.jpg') RETURNING id`, [org, employee])).id;
  let serial = 0;
  const point = async (lat, ageMinutes, accuracy = 5) => {
    await db.query(`INSERT INTO gps_locations(organization_id,employee_id,session_id,latitude,longitude,accuracy,recorded_at)
      VALUES($1,$2,$3,$4,0,$5,clock_timestamp()-($6::text || ' minutes')::interval+($7::text || ' milliseconds')::interval)`,
      [org, employee, session, lat, accuracy, ageMinutes, ++serial]);
  };
  const visits = async () => (await db.query("SELECT * FROM field_visits ORDER BY arrived_at")).rows;
  await point(0, 55); assert.equal((await visits()).length, 0, "first onsite fix is not a distant-origin visit");
  await point(0.01, 54); await point(0, 53); await point(0, 52); await point(0.001, 51);
  assert.equal((await visits()).length, 1, "onsite fixes and boundary drift do not duplicate visits");
  await point(0.01, 50); await point(0, 49); assert.equal((await visits()).length, 2, "far departure permits another visit");
  await point(0.01, 48, 200); await point(0, 47); assert.equal((await visits()).length, 2, "poor GPS cannot rearm visits");
  await db.query("UPDATE field_sites SET visit_rate_minor=20000 WHERE id=$1", [site]);
  await point(0.01, 46); await point(0, 45);
  assert.equal((await visits())[2].rate_minor, 12500, "late synced arrival uses the rate effective at arrival");
  await point(0.01, -0.01); await point(0, -0.02);
  assert.equal((await visits())[3].rate_minor, 20000, "new arrivals use new rate");
  await point(0.01, 44); await point(0, 43); assert.equal((await visits()).length, 4, "out-of-order fixes cannot replay a visit");
  const month = (await scalar("SELECT date_trunc('month',now() AT TIME ZONE 'Asia/Kolkata')::date::text AS month")).month;
  await db.query("SELECT set_employee_basic_pay($1,$2,$3,3000000)", [org, employee, month]);
  await assert.rejects(db.query("SELECT set_employee_basic_pay($1,$2,$3,1)", [otherOrg, employee, month]));
  await assert.rejects(db.query("SELECT set_employee_basic_pay($1,$2,($3::date-interval '1 month')::date,1)", [org, employee, month]));
  const report = (await scalar("SELECT field_report($1,$2,($2::date+interval '1 month')::date,true,NULL) AS report", [org, month])).report;
  const row = report.employees.find((e) => e.employee_id === employee);
  assert.equal(row.visit_count, 4); assert.equal(row.visit_pay_minor, 57500);
  assert.equal(row.total_pay_minor, 3057500, "full monthly basic plus fixed-rate visits");
  assert.equal(report.employees.find((e) => e.employee_id === noSalaryEmployee).total_pay_minor, null, "missing salary is not zero");
  const weekly = (await scalar("SELECT field_report($1,$2,($2::date+interval '7 days')::date,false,$3) AS report", [org, month, employee])).report;
  assert.equal(weekly.employees.length, 1); assert.equal(weekly.employees[0].basic_pay_minor, null, "weekly salary is not double counted");
  const isolated = (await scalar("SELECT field_report($1,$2,($2::date+interval '1 month')::date,true,$3) AS report", [org, month, noSalaryEmployee])).report;
  assert.equal(isolated.employees[0].visit_count, 0);
  await db.query("UPDATE attendance_sessions SET checkout_at=now() WHERE id=$1", [session]);
  const challenge = (await scalar("INSERT INTO attendance_selfie_challenges(organization_id,employee_id,object_path) VALUES($1,$2,'one-use.jpg') RETURNING id", [org, employee])).id;
  await assert.rejects(db.query("SELECT camera_attendance_checkin($1,$2,$3,0,0,5,now())", [otherOrg, employee, challenge]));
  await db.query("SELECT camera_attendance_checkin($1,$2,$3,0,0,5,now())", [org, employee, challenge]);
  assert.equal((await visits()).length, 4, "restarting attendance onsite does not earn another visit");
  await db.query("UPDATE attendance_sessions SET checkout_at=now() WHERE employee_id=$1 AND checkout_at IS NULL", [employee]);
  await assert.rejects(db.query("SELECT camera_attendance_checkin($1,$2,$3,0,0,5,now())", [org, employee, challenge]));
  const grants = await scalar("SELECT has_function_privilege('authenticated','public.field_report(uuid,date,date,boolean,uuid)','execute') AS allowed");
  assert.equal(grants.allowed, false, "clients cannot call service-only report RPC");
  console.log("PASS: migration, distant repeat visits, rate history, GPS accuracy/replays, monthly/weekly pay, missing salary, tenant isolation, one-use selfies, restart protection and RPC permissions.");
} finally { await db.close(); }
