/**
 * env-setup.ts — sets required environment variables before any project
 * module is imported. Vitest's setupFiles run as a side effect before each
 * test file, so assignments here take effect before env.ts processes them.
 */
process.env["NODE_ENV"] = "test";
process.env["PORT"] = "3001";
process.env["SUPABASE_URL"] = "https://placeholder.supabase.co";
process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-service-role-key-placeholder";
process.env["SUPABASE_ANON_KEY"] = "test-anon-key-placeholder";
// Minimum 32-char key for HMAC-SHA256 signing used by @fastify/jwt
process.env["SUPABASE_JWT_SECRET"] =
  "test-jwt-secret-long-enough-for-hs256-32chars!!";
process.env["REDIS_URL"] = "redis://localhost:6379";
process.env["ALLOWED_ORIGINS"] = "http://localhost:3000";
