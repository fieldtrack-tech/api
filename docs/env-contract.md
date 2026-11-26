# FieldTrack API — Environment Variable Contract

> Source-aligned reference audited 2026-11-24. `src/config/env.ts` is the executable
> API schema; templates/workflows and the web/Android/infra configuration must be
> checked separately rather than assumed synchronized.
>
> When in doubt about a variable's name, type, or where it belongs — read this document first.

---

## Layer Model

```
┌──────────────────────────────────────────────────────────────────┐
│  LAYER          │  KEY VARIABLES               │  SCOPE          │
├──────────────────────────────────────────────────────────────────┤
│  Backend (API)  │  API_BASE_URL                │  EXTERNAL URL   │
│                 │  APP_BASE_URL                │  EXTERNAL URL   │
│                 │  FRONTEND_BASE_URL           │  EXTERNAL URL   │
│                 │  PORT, CORS_ORIGIN, …        │  INTERNAL       │
├──────────────────────────────────────────────────────────────────┤
│  CI / Scripts   │  API_BASE_URL                │  EXTERNAL URL   │
│                 │  CORS_ORIGIN                 │  DEPLOY CONFIG  │
├──────────────────────────────────────────────────────────────────┤
│  Infra          │  API_HOSTNAME                │  DOMAIN ONLY    │
│                 │  METRICS_SCRAPE_TOKEN        │  SECURITY       │
│                 │  GRAFANA_ADMIN_PASSWORD      │  SECURITY       │
└──────────────────────────────────────────────────────────────────┘
```

---

## Naming Rules

| Pattern | Meaning | Example |
|---------|---------|---------|
| `*_BASE_URL` | Full URL — scheme + host, **no trailing slash** | `https://api.getfieldtrack.app` |
| `*_HOSTNAME` | Bare domain — **no scheme, no path** | `api.getfieldtrack.app` |

API deploy derives `API_HOSTNAME` from `API_BASE_URL` for rendering. Standalone
infra scripts require `API_HOSTNAME` to be exported or supplied in their own
`.env.monitoring`; they do not load the API's `.env`. Use the same hostname in
both layers. Runtime defaults remain local to each repository.

---

## Backend

Validated by `src/config/env.ts` (Zod schema, fail-fast).

### URLs

| Variable | Required in Prod | Type | Purpose |
|----------|:---:|------|---------|
| `API_BASE_URL` | ✅ | `https://…` URL | **The canonical public URL of this API.** Used in OpenAPI server definitions and any server-generated links referencing the API itself. Also used by deploy scripts and CI health checks. |
| `APP_BASE_URL` | ✅ | Absolute URL | Canonical application URL, currently validated/logged as configuration. |
| `FRONTEND_BASE_URL` | ✅ | Absolute URL | Public web URL, currently validated/logged; password-reset/invitation endpoints are not implemented. |

#### `FRONTEND_BASE_URL` — Usage Contract

`FRONTEND_BASE_URL` is the **single canonical variable** for the frontend URL. There are no aliases.

**Current use:** startup validation, configuration logging and public config
metadata. Email/invitation URL comments describe intended future consumers,
not working `/reset-password` or `/accept-invite` flows in this checkout.

**NOT used for:**
- CORS allowed-origin configuration (use `CORS_ORIGIN`)
- API routing or reverse-proxy targets
- Internal service-to-service calls

**Validation rules (enforced at startup by Zod):**
- Must be a valid absolute URL. Use HTTP/S for supported deployments and HTTPS
  in production; the URL schema itself does not enforce HTTPS.
- Must **not** end with a trailing slash — trailing slashes are stripped automatically and asserted by schema refine
- Optional outside production; **required in production** — startup fails if absent when `APP_ENV=production`
- No fallback — if the value is missing in production, the process exits with a clear error

### Runtime

| Variable | Required | Default | Purpose |
|----------|:---:|---------|---------|
| `CONFIG_VERSION` | Production explicit | `"1"` outside production | Must be exactly `"1"`; production cannot rely on the default. |
| `APP_ENV` | ✅ | `development` | Canonical application environment. Drive ALL app-level logic from this. Falls back to `NODE_ENV`. |
| `NODE_ENV` | — | `development` | Kept for npm/Node ecosystem compatibility only. **Never use for app logic.** |
| `PORT` | — | `3000` | Validated range 1000–65535. Production Docker/deploy probes are fixed to 3000; local API development may use 3001 to avoid the web app's port 3000. |
| `WORKERS_ENABLED` | Production explicit true | `false` | Zod infrastructure flag. Accepts true/1; workers also skip when APP_ENV or NODE_ENV is test. |

