import type { FastifyRequest } from "fastify";

/**
 * Enforces tenant isolation by scoping a query to the
 * authenticated user's organization_id.
 *
 * Usage (when Supabase client is wired up):
 *
 *   const query = supabase.from("expenses").select("*");
 *   const scoped = enforceTenant(request, query);
 *   const { data, error } = await scoped;
 *
 * This ensures every data query is automatically filtered
 * to the tenant boundary — preventing cross-org data access.
 */

/**
 * Generic interface matching Supabase's PostgrestFilterBuilder pattern.
 * Using a minimal structural type so we don't need a hard dependency
 * on @supabase/postgrest-js at this stage.
 */
interface FilterBuilder<T> {
    eq(column: string, value: string): T;
}

export function enforceTenant<T extends FilterBuilder<T>>(
    request: FastifyRequest,
    query: T
): T {
    return query.eq("organization_id", request.organizationId);
}
