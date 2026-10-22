# FieldTrack API Architecture

This document describes the implemented backend architecture in `api`.

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

This protects against cross-tenant data reads/writes at API layer even when using privileged DB credentials.

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
