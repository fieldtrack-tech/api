# FieldTrack 2.0 Rollback System

## Overview

The rollback system redeploys a previously successful Docker image without a
source rebuild. Source audit: 2026-11-24. Duration depends on pulls, HTTP probes,
Docker health and stabilization; recovery in less than 10 seconds is not guaranteed.
An image rollback does not reverse database migrations.

## Architecture

### Components

1. **deploy.sh** - Unified blue-green deployment and rollback script
2. **.deploy_history** - Deployment history file storing the last 5 deployed image SHAs

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    Deployment Flow                          │
└─────────────────────────────────────────────────────────────┘

1. CI builds image → ghcr.io/fieldtrack-tech/api:a4f91c2
2. Deploy script pulls image and performs blue-green deployment
3. After successful deployment → prepends "a4f91c2" to .deploy_history
4. History maintains last 5 deployments
5. If deployment fails → `deploy.sh --rollback --auto` is triggered by CI
6. Rollback redeploys previous image using `deploy.sh <sha>`
```

### Deployment Tracking

The deployment script maintains a history of the last 5 successful deployments:

```bash
# Location
$DEPLOY_ROOT/.deploy_history

# Content (newest first, one SHA per line)
b8c4d2e
a4f91c2
7b3e9f1
91d0f32
c5a8e7d
```

Each line represents a successful deployment. The file is updated only after:
- Image successfully pulled
- Container started
- Health checks passed
- Nginx switched to new container
- Old container removed

The history is maintained using a rolling window:
- New deployments are prepended to the file
- Only the 5 most recent deployments are kept
- Older deployments are automatically removed

## Usage

### Normal Deployment

Deploy the latest image from CI:

```bash
cd "$HOME/api"
./scripts/deploy.sh a4f91c2
```

### Rollback to Previous Version

Instantly restore the last working deployment:

```bash
cd "$HOME/api"
./scripts/deploy.sh --rollback
```

**Illustrative history display:** the current script prints current SHA and
rollback target; inspect `.deploy_history` separately for the full five-entry list.
```
Current deployment : b8c4d2e
Previous deployment: a4f91c2

Deployment history:
  1. b8c4d2e (current)
  2. a4f91c2 ← rollback target
  3. 7b3e9f1
  4. 91d0f32
  5. c5a8e7d

⚠️  WARNING: This will redeploy the previous version.
Current production will be replaced with: a4f91c2

Continue with rollback? (yes/no):
```

### Deploy Specific Version

Manually deploy any historical image:

```bash
# Deploy a specific commit SHA
./scripts/deploy.sh 7b3e9f1
```

## Safety Features

### 1. Deployment History Validation

Rollback script validates deployment history before proceeding:

```bash
# Checks if .deploy_history exists
# Checks if at least 2 deployments recorded
# Shows full deployment history
# Exits with error if insufficient history
```

### 2. Interactive Confirmation

Rollback requires explicit user confirmation to prevent accidental rollbacks.

### 3. Health Check Validation

Both deployment and rollback perform health checks before switching traffic:

```bash
# Up to 40 HTTP attempts, 3–5-second sleeps plus probe time
# Separate Docker HEALTHCHECK wait and pre-switch/stability probes
# Automatic cleanup if health check fails
# No traffic switched to unhealthy containers
```

### 4. Atomic Nginx Switch

Nginx configuration is validated before reload:

```bash
docker exec nginx nginx -t
docker exec nginx nginx -s reload
```

## Rollback Scenarios

### Scenario 1: Broken Deployment

```bash
# Deploy new version
./scripts/deploy.sh b8c4d2e

# Health check fails → deployment aborted
# Production still running previous version
# No rollback needed
```

### Scenario 2: Post-Deployment Issue

```bash
# Deploy succeeds but issue discovered later
./scripts/deploy.sh --rollback

