# FieldTrack API

Backend for FieldTrack workforce operations. Documentation audited against the local source on 2026-11-24; a successful local build is not a production-readiness certification.

This service is implemented with Fastify + TypeScript, Supabase (Postgres), Redis, and BullMQ workers.

## Overview

The API provides multi-tenant endpoints for:

- authentication and identity (`/auth/*`)
- attendance and location tracking
- expenses and approvals
- admin dashboards, analytics, and operational tooling
- fixed field locations, distant-departure visits, camera attendance and monthly basic-pay reports
- webhook and API key management

All tenant data access is scoped by `organization_id` derived from authenticated identity.

## Architecture

Core stack:

- Fastify 5 + TypeScript (ESM)
- Supabase Postgres clients (anon + service role)
- Redis + BullMQ
- OpenTelemetry + Prometheus metrics
- Zod validation

Runtime layout:

- `src/routes`: route registration and system routes
- `src/modules`: domain modules (auth, attendance, expenses, analytics, admin, etc.)
- `src/middleware`: auth and role guards
- `src/db`: tenant-scoped query helpers
- `src/workers`: queue workers and scheduled jobs

Workers started by `src/workers/startup.ts`:

- distance worker
- analytics worker
- webhook worker
- snapshot worker

Scheduled jobs:

- snapshot reconciliation job (`reconcile_snapshot_tables()` every 5 minutes)
- retry-intent cleanup job

## Key Features

- JWT and API key auth (`Authorization: Bearer ...` or `X-API-Key`)
- strict role-based authorization (`ADMIN`, `EMPLOYEE`)
- attendance lifecycle (`check-in` and `check-out`) with async post-processing
- camera/GPS check-in with a one-use upload challenge, private JPEG storage and embedded GPS validation
- preset sites, per-visit rates, effective-month basic salaries and weekly/monthly earnings reports
- location ingest (single + batch)
- expense lifecycle with admin review and CSV export
- admin SSE stream at `/admin/events`
- queue/system/internal admin observability endpoints

## Environment Setup

Environment is validated by `src/config/env.ts` at startup.

Core configuration keys (required values and safe defaults are detailed in the environment contract):

- `APP_ENV`
- `PORT`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `REDIS_URL`
- `API_BASE_URL`
- `APP_BASE_URL`
- `CORS_ORIGIN`

`SUPABASE_JWT_SECRET` is used by the test harness, not the production verifier.
Production verification uses ES256/JWKS and requires top-level `role`, `org_id`
and, for employees, `employee_id` claims. URL/CORS requirements are
production-specific; see `docs/env-contract.md` for the complete defaults.

Environment-specific variables (some are mandatory in production):

- `FRONTEND_BASE_URL`
- `METRICS_SCRAPE_TOKEN`
- `TEMPO_ENDPOINT`
- `WORKERS_ENABLED`

`WORKERS_ENABLED` defaults to false outside production but must explicitly be
true in production. Disabling workers does not validate Supabase schemas or
make the full application independent of Redis.

## Local Run

Prerequisites:

- Node.js 24+
- npm
- Redis
- Supabase project

Commands:

```bash
npm install
npm run dev
```

Useful scripts:

- `npm run dev`
- `npm run build`
- `npm start`
- `npm run typecheck`
- `npm run lint`
- `npm test`

## API Surface

System endpoints:

- `GET /`
- `GET /health`
- `GET /ready`
- `GET /metrics`
- `GET /openapi.json`
- `GET /docs`

Full endpoint contract and examples: `docs/API_REFERENCE.md`.

## Deployment Summary

Production deploy is driven by GitHub Actions and `scripts/deploy.sh`.

High-level flow:

1. `validate`: CodeQL result gate for workflow-run deployments, contracts, bootstrap, typecheck and tests
2. `build-push`: build the digest-pinned distroless image, check TLS and push SHA tags to GHCR
3. `deploy`: VPS preflight, blue-green switch and health checks
4. `rollback`: phase-aware recovery on deployment failure

Manual workflow dispatch does not run the workflow-run CodeQL gate. The current
production workflow has no blocking dependency/image vulnerability scan; PR
`npm audit` failures are warning-only. Review security separately before release.

Liveness gate is `/health` (not `/ready`).

## Company field operations

Admins configure warehouses and work sites, arrival and departure radii, visit
rates, and monthly basic pay. Employees start shifts with a geotagged camera
selfie, confirm arrivals with current GPS, and share their location while checked
in. The live map reads the most recent fix from the employee's active shift.

Company defaults are INR and Asia/Kolkata. Reports split working time at local
midnight and show visits, attendance, and earnings for a day, week, month, or
date range. Basic pay applies once per fully selected calendar month. Admins can
record payments and view their history after GPS and selfie evidence expires.

Run `node scripts/test-migration-replay.mjs` to verify the forward migration
chain against isolated PostgreSQL. Apply the forward migrations in staging and
verify Supabase Auth, Storage, and the clients together before rolling out.
See [field operations](docs/FIELD_OPERATIONS.md) for the API and business rules.

See `docs/DEPLOYMENT.md` for detailed CI/CD and rollback behavior.

## Documentation

- `docs/API_REFERENCE.md`
- `docs/FIELD_OPERATIONS.md` (company setup, business rules and migration)
- `docs/ARCHITECTURE.md`
- `docs/DEPLOYMENT.md`
- `docs/ROLLBACK_SYSTEM.md`
- `docs/env-contract.md`
- `docs/infra-contract.md`
