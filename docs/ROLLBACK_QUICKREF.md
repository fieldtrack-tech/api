# Rollback System Quick Reference

Reviewed against `scripts/deploy.sh` on 2026-11-24. Commands below change the VPS;
none were executed during the local audit. Image rollback does not undo SQL.

## Commands

### Deploy Latest Version
```bash
cd "$HOME/api"
./scripts/deploy.sh <SHA>
```

### Rollback to Previous Version
```bash
cd "$HOME/api"
./scripts/deploy.sh --rollback
```

### Rollback (non-interactive, for CI)
```bash
./scripts/deploy.sh --rollback --auto
```

### Deploy Specific Version
```bash
./scripts/deploy.sh 7b3e9f1
```

## How It Works

1. Every successful deployment prepends image SHA to `.deploy_history`
2. History maintains last 5 deployments (newest first)
3. Rollback reads line 2 from `.deploy_history` and redeploys that image
4. The old API slot remains until the replacement passes health checks; proxy/infra behavior must be considered separately
5. Health checks validate before switching traffic

## Deployment Flow

```
┌──────────────┐
│  CI builds   │
│  image SHA   │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ scripts/         │
│ deploy.sh <SHA>  │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Pull image       │
│ Start container  │
│ Health check     │
│ Switch nginx     │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Prepend SHA to   │
│ .deploy_history  │
│ (keep last 5)    │
└──────────────────┘
```

## Rollback Flow

```
┌──────────────────┐
│ ./deploy.sh      │
│ --rollback       │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Read .deploy_    │
│ history (line 2) │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Show history &   │
│ confirm with user│
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ scripts/         │
│ deploy.sh <SHA>  │
└──────────────────┘
```

## Safety Features

- ✅ Interactive confirmation before rollback
- ✅ Health validation (40 HTTP attempts, 3–5 s jitter plus separate Docker checks)
- ✅ Nginx config validation before reload
- ✅ Automatic cleanup on failure
- ✅ Blue-green API slot replacement; not a workspace-wide zero-downtime guarantee
- ✅ Immutable image SHAs

## File Locations

```
$DEPLOY_ROOT/                 # defaults to $HOME/api
├── scripts/
│   └── deploy.sh           # Deploy and rollback
└── .deploy_history (last 5 SHAs)
```

## Example Session

Illustrative output/timings only; the current script does not print this full
history table and actual recovery duration varies with image/health checks.

```bash
# Deploy new version
$ ./scripts/deploy.sh b8c4d2e
[DEPLOY] state=PULL_IMAGE ...
[DEPLOY] state=START_INACTIVE ...
[DEPLOY] state=HEALTH_CHECK_INTERNAL ...
[DEPLOY] state=SWITCH_NGINX ...
[DEPLOY] state=SUCCESS duration_sec=18

# Issue discovered - rollback
$ ./scripts/deploy.sh --rollback
Current deployment : b8c4d2e
Previous deployment: a4f91c2

Deployment history:
  1. b8c4d2e (current)
  2. a4f91c2 ← rollback target
  3. 7b3e9f1

⚠️  WARNING: This will redeploy the previous version.
Current production will be replaced with: a4f91c2

Continue with rollback? (yes/no): yes
[DEPLOY] state=SUCCESS duration_sec=9 msg=DEPLOY_SUCCESS
Production is now running: a4f91c2
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Script not executable | `chmod +x scripts/deploy.sh` |
| No deployment history | Deploy at least once before rollback |
| Insufficient history | Need at least 2 deployments to rollback |
| Image not found | Verify SHA exists in GHCR |
| Health check fails | Check logs: `docker logs api-blue` |

## Performance

- **Rollback time:** variable; no sub-10-second guarantee.
- **Health check:** up to 40 HTTP attempts plus probe time, Docker health and stabilization.
- **Proxy caveat:** watchdog sync skips nginx recreation for unchanged healthy
  routing. Coordinate routing changes with the API deployment process.

Before a release or rollback, verify schema and client compatibility and keep
database backups. Historical operator SQL is under `supabase/manual/`.

## Related Docs

- [Full Documentation](./ROLLBACK_SYSTEM.md)
- [Deployment Guide](./DEPLOYMENT.md)
