# FieldTrack API Reference

Implementation-aligned contract reference for the current API.

Last source audit: 2026-11-24. Generated OpenAPI reflects registered schemas,
but several field-operation/operational endpoints have no response schema;
generation is not proof of complete schema coverage or live deployment.

For generated OpenAPI, use:

- `GET /openapi.json`
- `GET /docs`

## Authentication Model

Supported auth methods:

- JWT bearer token:
  - `Authorization: Bearer <token>`
- API key (for allowed scopes only):
  - `X-API-Key: <key>`

Identity claims used by the API:

- `sub`
- `org_id` in the verified JWT (normalized to `request.organizationId` / application `organization_id`)
- `role` (`ADMIN` or `EMPLOYEE`)
- `employee_id` for EMPLOYEE tokens (distinct from auth `sub`)

Production tokens are ES256 with `kid`, expected Supabase issuer and
`aud=authenticated`. User-editable metadata is not an API authorization source.
API keys receive admin-shaped context without employee identity; scopes still
apply. Attendance/camera/employee expense creation therefore require employee JWTs.

SQL RPC policy after applying the FT-001 permission repair: known backend RPCs
are service-role-only; clients use these HTTP endpoints with JWT/API-key auth,
not direct Supabase RPC calls, even for same-organization reads. The auth hook is
dedicated to Supabase Auth admin. The repair is in
`supabase/migrations/20261124000200_rpc_permissions_hardening.sql` and has been
verified locally but not applied to a live database by the agent.

