/**
 * @fieldtrack/config — Environment Contract for FieldTrack 2.0
 *
 * Single source of truth for ALL environment variable names, purposes,
 * and layer ownership across this backend repository.
 *
 * Layer model:
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │  LAYER          │  VARIABLES                  │  SCOPE          │
 *   ├─────────────────┼─────────────────────────────┼─────────────────┤
 *   │  Backend (API)  │  API_BASE_URL               │  External URL   │
 *   │                 │  APP_BASE_URL               │  External URL   │
 *   │                 │  FRONTEND_BASE_URL          │  External URL   │
 *   │                 │  PORT, CORS_ORIGIN, …       │  Internal       │
 *   ├─────────────────┼─────────────────────────────┼─────────────────┤
 *   │  CI / Scripts   │  API_BASE_URL               │  External URL   │
 *   │                 │  CORS_ORIGIN                │  Deploy config  │
 *   ├─────────────────┼─────────────────────────────┼─────────────────┤
 *   │  Infra          │  API_HOSTNAME               │  Domain only    │
 *   │                 │  METRICS_SCRAPE_TOKEN       │  Security       │
 *   │                 │  GRAFANA_ADMIN_PASSWORD     │  Security       │
 *   └─────────────────┴─────────────────────────────┴─────────────────┘
 *
 * Naming rules (MUST be enforced across all layers):
 *
 *   1. Variables ending in _BASE_URL hold a full URL (scheme + host, no path).
 *      Example: https://api.getfieldtrack.app
 *
 *   2. Variables ending in _HOSTNAME hold a bare domain with no scheme or path.
 *      Example: api.getfieldtrack.app
 *
 *   3. API_BASE_URL is the canonical external API URL used by all layers.
 *      - Backend:  loaded from .env, required in production
 *      - Scripts:  exported by load-env.sh, used by smoke-test.sh
 *      - CI:       passed as GitHub secret API_BASE_URL
 *
 *   4. API_HOSTNAME is always DERIVED from API_BASE_URL at deploy-time.
 *      It MUST NOT be set directly in apps/api/.env.
 *
 *   5. FRONTEND_BASE_URL is the public URL of the web frontend (maintained in
 *      a separate repository: fieldtrack-tech/web). Used by the API to build
 *      password-reset and invitation email links.
 *
 * Usage:
 *   import { ENV_VARS, EnvLayerContract } from "@fieldtrack/config";
 */

import { z } from "zod";

// ─── Shared URL schema primitive ──────────────────────────────────────────────

/**
 * Zod schema for an optional base URL.
 * Strips trailing slashes and validates http(s):// format.
 * Accepts undefined / empty string as "not set".
 */
export const optionalBaseUrl = z.preprocess(
  (val) =>
    typeof val === "string" && val.trim().length > 0
      ? val.trim().replace(/\/+$/, "")
      : undefined,
  z.string().url().optional(),
);

/**
 * Zod schema for a required base URL.
 */
export const requiredBaseUrl = z.string().url();

// ─── Layer-specific type contracts ────────────────────────────────────────────

/**
 * Backend API environment contract (apps/api).
 *
 * All variables validated by apps/api/src/config/env.ts.
 * This interface is the canonical type reference.
 */
export interface BackendEnvContract {
  // Runtime
  APP_ENV: "development" | "staging" | "production" | "test";
  NODE_ENV: string;
  PORT: number;

  // External URLs (full URL, no trailing slash)
  APP_BASE_URL?: string;      // Canonical app URL for link generation
  API_BASE_URL?: string;      // This API's public URL (EXTERNAL)
  /**
   * Public URL of the web frontend (fieldtrack-tech/web).
   *
   * Single canonical variable \u2014 no aliases.
   *
   * Used ONLY for:
   *   - Password-reset email links
   *   - Invitation email links
   *   - User-facing redirects
   *
   * Validation: valid absolute URL, no trailing slash. Required in production.
   */
  FRONTEND_BASE_URL?: string;  // Frontend URL for email links (EXTERNAL)

  // CORS
  CORS_ORIGIN: string;

  // Supabase
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;

  // Redis
  REDIS_URL: string;

  // Security
  METRICS_SCRAPE_TOKEN?: string;

  // Observability
  TEMPO_ENDPOINT: string;
  SERVICE_NAME: string;
  GITHUB_SHA?: string;

