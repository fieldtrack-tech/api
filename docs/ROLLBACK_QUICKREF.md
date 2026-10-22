# Rollback System Quick Reference

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
4. Blue-green deployment ensures zero downtime
5. Health checks validate before switching traffic

## Deployment Flow

```
┌──────────────┐
│  Build and   │
│  image SHA   │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ deploy-blue      │
│ green.sh <SHA>   │
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
│ deploy-blue      │
│ green.sh <SHA>   │
└──────────────────┘
```

## Safety Features

- ✅ Interactive confirmation before rollback
- ✅ Health check validation (20 attempts × 3s)
- ✅ Nginx config validation before reload
- ✅ Automatic cleanup on failure
- ✅ Zero downtime blue-green deployment
- ✅ Immutable image SHAs

## File Locations

```
/api/
├── scripts/
│   └── deploy.sh           # Deploy and rollback
└── .deploy_history (last 5 SHAs)
```

## Example Session

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

- **Rollback time:** <10 seconds
- **Health check:** Up to 60 seconds
- **Zero downtime:** Always maintained

## Related Docs

- [Full Documentation](./ROLLBACK_SYSTEM.md)
- [Deployment Guide](./DEPLOYMENT.md)
