# API Deployment Guide

Source audit: 2026-11-24. This describes the checked-in workflow, not a deployment
executed during the audit. Local tests do not validate the live VPS or database.

## CI/CD Flow (GitHub Actions)

Primary workflow: `.github/workflows/deploy.yml`

Pipeline behavior:

1. `validate`: resolve SHA, check CodeQL result for `workflow_run`, typecheck,
   bootstrap/contracts and run tests.
2. `build-push`: build production image, check Node/TLS, record digest/provenance
   and push full/short SHA tags to GHCR. PR digest comparison is advisory.
3. `deploy`: use one SSH session to sync the exact commit, run VPS preflight,
   deploy and verify the active container and routed health.
4. `rollback`: phase-aware recovery after deployment failure.

`workflow_dispatch` is also supported and skips the workflow-run CodeQL result
check. There is no blocking npm/image vulnerability scan in this production
workflow; PR audit failures are caught as warnings. Apply a separate security
release gate rather than assuming all high/critical findings block deployment.

## Docker Build and Runtime

Image is built in CI and tagged by commit SHA.

The Dockerfile builds with pinned Node 24.2.0 Debian-slim stages and ships a
pinned distroless Node 24 nonroot runtime. It includes an explicit libssl overlay
stage. There is no shell/curl in the final runtime; health uses `healthcheck.js`.
Docker health: 10 s interval, 5 s timeout, 30 s start period, five retries.
The runtime/deploy probes assume internal API port 3000.

Deployment script pulls the target image and starts it in inactive blue/green slot.

Important deploy invariant from `scripts/deploy.sh`:

- deployment success is based on container startup and `/health` routing checks
- script intentionally does not gate success on `/ready`

## Blue-Green Deploy Model

Slots:

- `api-blue`
- `api-green`

Flow:

1. resolve currently active slot
2. start/update inactive slot with new image
3. validate container health
4. switch nginx routing to new slot
5. validate routed `/health`
6. remove old slot after success

State files and lock handling are maintained by deploy script for deterministic slot switching and recovery behavior.

## Health Checks

API endpoints:

- `GET /health`: liveness/deploy gate
- `GET /ready`: deep dependency check (informational for ops, not deploy gate)

`/health` becomes healthy after listen, before worker startup. `/ready` currently
does not include its reported worker status in the overall ready decision and
has no explicit dependency-probe deadline. Neither checks migration parity.

Nginx and infra health are managed by infra repo and include `/infra/health` for proxy liveness.

## Rollback Logic

`scripts/deploy.sh` supports:

- interactive rollback: `--rollback`
- non-interactive rollback: `--rollback --auto`

Deploy outcomes are phase-aware and emit explicit result states.

Rollback is attempted automatically on failed post-switch validation paths.

## Manual Deploy Commands

```bash
./scripts/deploy.sh <sha>
./scripts/deploy.sh --rollback
./scripts/deploy.sh --rollback --auto
```

## Prerequisites on VPS

Managed primarily by infra repository:

- nginx deployed and healthy
- redis deployed and reachable
- `api_network` Docker network present
- infra path contracts available under configured infra root

Without these, API deployment will fail preflight validation.

## Database and client release checklist

- Back up and test migrations in a disposable/staging Supabase environment.
  Do not run `supabase db reset --linked --yes` on a company database.
- The migration chain currently contains unsupported baseline enum syntax,
  two files sharing version `20260329000200` (one is destructive rollback SQL),
  and application/schema drift. Resolve those before a clean replay.
- FT-001 has a separate forward permission-only repair:
  `supabase/migrations/20261124000200_rpc_permissions_hardening.sql`. It revokes
  direct client execution of known backend RPCs and preserves backend/Auth roles.
  This repair does not require dropping tables or rewriting old migrations,
  but has **not** been applied by the agent. Review installed routines/grants,
  migration ownership and any additional DDL-owner defaults before an authorized
  staging/production application. Do not blindly replay the broken full chain.
- Apply field operations and deploy updated camera clients together. The API
  rejects old check-in bodies and selfies without matching GPS EXIF.
- An API image rollback does not undo SQL migrations. Plan compatibility and
  database recovery separately; do not automatically run the rollback SQL file.
- Coordinate with infra changes/watchdog. API deploy uses a state-directory
  lock; infra nginx sync does not share it and can overwrite the same live config.
  Infra sync recreates nginx instead of doing the API script's graceful reload.
- Physical-device camera/background tracking and live authenticated UI tests
  remain release checks; the audit did not deploy or perform them.

FT-001 verification before/after application: anonymous/authenticated/inherited
client roles must fail direct protected RPC calls, service-role API reads/workers
must retain execution, and the Supabase Auth hook must still issue expected
claims through its dedicated Auth admin role. The local 10-test PGlite suite
checks these permission behaviors, not production PostgREST configuration.
An API image rollback does not restore old client grants; do not reopen the
legacy exposure as part of rollback.
