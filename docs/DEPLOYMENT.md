# API Deployment Guide

This guide reflects the implemented production deployment flow for the API repository.

## CI/CD Flow (GitHub Actions)

Primary workflow: `.github/workflows/deploy.yml`

Pipeline behavior:

1. `codeql-gate`
   - deploy triggers from CodeQL deep-scan completion on `master`
   - blocked if scan conclusion is not `success`
2. `validate` + `test-api` + `infra-leakage-guard`
3. `build-scan-push`
   - Docker build
   - image scanning
   - push to GHCR
4. readiness/deploy jobs execute VPS deployment using `scripts/deploy.sh`
5. post-deploy health and smoke checks
6. rollback path on deploy/smoke failure

## Docker Build and Runtime

Image is built in CI and tagged by commit SHA.

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
