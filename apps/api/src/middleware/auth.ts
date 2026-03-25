import type { FastifyRequest, FastifyReply } from "fastify";
import { trace, context } from "@opentelemetry/api";
import { validate as uuidValidate } from "uuid";
import { jwtPayloadSchema } from "../types/jwt.js";
import { AppError, UnauthorizedError } from "../utils/errors.js";
import { fail } from "../utils/response.js";
import { verifySupabaseToken } from "../auth/jwtVerifier.js";
import { env } from "../config/env.js";

/**
 * Layer 2 — Authentication Middleware
 *
 * Fastify preHandler that authenticates incoming requests.
 *
 * Phase 20: Updated to use Supabase JWKS verification (ES256) in production.
 * In test mode, falls back to @fastify/jwt for compatibility with test tokens.
 *
 * Responsibilities:
 * 1. Extract token from Authorization header
 * 2. Verify token signature (delegates to Layer 1)
 * 3. Load user data from database
 * 4. Validate complete user context
 * 5. Attach authenticated user to request
 *
 * This middleware handles HTTP-specific concerns (headers, responses)
 * while Layer 1 (verifySupabaseToken) handles pure token verification.
 *
 * Any request that fails verification or has malformed claims
 * is rejected with a 401 Unauthorized response.
 */
export async function authenticate(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    try {
        // Step 1: Extract token from Authorization header
        const authHeader = request.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            throw new UnauthorizedError("Missing or malformed Authorization header");
        }

        const token = authHeader.substring(7); // Remove "Bearer " prefix

        let userId: string;
        let email: string | undefined;
        let role: string | undefined;
        let organizationId: string | undefined;

        // Step 2: Verify token signature (Layer 1)
        // In test mode (APP_ENV=test), use @fastify/jwt for backward compatibility
        // In production, use Supabase JWKS verification
        if (env.APP_ENV === "test") {
            // Test mode: use @fastify/jwt (synchronous verification)
            try {
                const decoded = request.server.jwt.verify(token) as { sub: string; role?: string; email?: string; organization_id?: string; employee_id?: string };
                userId = decoded.sub;
                role = decoded.role; // Test tokens have role at top level
                email = decoded.email;
                organizationId = decoded.organization_id;
                // Test tokens embed employee_id directly to avoid a DB call in tests.
                // signEmployeeToken includes it; ADMIN tokens omit it → undefined.
                // Guard: employee_id embedding is only valid in test mode.
                // Uses the centralized env.APP_ENV so all environment checks
                // flow through the validated config — no raw process.env access.
                if (env.APP_ENV === "test") {
                    request.employeeId = decoded.employee_id ?? undefined;
                }
            } catch {
                throw new UnauthorizedError("Invalid or expired token");
            }
        } else {
            // Production mode: use Supabase JWKS verification (Layer 1)
            const decoded = await verifySupabaseToken(token);

            userId = decoded.sub;
            email = decoded.email;

            // Validate UUID format for sub to stop malformed tokens early
            if (!uuidValidate(userId)) {
                request.log.warn({ sub: userId }, "Invalid user ID format in token");
                throw new UnauthorizedError("Invalid user id in token");
            }

            // Phase 28: Read claims with dual-format support.
            //
            // New hook (Phase 28a): injects role + org_id + employee_id as
            // TOP-LEVEL JWT claims.  Read from decoded.role / decoded.org_id.
            //
            // Old hook (Phase 5 / legacy): wrote to app_metadata.role /
            // app_metadata.organization_id / app_metadata.employee_id.
            //
            // Support both so that tokens minted by either hook are accepted
            // during the rotation window (max 1 h until all tokens expire).
            // user_metadata is user-editable and MUST NOT be used for authz.
            role          = decoded.role ?? decoded.app_metadata?.role;
            organizationId = decoded.org_id ?? decoded.app_metadata?.organization_id;
            const hookEmployeeId = decoded.employee_id ?? decoded.app_metadata?.employee_id;

            if (!role || !organizationId) {
                request.log.warn(
                    {
                        sub: decoded.sub,
                        hasRole:  !!decoded.role || !!decoded.app_metadata?.role,
                        hasOrgId: !!decoded.org_id || !!decoded.app_metadata?.organization_id,
                        claimSource: decoded.role ? 'top-level' : decoded.app_metadata?.role ? 'app_metadata' : 'none',
                    },
                    "JWT missing required claims — custom_access_token_hook may not be enabled",
                );
                throw new AppError(
                    "JWT missing required claims",
                    401,
                    "AUTH_HOOK_MISSING",
                    { hint: "Check Supabase Auth Hook: Dashboard → Authentication → Hooks → Customize Access Token (JWT) Claims" },
                );
            }

            request.employeeId = hookEmployeeId;
        }

        // Step 4: Validate complete user context with Zod
        const result = jwtPayloadSchema.safeParse({
            sub: userId,
            email: email,
            role: role,
            organization_id: organizationId,
        });

        if (!result.success) {
            const issues = result.error.issues
                .map((issue) => issue.message)
                .join("; ");

            request.log.warn({ issues }, "JWT payload validation failed");

            const err = new UnauthorizedError(`Invalid token claims: ${issues}`);
            reply.status(err.statusCode).send(fail(err.message, request.id));
            return;
        }

        // Step 5: Attach authenticated user to request
        request.user = result.data;
        request.organizationId = result.data.organization_id;

        // Attach the user's identity to the active trace span so every
        // downstream span in this request is automatically tagged with the
        // actor. Invaluable for debugging permission or data-isolation issues.
        const span = trace.getSpan(context.active());
        if (span) {
            span.setAttribute("enduser.id", result.data.sub);
            span.setAttribute("enduser.role", result.data.role);
        }
    } catch (error) {
        // Never log the raw token for security reasons
        // Preserve AppError subclasses (including code + details for AUTH_HOOK_MISSING)
        const err = error instanceof AppError
            ? error
            : new UnauthorizedError("Invalid or missing authentication token");

        // `return` after send is required in Fastify async preValidation hooks.
        // Without it, the hook resolves normally and Fastify proceeds to call the
        // route handler — which then hits "Reply already sent". The client still
        // receives 401, but Fastify logs a spurious internal error.
        void reply.status(err.statusCode).send(fail(err.message, request.id, (err as AppError).code, (err as AppError).details));
        return;
    }
}