### Auth & Data

| Variable | Required | Purpose |
|----------|:---:|---------|
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_ANON_KEY` | ✅ | Supabase public/anon key (safe for browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key — bypasses RLS. **Never expose to clients.** |
| `SUPABASE_JWT_SECRET` | Test harness only | Not in the API environment schema. Test JWT signing uses fake HS256 credentials; runtime verification uses ES256/JWKS. |
| `REDIS_URL` | ✅ | Redis connection URL (`redis://` or `rediss://`) |

### Security & Observability

| Variable | Required in Prod | Default | Purpose |
|----------|:---:|---------|---------|
| `CORS_ORIGIN` | ✅ | `""` (dev fallback) | Comma-separated allowed CORS origins. Empty in dev activates safe localhost fallback. Must be explicit in production. |
| `METRICS_SCRAPE_TOKEN` | ✅ | — | Bearer token Prometheus must present to scrape `/metrics`. Unset = open in dev/test. **Must** be set in production. |
| `TEMPO_ENDPOINT` | — | `http://tempo:4318` | OTLP HTTP endpoint for Grafana Tempo traces. |
| `SERVICE_NAME` | — | `fieldtrack-api` | OpenTelemetry service name label. |
| `GITHUB_SHA` | — | `"manual"` | Git commit SHA. Auto-injected by GitHub Actions. |

### Limits

| Variable | Default | Purpose |
|----------|---------|---------|
| `BODY_LIMIT_BYTES` | `1000000` | Max request body size (bytes). DDoS protection. |
| `REQUEST_TIMEOUT_MS` | `30000` | Fastify connection timeout (ms). |
| `MAX_QUEUE_DEPTH` | `1000` | Max BullMQ queue depth before new enqueues are rejected. |
| `MAX_POINTS_PER_SESSION` | `50000` | Max GPS points per session for recalculation jobs. |
| `MAX_SESSION_DURATION_HOURS` | `168` | Sessions older than this (hours) are skipped as anomalies. |
| `WORKER_CONCURRENCY` | `1` | Distance worker job concurrency per replica. |
| `ANALYTICS_WORKER_CONCURRENCY` | `5` | Analytics worker job concurrency (1–50). |
| `WEBHOOK_WORKER_CONCURRENCY` | `5` | Webhook concurrency, 1–20. |
| `WEBHOOK_MAX_PAYLOAD_BYTES` | `262144` | Outbound webhook payload cap, 16384–1000000 bytes. |
| `WEBHOOK_DLQ_MAX_SIZE` | `10000` | Webhook dead-letter queue capacity. |
| `WEBHOOK_DLQ_RETENTION_DAYS` | `30` | Archive/purge window, 14–30 days. |

`REQUEST_TIMEOUT_MS` is passed as Fastify `connectionTimeout`; it is not an
end-to-end deadline for Supabase calls or readiness probes. Direct image uploads
go to Storage, so their 5 MB limit is separate from the API JSON body limit.

### Tooling-only variables (not API business configuration)

| Variable | Purpose |
|----------|---------|
| `CI` | Auto-set by GitHub Actions. Used for logging only. |
| `FIELDTRACK_PGLITE_MODULE` | File URL/package import for isolated SQL verification; not used by the API server. |

Disabling workers uses in-memory rate limiting and omits queue-management routes.
It does not make all readiness or queue business paths independent of Redis.

---

## CI / Scripts — GitHub Actions + Shell Scripts

Variables consumed by deploy scripts and workflows.
Stored as **GitHub repository secrets**.

| Secret Name | Purpose | Used By |
|------------|---------|---------|
| `API_BASE_URL` | Full public URL of the API for health probes | `deploy.yml`, `deploy.sh` |
| `CORS_ORIGIN` | Allowed CORS origins for the deployed container | `deploy.yml` (pre-flight validation) |
| `DO_HOST` | DigitalOcean VPS IP / hostname | SSH deploy steps |
| `DO_USER` | SSH username on VPS | SSH deploy steps |
| `DO_SSH_KEY` | SSH private key (PEM) | SSH deploy steps |

> **Renamed:** `FT_API_BASE_URL` → `API_BASE_URL`. Update the GitHub repo secret accordingly.

---

