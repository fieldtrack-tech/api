/**
 * env-setup.ts — sets required environment variables before any project
 * module is imported. Vitest's setupFiles run as a side effect before each
 * test file, so assignments here take effect before env.ts processes them.
 *
 * APP_ENV=test skips production-only safety checks (METRICS_SCRAPE_TOKEN,
 * CORS_ORIGIN, etc.) in the Zod superRefine guards in env.ts.
 *
 * Non-empty injected values are preserved, while blank placeholders in a
 * local `.env` are replaced with safe test defaults.
 */
const setTestDefault = (name: string, value: string): void => {
  if (!process.env[name]?.trim()) process.env[name] = value;
};

process.env["APP_ENV"] = "test";
process.env["NODE_ENV"] = "test";
process.env["PORT"] = "3001";
setTestDefault("SUPABASE_URL", "https://placeholder.supabase.co");
setTestDefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key-placeholder");
setTestDefault("SUPABASE_ANON_KEY", "test-anon-key-placeholder");
setTestDefault("SUPABASE_JWT_SECRET", "test-jwt-secret-placeholder");
setTestDefault("REDIS_URL", "redis://localhost:6379");
setTestDefault("TEMPO_ENDPOINT", "http://localhost:4318");
setTestDefault("CORS_ORIGIN", "http://localhost:3000");
// Disable OTel SDK in tests — prevents network dial-out and import-time
// side effects caused by sdk.start() during module loading.
process.env["OTEL_SDK_DISABLED"] = "true";
