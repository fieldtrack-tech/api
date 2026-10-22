# API Deployment Guide

This guide reflects the implemented production deployment flow for the API repository.

## Deployment Flow

Deployments are currently run manually with `scripts/deploy.sh`.

1. Build and publish the target container image to GHCR.
2. Run `./scripts/deploy.sh <sha>` on the VPS.
3. Confirm the routed `/health` endpoint and smoke checks.
4. Run `./scripts/deploy.sh --rollback --auto` if post-deploy validation fails.

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
