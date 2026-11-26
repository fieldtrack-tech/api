# Infra Contract

This document defines the **canonical naming contract** between the API repo and the
infra repo. All values here are the single source of truth. CI guards enforce these
values where covered by the guards. Source audit: 2026-11-24. API and infra
currently have different routing/state behavior; guards do not enforce one
shared cross-repository deployment controller.

---

## Docker Network

```
api_network
```

All containers that need to communicate must be attached to this network.
Docker DNS resolution (`api-blue`, `api-green`, `redis`, `nginx`) only works within it.

---

## Container Names

| Role | Name |
|---|---|
| Active API slot A | `api-blue` |
| Active API slot B | `api-green` |
| Cache / queue broker | `redis` |
| Reverse proxy | `nginx` |

API containers (`api-blue`, `api-green`) must **never** bind host ports.
All traffic reaches them via `nginx` → `api_network` → container DNS.

---

## Slot File

```
/var/lib/fieldtrack/active-slot
```

Contains one of: `blue` or `green`. Written atomically after nginx reload.
Persistent across reboots (in `/var/lib`, not tmpfs `/var/run`).

This is **API deploy state**. The API script uses `FIELDTRACK_STATE_DIR` or a
`$DEPLOY_ROOT/.fieldtrack` fallback if needed. Infra `nginx-sync.sh` deliberately
does not read/write active-slot: it selects an explicit backend override, the
live config's existing container, or auto-discovers green then blue.

Backup (belt-and-suspenders):
```
/var/lib/fieldtrack/active-slot.backup
```

---

## Redis URL

```
REDIS_URL=redis://redis:6379
```

Must be used in all production and CI-production-simulation environments.
Local development may use `redis://localhost:6379` but that value must never
appear in `.env.example`, scripts, or workflows.

---

## nginx Config

Template location (infra owned; rendered by API deploy and by infra nginx sync):
```
$INFRA_ROOT/nginx/api.conf          (template — contains __ACTIVE_CONTAINER__ placeholder)
$INFRA_ROOT/nginx/live/api.conf     (live, rendered config — what nginx reads)
$INFRA_ROOT/nginx/backup/           (rolling backup directory)
```

Default `INFRA_ROOT` on server: `/opt/infra`

---

## Health Endpoints

| Endpoint | Purpose | Used where |
|---|---|---|
| `/health` | Shallow liveness check (HTTP + process alive). **Deploy gate.** | `deploy.sh`, CI |
| `/ready` | Deep readiness (Redis, DB, workers). **Observability only.** | Post-deploy logging |

`deploy.sh` must use only `/health` as the deploy gate. `/ready` is never a blocking check.

`/infra/health` is nginx-owned and returns 200 even in maintenance. HTTPS
`/health` returns 503 in maintenance and proxies API liveness in active mode.
The nginx `/ready` location permits loopback and a hard-coded 172.17.0.0/16
subnet, which may not match the external `api_network` subnet.

---

## API Deploy Script Invariants

- `deploy.sh` **never** starts infra services (nginx, Redis) — only renders and reloads nginx config
- API containers run `--network api_network` with **no** `-p` (host port) bindings
- API nginx switches normally use `docker exec nginx nginx -t` followed by a
  graceful reload, with additional restore/initial-bootstrap paths on failure.
- Slot file is written **after** nginx reload — always reflects what nginx is actually serving

---

## External Dependencies (infra repo)

Required layout under **`INFRA_ROOT=/opt/infra`** (canonical; scripts default to this path):

```
$INFRA_ROOT/nginx/live/                    (directory — deploy writes live api.conf)
$INFRA_ROOT/nginx/backup/                  (directory — rolling backups)
$INFRA_ROOT/nginx/api.conf                 (template with placeholders — infra managed)
$INFRA_ROOT/docker-compose.nginx.yml      (operator starts nginx from here)
$INFRA_ROOT/docker-compose.redis.yml       (operator starts redis from here)
```

The API deploy script (`scripts/deploy.sh`) and `scripts/vps-readiness-check.sh` fail fast if these paths are missing. Compose files are not executed by deploy; they must exist so operators (and checks) know the canonical layout.

## Coordination and reliability caveats

Infra sync force-recreates nginx and the infra workflow installs a once-per-minute
sync watchdog. The sync script has no unchanged-config no-op or shared API deploy
lock. Both controllers can write `$INFRA_ROOT/nginx/live/api.conf`; coordinate
them until locking/ownership is unified. Proxy restarts interrupt long-lived
connections, so the API's blue-green slot model alone is not zero downtime.

The checked-in Redis broker has AOF but uses `allkeys-lru` at 200 MB, which can
evict BullMQ state. It has no configured password or TLS on the private bridge.
Do not document guaranteed queue durability or encrypted HMAC-secret transport
from this compose file. Monitoring is operationally optional, but its containers
share the host/network and can still contribute resource pressure.
