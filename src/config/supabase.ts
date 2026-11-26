import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env.js";

/**
 * IMPORTANT:
 * Backend repositories must use supabaseServiceClient.
 * Create an isolated, stateless auth client per session exchange.
 *
 * The auth client uses the anon key and is separate from backend repositories.
 *
 * supabaseServiceClient — uses the SERVICE ROLE key. Bypasses RLS.
 * Required for all backend repository queries. Tenant isolation is
 * enforced in application code via enforceTenant() instead of RLS.
 *
 * Architecture:
 *   Auth exchange → createSupabaseAuthClient (RLS enforced)
 *   Backend  → supabaseServiceClient (RLS bypassed, enforceTenant() applied)
 *
 * Importing this module does not trigger env validation or network activity.
 */

let _serviceClient: SupabaseClient | undefined;

export function createSupabaseAuthClient(): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export const supabaseServiceClient: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    if (!_serviceClient) {
      _serviceClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    }
    return Reflect.get(_serviceClient, prop, receiver);
  },
});
