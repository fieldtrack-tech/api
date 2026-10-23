# FieldTrack API

Production backend for FieldTrack workforce operations.

This service is implemented with Fastify + TypeScript, Supabase (Postgres), Redis, and BullMQ workers.

## Overview

The API provides multi-tenant endpoints for:

- authentication and identity (`/auth/*`)
- attendance and location tracking
- expenses and approvals
- admin dashboards, analytics, and operational tooling
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
- location ingest (single + batch)
- expense lifecycle with admin review and CSV export
- admin SSE stream at `/admin/events`
- queue/system/internal admin observability endpoints

## Environment Setup

Environment is validated by `src/config/env.ts` at startup.

Required baseline variables:

- `APP_ENV`
- `PORT`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `REDIS_URL`
- `API_BASE_URL`
- `APP_BASE_URL`
- `CORS_ORIGIN`

Common optional variables:

- `FRONTEND_BASE_URL`
- `METRICS_SCRAPE_TOKEN`
- `TEMPO_ENDPOINT`
- `WORKERS_ENABLED`

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

1. CodeQL deep scan gate
2. validate + tests
3. docker build, vulnerability scan, push to GHCR
4. VPS readiness check
5. blue-green deploy
6. health and smoke checks
7. rollback on failure

Liveness gate is `/health` (not `/ready`).

See `docs/DEPLOYMENT.md` for detailed CI/CD and rollback behavior.

## Documentation

- `docs/API_REFERENCE.md`
- `docs/ARCHITECTURE.md`
- `docs/DEPLOYMENT.md`
- `docs/ROLLBACK_SYSTEM.md`
- `docs/env-contract.md`
- `docs/infra-contract.md`
