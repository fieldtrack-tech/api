# FieldTrack API Architecture

This document describes the implemented backend architecture in `api`.

Last source audit: 2026-11-24. Architecture below describes implementation, not
guarantees of replayable migrations, complete telemetry or financial finalization.

## Service Structure

Entry flow:

1. `src/server.ts` initializes telemetry and validates env
2. `src/app.ts` builds Fastify app, registers plugins and routes
3. `src/routes/index.ts` registers all module routes
4. workers are started only after the HTTP server is listening

Core layers:

- `src/modules/*`: business domains and route handlers
- `src/middleware/*`: authentication and role enforcement
- `src/db/*`: tenant-scoped query helper (`orgTable`) and repository patterns
- `src/plugins/*`: security, docs, metrics, and validation integrations
- `src/workers/*`: asynchronous processing and scheduled maintenance

## Request Lifecycle

1. security plugins run (`helmet`, `cors`, rate limiting, abuse logging)
2. auth middleware resolves identity (JWT/API key)
3. role guard enforces endpoint access
4. Zod validation enforces request schemas
5. handler/service executes tenant-scoped data operations
6. standardized response envelope is returned

## Repository and Data Access Pattern

Tenant isolation in application code is enforced through organization scoping:

- `request.organizationId` is injected by auth middleware
- repositories use org-scoped filters via `orgTable(...)` or explicit `.eq("organization_id", orgId)`
- service-role client is used carefully with explicit tenant constraints

These filters are the API-layer tenant boundary. The service client bypasses
RLS, so the boundary depends on correct filters and RPC arguments. SQL function
grants need a separate review: API middleware cannot secure RPC calls made
directly to Supabase. The anon client is used for `/auth/login`, not ordinary
repository reads/writes.

## Worker System (BullMQ + Scheduled Jobs)

Workers defined and started from `src/workers/startup.ts`:

- distance worker
  - recalculates session distance/duration
- analytics worker
  - updates daily/org aggregates and leaderboard data
- webhook worker
  - processes outbound webhook deliveries
- snapshot worker
  - maintains denormalized snapshot tables from event jobs

Queue names: `distance-engine`, `analytics`, `webhook-delivery` and
`snapshot-engine`; inspect the queue modules for exact options. The currently
installed BullMQ rejects the colon-based analytics/snapshot IDs in these modules;
worker registration therefore does not prove those jobs can be enqueued.

Support queues and reliability components:

- retry-intent persistence and replay
- dead-letter queue replay endpoint for distance jobs
- webhook DLQ listing/retry endpoints

Scheduled jobs:

- `reconciliation.job.ts`: calls `reconcile_snapshot_tables()` every 5 minutes
- `retry-cleanup.job.ts`: cleans stale retry intents

## Snapshot Table Logic

Snapshot/event model keeps admin reads fast and deterministic.

Primary snapshot surfaces maintained by worker + reconciliation:

- `employee_last_state`
- `active_users`
- `employee_latest_sessions`
- `employee_metrics_snapshot`
- `org_dashboard_snapshot`
- `pending_expenses`

Operational model:

- event-driven updates on check-in/check-out/location/expense actions
- idempotent UPSERT/delete semantics
- periodic reconciliation self-heals drift when transient failures occur

Reconciliation is attempted, not guaranteed: the checked-in SQL function uses
daily-metric column names different from the baseline schema. Snapshot location
UPSERTs also have no recorded-time guard, so older jobs can replace newer fixes.

## Field visits, selfies and monthly pay

- Camera attendance uses a one-use private upload challenge. The service checks
  embedded GPS agreement and fresh client timestamps, then decodes the JPEG
  within upload and pixel limits. A transaction consumes the challenge and
  inserts attendance plus start GPS.
- The saved selfie has a visible GPS/accuracy/IST-time footer and standard GPS
  EXIF. This is photographic evidence, not identity/liveness or anti-spoof proof.
- A GPS insert trigger verifies the session and processes each site's
  departure/arrival state under a per-employee advisory lock. The first manual
  confirmation at a site can count using an in-radius fix. Repeat payable visits
  require a departure and return in the same shift.
- Visit rows snapshot rate/name/currency; historical rates apply at arrival time.
- Monthly salary records apply from their effective month onward. Ended-month
  salary edits are rejected, but current-month salary remains editable.
- Daily, weekly, monthly and custom-range reporting use SQL aggregation with
  company-local date boundaries. Basic pay applies to complete calendar months.
- The payment register stores visit and basic-pay amounts already paid. An
  employee-level lock serializes recording, and unique visit and month records
  prevent duplicate payments across overlapping selections.
- Scheduled retention clears GPS and selfie evidence after three calendar
  months while preserving attendance times, verified visits and payment records.

[Field tracking and payroll details](FIELD_OPERATIONS.md)

## Auth and Tenant Security

Supported auth:

- JWT bearer
- scoped API keys

Authorization:

- role checks via middleware (`ADMIN`, `EMPLOYEE`)
- endpoint-level `preValidation` guards

Tenant boundaries:

- all org data operations apply `organization_id` scoping
- row-level security exists in DB layer and is complemented by API-layer tenant scoping

## Observability and Operations

Implemented observability:

- Prometheus/OpenMetrics endpoint (`/metrics`)
- OpenTelemetry traces
- structured request logging with request id and trace correlation
- internal and admin operational endpoints (`/internal/*`, `/admin/system-health`, `/admin/queues`)

Real-time admin updates:

- SSE stream at `/admin/events`
- org-scoped event bus for session and expense updates

The event bus is process-local, not a Redis/pub-sub fanout across replicas. The
current browser EventSource uses a query token while the API accepts bearer
headers; the browser connection is not operational without a transport fix.
Liveness is set after listen, before workers start. `/ready` checks Redis/DB/queue
access but reports worker status without including it in its ready decision.