# Confirms rollback
# Redeploys the previous image; duration depends on health/pull checks
# Production restored
```

### Scenario 3: Manual Version Selection

```bash
# Need to deploy a specific older version
./scripts/deploy.sh 7b3e9f1

# Pulls specific image from GHCR
# Performs blue-green deployment
# Prepends SHA to .deploy_history (rolling last 5)
```

## Integration with CI/CD

### GitHub Actions Workflow

```yaml
- name: Deploy to VPS
  run: |
    ssh ${{ secrets.DO_USER }}@${{ secrets.DO_HOST }} \
      "cd \"$HOME/api\" && \
       ./scripts/deploy.sh ${{ env.SHA_SHORT }}"
```

### Deployment History

Every CI deployment automatically updates `.deploy_history`:

```
Commit a4f91c2 → Deploy → .deploy_history = ["a4f91c2"]
Commit b8c4d2e → Deploy → .deploy_history = ["b8c4d2e", "a4f91c2"]
Commit c5f7a1b → Deploy → .deploy_history = ["c5f7a1b", "b8c4d2e", "a4f91c2"]
Rollback       → Deploy → .deploy_history = ["b8c4d2e", "c5f7a1b", "b8c4d2e", "a4f91c2"]
```

The history maintains the last 5 deployments in chronological order (newest first).

## File Locations

```
$HOME/api/
├── scripts/
│   └── deploy.sh             # Unified deploy + rollback
├── .deploy_history           # Last 5 deployment SHAs
└── .env                      # Environment configuration
```

## Troubleshooting

### Rollback Script Not Found

```bash
# Make script executable
chmod +x scripts/deploy.sh
```

### No Deployment History

```
ERROR: No deployment history found.
File not found: $HOME/api/.deploy_history
```

**Solution:** Deploy at least once before attempting rollback.

### Insufficient Deployment History

```
ERROR: Insufficient deployment history.
Current deployment: b8c4d2e

Need at least 2 deployments to rollback.
Cannot rollback - this is the first or only deployment.
```

**Solution:** Deploy at least twice before attempting rollback.

### Image Not Found in Registry

```
Error response from daemon: manifest for ghcr.io/fieldtrack-tech/api:abc123 not found
```

**Solution:** Verify the image SHA exists in GitHub Container Registry.

## Performance

- **Rollback time:** variable; no measured recovery-time guarantee in this audit.
- **Health check:** up to 40 HTTP attempts with jitter, plus independent Docker health and stabilization checks.
- **Availability goal:** the old API slot remains until the replacement is healthy.
  Infra nginx sync/watchdog recreates the proxy, so workspace-wide zero downtime
  cannot be guaranteed merely by the blue-green API script.

## Security Considerations

1. **Immutable images:** Each deployment uses a specific SHA, preventing tag mutation
2. **Health validation:** No traffic switched to unhealthy containers
3. **Nginx validation:** Configuration tested before reload
4. **Confirmation prompt:** Prevents accidental rollbacks
5. **Deployment state:** history plus the active-slot, backup and last-good state
   managed under `FIELDTRACK_STATE_DIR` (default `/var/lib/fieldtrack`, with a
   `$DEPLOY_ROOT/.fieldtrack` fallback).

Coordinate API deployments with infra watchdog/config changes: they currently
write the same live nginx file without a shared cross-repository lock. If the
release changes SQL/client contracts, verify the old image remains compatible
before rollback. Do not execute destructive SQL simply because an image failed.

## Future Enhancements

Potential improvements (not currently implemented):

- Rollback to specific history entry (e.g., rollback to entry 3)
- Shared API/infra deployment locking and non-disruptive proxy reloads
- Deployment metadata (timestamp, deployer, commit message)
- Rollback notifications (Slack, email)
- Deployment audit log with full details

## Related Documentation

- [Blue-Green Deployment](./DEPLOYMENT.md)
- [CI/CD Pipeline](../.github/workflows/deploy.yml)