## Standard Response Envelope

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "error": "Human readable message",
  "requestId": "uuid"
}
```

Common HTTP status codes:

- `200` success
- `201` created
- `202` accepted / queued
- `204` no content
- `400` validation/business rule error
- `401` unauthenticated
- `403` forbidden
- `404` not found
- `409` conflict
- `410` removed/deprecated endpoint
- `429` rate limited
- `500` internal error

Example typed error codes used in responses include values such as `VALIDATION_ERROR`, `INVALID_CREDENTIALS`, and route-specific domain codes.

## System Endpoints

- `GET /` service identity
- `GET /health` liveness
- `GET /ready` dependency readiness
- `GET /metrics` Prometheus/OpenMetrics
- `GET /openapi.json` OpenAPI spec
- `GET /docs` Swagger UI

These system/documentation routes do not require employee JWTs. `/metrics`
requires the configured scrape bearer token, mandatory in production. `/health`
returns 503 before bootstrap, then includes a config hash. `/ready` returns JSON
dependency status, not Prometheus metrics, and does not currently gate on its
reported worker status. `/auth/login` is public; `/auth/me` is authenticated.

## Auth Endpoints

### POST /auth/login

Body:

```json
{
  "email": "user@example.com",
  "password": "password"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "access_token": "...",
    "refresh_token": "...",
    "token_type": "bearer",
    "expires_in": 3600,
    "expires_at": 1741686400
  }
}
```

### GET /auth/me

Auth required.

Response:

```json
{
  "success": true,
  "data": {
    "id": "uuid-or-api-key-sub",
    "email": "user@example.com",
    "role": "ADMIN",
    "orgId": "organization-uuid"
  }
}
```

## Employee Endpoints

### Attendance

- `POST /attendance/check-in` (EMPLOYEE)
- `POST /attendance/selfie-challenge` (EMPLOYEE, 10/minute per IP)
- `GET /attendance/:sessionId/selfie` (own employee session or admin organization session)
- `POST /attendance/check-out` (EMPLOYEE)
- `POST /attendance/:sessionId/recalculate` (authenticated, rate-limited)
- `GET /attendance/my-sessions?page&limit&status`
- `GET /attendance/org-sessions` is removed and returns `410`; use admin sessions endpoint.

Check-in sequence: obtain a challenge, capture a fresh camera selfie, stamp GPS
and IST time plus GPS EXIF, PUT JPEG bytes to the returned `upload_url`, then
submit the following JSON. Gallery/arbitrary external photo URLs are not part
of the client capture flow.

```json
{
  "challenge_id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  "latitude": 19.076,
  "longitude": 72.8777,
  "accuracy": 10,
  "captured_at": "2026-11-24T09:00:00.000Z",
  "location_at": "2026-11-24T09:00:00.000Z"
}
```

Use current timestamps, not the example's fixed date. Photo/GPS age <=2 minutes,
future tolerance 30 seconds, challenge lifetime 5 minutes, accuracy <=100m, JPEG
100 bytes–5MB, and GPS EXIF must match submitted coordinates within 0.00001°.
The service verifies header/metadata, not full image decoding or biometric identity.
The SQL transaction consumes the challenge and writes start GPS with attendance.
Check-out needs no body. Duplicate-open/no-open cases are **400**, not 409.
Selfie view returns `{url, expires_in:60}` with a private signed URL.

Session status filter values:

- `all`
- `active`
- `recent`
- `inactive`

Example response item:

```json
{
  "id": "session-uuid",
  "employee_id": "employee-uuid",
  "organization_id": "org-uuid",
  "checkin_at": "2026-04-01T09:00:00.000Z",
  "checkout_at": null,
  "total_distance_km": null,
  "total_duration_seconds": null,
  "distance_recalculation_status": null,
  "created_at": "...",
  "updated_at": "..."
}
```

### Locations

- `POST /locations` (EMPLOYEE)
- `POST /locations/batch` (EMPLOYEE)
- `GET /locations/my-route?sessionId=<uuid>`

`/locations/my-route` accepts `sessionId` and legacy-compatible `session_id` query params.

Ingestion requires the employee's still-open session. Points before check-in or
more than two minutes in the future are rejected. Closing a session prevents
later upload of points recorded during it. Route retrieval is ordered by time
but currently lacks exhaustive pagination, so a PostgREST row limit can truncate
long routes. A duplicate single-point upsert can return an error rather than a
stable prior row; batch upserts suppress duplicates.

Single-point request example:

```json
{
  "session_id": "session-uuid",
  "latitude": 28.6139,
  "longitude": 77.209,
  "accuracy": 12.5,
  "recorded_at": "2026-04-01T09:30:00.000Z"
}
```

### Employee Expenses

- `POST /expenses/receipt-upload-url` (EMPLOYEE)
- `POST /expenses` (EMPLOYEE)
- `GET /expenses/my?page&limit&status`

Employee expense status values:

- `all`
- `PENDING`
- `APPROVED`
- `REJECTED`
- `processed`

### Employee Dashboard/Profile

- `GET /dashboard/my-summary`
- `GET /profile/me`
- `GET /leaderboard`

## Expenses (Admin + Employee)

### Employee write/list

- `POST /expenses`
- `GET /expenses/my`

### Admin review/reporting

- `GET /admin/expenses`
- `PATCH /admin/expenses/:id`
- `GET /admin/expenses/summary`
- `GET /admin/expenses/export`

Review body example:

Rejection requires `rejection_comment`; approval needs only `status`. Review
currently checks PENDING before an unconditional update, not an atomic
compare-and-set, so concurrent reviews are not protected at the DB boundary.
API-key expense review passes a synthetic `sub`, which is incompatible with the
UUID reviewer column; use an admin JWT for review.

```json
{
  "status": "APPROVED"
}
```

## Admin Endpoints

All endpoints below require `ADMIN` role unless noted.

### Sessions and Employees

- `GET /admin/sessions`
- `GET /admin/sessions/:id/locations`
- `POST /admin/force-checkout`
- `GET /admin/employees`
- `POST /admin/employees`
- `GET /admin/employees/:id`
- `PATCH /admin/employees/:id`
- `PATCH /admin/employees/:id/status`
- `GET /admin/employees/:employeeId/profile`
- `GET /admin/search`

### Analytics and Dashboard

- `GET /admin/dashboard`
- `GET /admin/org-summary`
- `GET /admin/user-summary`
- `GET /admin/top-performers`
- `GET /admin/session-trend`
- `GET /admin/leaderboard`
- `GET /admin/monitoring/map`

Date range query params use `from` and `to` ISO datetime values.

### Monitoring, Queues, and System Ops

- `POST /admin/start-monitoring`
- `POST /admin/stop-monitoring`
- `GET /admin/monitoring-history`
- `GET /admin/events` (SSE stream)
- `GET /admin/queues`
- `POST /admin/queues/replay-distance-dlq`
- `GET /admin/retry-intents`
- `GET /admin/system-health`
- `GET /admin/audit-log`

### API Keys

- `POST /admin/api-keys`
- `GET /admin/api-keys`
- `PATCH /admin/api-keys/:id`
- `DELETE /admin/api-keys/:id`

API key routes require JWT auth and cannot be managed with API key auth itself.

### Webhooks

- `GET /admin/webhooks`
- `POST /admin/webhooks`
- `PATCH /admin/webhooks/:id`
- `DELETE /admin/webhooks/:id`
- `GET /admin/webhook-deliveries`
- `GET /admin/webhooks/logs`
- `POST /admin/webhook-deliveries/:id/retry`
- `POST /admin/webhooks/logs/:id/retry`
- `POST /admin/webhooks/:id/test`
- `GET /admin/webhook-dlq`
- `POST /admin/webhook-dlq/:id/retry`

Legacy aliases under `/webhooks*` exist for backward compatibility and are hidden from OpenAPI.

## Field locations, salaries and earnings

| Endpoint | Access | Contract |
|---|---|---|
| `GET /field/settings` | Authenticated | Company settings or null |
| `POST /admin/field/settings` | ADMIN | `{currency, timezone}`; defaults INR / `Asia/Kolkata`; one-time setup |
| `GET /field/sites` | Authenticated | All company sites, including inactive entries |
| `POST /admin/field/sites` | ADMIN | Full location definition, below |
| `PATCH /admin/field/sites/:id` | ADMIN | Full definition, not a partial patch |
| `GET /admin/field/basic-pay` | ADMIN | Salary effective-month history |
| `POST /admin/field/basic-pay/:employeeId` | ADMIN | `{effective_month:"YYYY-MM-01", amount_minor}` |
| `GET /admin/field/reports` | ADMIN | `period=week|month&date=YYYY-MM-DD[&employee_id=UUID]` |
| `GET /field/my-report` | EMPLOYEE | Same period/date, always employee's own identity |
| `GET /admin/field/reports/export` | ADMIN | JSON `{filename,csv}`, not raw CSV attachment |

Site body: `name`, `address`, `latitude`, `longitude`, `arrival_radius_m`,
`departure_radius_m`, `visit_rate_minor`, `is_active`. Arrival radius 25–5000m;
departure radius must be larger and <=50000m. Money is integer minor units
(12500 = ₹125.00), 0–100000000000 per configured rate/salary.

Reports return period, currency, timezone, `from`, `to_exclusive` and employee
rows containing attendance evidence, distinct selfie-attendance days, visits,
basic pay, visit count/earnings and monthly total. Calendar months and
Monday–Sunday weeks use company timezone; ends are exclusive. Monthly total
= full basic pay + visits; missing salary gives null, and weekly basic/total are
null rather than weekly proration. Current totals are provisional, not locked.

Every visit needs an observed distant departure and confident arrival in the
same attendance session. No dwell/assignment validation exists. All active sites
are evaluated, so overlapping geofences need careful configuration. Rates are
snapshotted using arrival-time history. See [FIELD_OPERATIONS.md](FIELD_OPERATIONS.md).

### Internal Admin Probes

- `GET /internal/metrics`
- `GET /internal/queues/status`
- `GET /internal/snapshot-health`
- `GET /internal/ready-deep`

## Rate Limit Notes

Route-level limits include:

- `POST /locations` and `POST /locations/batch`: 10 requests / 10 seconds per user key
- `POST /expenses`: 10 requests / 60 seconds per user key
- `POST /attendance/:sessionId/recalculate`: 5 requests / 60 seconds per user key

Additional global and security middleware limits are enforced by Fastify plugins.