  // Limits
  BODY_LIMIT_BYTES: number;
  REQUEST_TIMEOUT_MS: number;
  MAX_QUEUE_DEPTH: number;
  MAX_POINTS_PER_SESSION: number;
  MAX_SESSION_DURATION_HOURS: number;
  WORKER_CONCURRENCY: number;
  ANALYTICS_WORKER_CONCURRENCY: number;

  // Infrastructure availability
  WORKERS_ENABLED: boolean;
}

/**
 * Infra monitoring environment contract (infra/.env.monitoring).
 *
 * Used by Docker Compose for Prometheus, Grafana, Nginx, Blackbox.
 */
export interface InfraEnvContract {
  // Domain only — no scheme, no path. Derived from API_BASE_URL.
  // Example: api.getfieldtrack.app
  API_HOSTNAME: string;

  GRAFANA_ADMIN_PASSWORD: string;

  // MUST match METRICS_SCRAPE_TOKEN in apps/api/.env
  METRICS_SCRAPE_TOKEN: string;
}

/**
 * CI / script environment contract.
 *
 * Variables consumed by deploy scripts, smoke tests, and GitHub Actions.
 * Stored as GitHub repository secrets.
 */
export interface CIEnvContract {
  // Full public URL of the API used for health probes and smoke tests.
  // GitHub secret: API_BASE_URL
  // Example: https://api.getfieldtrack.app
  API_BASE_URL: string;

  // Allowed CORS origins passed to the deployed container.
  // GitHub secret: CORS_ORIGIN
  CORS_ORIGIN: string;

  // SSH deployment credentials
  DO_HOST: string;
  DO_USER: string;
  DO_SSH_KEY: string;

  // Smoke test credentials
  FT_EMP_EMAIL: string;
  FT_EMP_PASSWORD: string;
  FT_ADMIN_EMAIL: string;
  FT_ADMIN_PASSWORD: string;

  // Supabase (for smoke test auth)
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

// ─── ENV_VARS registry ────────────────────────────────────────────────────────

/**
 * Registry of ALL environment variable names across all layers.
 *
 * Use these constants instead of bare strings to avoid typos.
 *
 * @example
 *   import { ENV_VARS } from "@fieldtrack/config";
 *   const url = process.env[ENV_VARS.API_BASE_URL];
 */
export const ENV_VARS = {
  // ── Backend / CI shared ────────────────────────────────────────────────────
  API_BASE_URL:       "API_BASE_URL",
  APP_BASE_URL:       "APP_BASE_URL",
  FRONTEND_BASE_URL:  "FRONTEND_BASE_URL",
  CORS_ORIGIN:        "CORS_ORIGIN",

  // ── Backend only ──────────────────────────────────────────────────────────
  APP_ENV:                      "APP_ENV",
  NODE_ENV:                     "NODE_ENV",
  PORT:                         "PORT",
  CONFIG_VERSION:               "CONFIG_VERSION",
  SUPABASE_URL:                 "SUPABASE_URL",
  SUPABASE_ANON_KEY:            "SUPABASE_ANON_KEY",
  SUPABASE_SERVICE_ROLE_KEY:    "SUPABASE_SERVICE_ROLE_KEY",
  REDIS_URL:                    "REDIS_URL",
  METRICS_SCRAPE_TOKEN:         "METRICS_SCRAPE_TOKEN",
  TEMPO_ENDPOINT:               "TEMPO_ENDPOINT",
  SERVICE_NAME:                 "SERVICE_NAME",
  GITHUB_SHA:                   "GITHUB_SHA",
  BODY_LIMIT_BYTES:             "BODY_LIMIT_BYTES",
  REQUEST_TIMEOUT_MS:           "REQUEST_TIMEOUT_MS",
  MAX_QUEUE_DEPTH:              "MAX_QUEUE_DEPTH",
  MAX_POINTS_PER_SESSION:       "MAX_POINTS_PER_SESSION",
  MAX_SESSION_DURATION_HOURS:   "MAX_SESSION_DURATION_HOURS",
  WORKER_CONCURRENCY:           "WORKER_CONCURRENCY",
  ANALYTICS_WORKER_CONCURRENCY: "ANALYTICS_WORKER_CONCURRENCY",
  WORKERS_ENABLED:              "WORKERS_ENABLED",

  // ── Infra-only ────────────────────────────────────────────────────────────
  API_HOSTNAME:            "API_HOSTNAME",
  GRAFANA_ADMIN_PASSWORD:  "GRAFANA_ADMIN_PASSWORD",
} as const;

export type EnvVarName = (typeof ENV_VARS)[keyof typeof ENV_VARS];
