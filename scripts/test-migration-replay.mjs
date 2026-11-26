import { readdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";

const migrations = new URL("../supabase/migrations/", import.meta.url);
const db = new PGlite();
try {
  // Supply the Supabase-managed objects required by the application DDL.
  // Extension installation and PostgREST must also be validated on Supabase.
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE ROLE supabase_auth_admin;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS 'SELECT ''{}''::jsonb';
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    CREATE SCHEMA cron;
    CREATE TABLE cron.job (jobname text PRIMARY KEY);
    CREATE FUNCTION cron.schedule(text, text, text) RETURNS bigint LANGUAGE sql AS 'SELECT 1::bigint';
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO service_role;
  `);
  const files = (await readdir(migrations)).filter((file) => file.endsWith(".sql")).sort();
  const versions = files.map((file) => /^([0-9]{14})_/.exec(file)?.[1]);
  assert.ok(versions.every(Boolean), "every forward migration is versioned");
  assert.equal(new Set(versions).size, files.length, "forward versions are unique");
  for (const file of files) {
    const sql = (await readFile(new URL(file, migrations), "utf8"))
      .replace(/^CREATE EXTENSION IF NOT EXISTS "[^"]+";\s*$/gim, "");
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`${file}: ${error.message}`);
    }
  }
  const result = await db.query("SELECT public.generate_employee_code(p_prefix => 'EMP') AS code");
  assert.match(result.rows[0].code, /^EMP[0-9]+$/);
  await db.query("SELECT public.reconcile_snapshot_tables()");
  const row = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const org = (await row("INSERT INTO organizations(name) VALUES ('Local field tests') RETURNING id")).id;
  const foreignOrg = (await row("INSERT INTO organizations(name) VALUES ('Other tenant') RETURNING id")).id;
  const employee = (await row("INSERT INTO employees(organization_id, name, employee_code) VALUES ($1, 'Field employee', $2) RETURNING id", [org, result.rows[0].code])).id;
  await db.query("INSERT INTO field_settings(organization_id, currency, timezone) VALUES ($1, 'INR', 'Asia/Kolkata')", [org]);
  const site = (await row(`INSERT INTO field_sites(organization_id, name, latitude, longitude, arrival_radius_m,
    departure_radius_m, visit_rate_minor, created_at) VALUES ($1, 'Warehouse', 0, 0, 100, 500, 12500, now() - interval '1 day') RETURNING id`, [org])).id;
  const shift = (await row(`INSERT INTO attendance_sessions(organization_id, employee_id, checkin_at, selfie_path)
    VALUES ($1, $2, now() - interval '10 minutes', 'test/photo.jpg') RETURNING id`, [org, employee])).id;
  const now = Date.now();
  const fix = (secondsAgo, latitude = 0, accuracy = 5) => ({
    latitude, longitude: 0, accuracy, recorded_at: new Date(now - secondsAgo * 1000).toISOString(),
  });
  const ingest = (points, session = shift) => row("SELECT ingest_field_gps($1, $2, $3, $4, true) AS data", [org, employee, session, JSON.stringify(points)]);
  const reach = (point) => row("SELECT confirm_field_arrival($1, $2, $3, $4, $5, $6, $7) AS data", [org, employee, site, point.latitude, point.longitude, point.accuracy, point.recorded_at]);
  const visits = async () => (await db.query("SELECT id, rate_minor, departed_from_at FROM field_visits ORDER BY arrived_at")).rows;

  await assert.rejects(reach(fix(20, 0.003)), /inside this work site/);
  await assert.rejects(reach(fix(20, 0.0008, 20)), /inside this work site/);
  await assert.rejects(reach(fix(61)), /fresh, accurate GPS/);
  const first = (await reach(fix(50))).data;
  assert.equal(first.payable, true);
  assert.equal(first.amount_minor, 12500);
  assert.deepEqual((await reach(fix(45))).data, first);

  await ingest([fix(25)]);
  const preShift = fix(650, 0.01);
  const lateDeparture = fix(35, 0.01);
  const batchResult = (await ingest([lateDeparture, preShift])).data;
  assert.equal(batchResult.inserted.length, 1);
  assert.deepEqual(batchResult.discarded_recorded_at, [preShift.recorded_at]);
  assert.equal((await visits()).length, 2, "a late departure earns the stored return once");
  assert.equal((await visits())[0].id, first.visit_id, "reconciliation leaves the initial paid visit stable");
  assert.equal((await ingest([lateDeparture])).data.inserted.length, 0);
  assert.equal((await visits()).length, 2);

  await db.query("UPDATE field_sites SET latitude = 1, visit_rate_minor = 20000 WHERE id = $1", [site]);
  await ingest([fix(17, 0.01), fix(16)]);
  assert.equal((await visits())[2].rate_minor, 12500, "late fixes use the original geofence and rate after a site move");
  assert.equal((await row("SELECT count(*)::int AS n FROM get_active_map_markers($1, 1, $2)", [org, employee])).n, 1);
  assert.equal((await row("SELECT count(*)::int AS n FROM get_active_map_markers($1, 1, $2)", [foreignOrg, employee])).n, 0);

  const checkout = fix(10).recorded_at;
  await db.query("UPDATE attendance_sessions SET checkout_at = $2 WHERE id = $1", [shift, checkout]);
  const postShift = fix(8, 1);
  const finalBatch = (await ingest([fix(12), postShift])).data;
  assert.equal(finalBatch.closed, true);
  assert.equal(finalBatch.inserted.length, 1);
  assert.deepEqual(finalBatch.discarded_recorded_at, [postShift.recorded_at]);
  assert.equal((await row("SELECT count(*)::int AS n FROM get_active_map_markers($1, 1, $2)", [org, employee])).n, 0);

  const secondShift = (await row(`INSERT INTO attendance_sessions(organization_id, employee_id, checkin_at, selfie_path)
    VALUES ($1, $2, $3, 'test/photo-2.jpg') RETURNING id`, [org, employee, fix(6).recorded_at])).id;
  const arrivalFix = { ...fix(0, 1), recorded_at: new Date().toISOString() };
  const repeat = (await reach(arrivalFix)).data;
  assert.equal(repeat.payable, false);
  assert.equal(repeat.visit_id, null);
  assert.equal((await visits()).length, 3, "restarting onsite does not multiply visits");
  assert.equal((await row("SELECT last_confirmed_session_id AS id FROM field_visit_states WHERE employee_id = $1", [employee])).id, secondShift);
  await db.query("UPDATE employees SET is_active = false WHERE id = $1", [employee]);
  await assert.rejects(ingest([arrivalFix], secondShift), /inactive/);
  console.log(`Replayed ${files.length} forward migrations. Employee codes, reconciliation, scoped live GPS, late uploads and verified visits passed.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
