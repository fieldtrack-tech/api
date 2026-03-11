import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

/**
 * IMPORTANT:
 * Backend repositories must use supabaseServiceClient.
 * supabaseAnonClient is reserved for frontend access only.
 *
 * supabaseAnonClient — uses the ANON key. RLS is enforced by default.
 * Frontend clients only. Not used in backend repository queries.
 *
 * supabaseServiceClient — uses the SERVICE ROLE key. Bypasses RLS.
 * Required for all backend repository queries. Tenant isolation is
 * enforced in application code via enforceTenant() instead of RLS.
 *
 * Architecture:
 *   Frontend → supabaseAnonClient (RLS enforced)
 *   Backend  → supabaseServiceClient (RLS bypassed, enforceTenant() applied)
 */
export const supabaseAnonClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
);

export const supabaseServiceClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
);