## Infra (standalone infra repository) — `.env.monitoring`

Used by Docker Compose for Prometheus, Grafana, Nginx, Blackbox Exporter.

| Variable | Required | Purpose |
|----------|:---:|---------|
| `API_HOSTNAME` | ✅ | Bare domain for Prometheus scrape target and Grafana root URL. **Always derived from `API_BASE_URL`** — set explicitly here to match. Example: `api.getfieldtrack.app` |

| `GRAFANA_ADMIN_PASSWORD` | ✅ | Grafana admin account password (min 12 chars). |
| `METRICS_SCRAPE_TOKEN` | ✅ | **Must be identical to `METRICS_SCRAPE_TOKEN` in `.env`.** Bearer token for `/metrics` scraping. |
| `ALERTMANAGER_SLACK_WEBHOOK` | ✅ | Slack incoming webhook URL for alert delivery. |

---

## Environment Examples

### Development (`.env.local` / `.env`)

```bash
# Backend .env
CONFIG_VERSION=1
APP_ENV=development
NODE_ENV=development
PORT=3001
APP_BASE_URL=http://localhost:3001
API_BASE_URL=http://localhost:3001
FRONTEND_BASE_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_JWT_SECRET=at-least-32-chars-long-for-hs256-dev
REDIS_URL=redis://localhost:6379
```

### Staging

```bash
# Backend
APP_ENV=staging
API_BASE_URL=https://api.staging.getfieldtrack.app
APP_BASE_URL=https://staging.getfieldtrack.app
FRONTEND_BASE_URL=https://app.staging.getfieldtrack.app
CORS_ORIGIN=https://app.staging.getfieldtrack.app

# Infra
API_HOSTNAME=api.staging.getfieldtrack.app
```

### Production

```bash
# Backend
APP_ENV=production
NODE_ENV=production
API_BASE_URL=https://api.getfieldtrack.app
APP_BASE_URL=https://getfieldtrack.app
FRONTEND_BASE_URL=https://app.getfieldtrack.app
CORS_ORIGIN=https://app.getfieldtrack.app
METRICS_SCRAPE_TOKEN=<openssl rand -hex 32>

# Infra (.env.monitoring in infra repo on VPS)
API_HOSTNAME=api.getfieldtrack.app
METRICS_SCRAPE_TOKEN=<same token as backend>
GRAFANA_ADMIN_PASSWORD=<strong password>

# GitHub Secrets (repo settings → Secrets and variables → Actions)
API_BASE_URL=https://api.getfieldtrack.app
CORS_ORIGIN=https://app.getfieldtrack.app
DO_HOST=<vps-ip>
DO_USER=ashish
DO_SSH_KEY=<pem private key>
```

---

## Internal vs External Distinction

| Variable | Internal / External | Notes |
|----------|-------------------|-------|
| `PORT` | INTERNAL | Container-to-container port. Never exposed directly. |
| `REDIS_URL` | INTERNAL | Container network DNS (`redis://redis:6379`). |
| `TEMPO_ENDPOINT` | INTERNAL | Container network DNS (`http://tempo:4318`). |
| `SUPABASE_URL` | EXTERNAL | Supabase managed service. |
| `API_BASE_URL` | EXTERNAL | Public internet URL. |
| `APP_BASE_URL` | EXTERNAL | Public internet URL. |
| `FRONTEND_BASE_URL` | EXTERNAL | Public internet URL. Points to the web frontend (fieldtrack-tech/web). |
| `API_HOSTNAME` | INFRA-INTERNAL | Used for Nginx/Prometheus config, derived from `API_BASE_URL`. |

---

## Migration Notes

Company currency/timezone are database settings, not environment variables:
INR / IST (UTC+05:30, `Asia/Kolkata`) defaults, confirmed from the admin dashboard.
Warehouse rates/radii and employee basic pay also live in database tables.

Web configuration uses `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` and server-only `API_DESTINATION_URL` in proxy mode.
Android uses `API_BASE_URL` in `local.properties` for debug builds; release uses
the build script's production URL. Never place a service-role key in either client.

The following variables were **renamed** as part of the env contract cleanup (March 2026):

| Old Name | New Name | Where |
|----------|----------|-------|
| `FT_API_BASE_URL` | `API_BASE_URL` | GitHub secrets, `deploy.yml` |

**Action required:**
1. Rename the GitHub repository secret `FT_API_BASE_URL` → `API_BASE_URL`
