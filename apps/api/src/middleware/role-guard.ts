import type { FastifyRequest } from "fastify";
import type { JwtPayload } from "../types/jwt.js";
import { ForbiddenError } from "../utils/errors.js";

/**
 * Creates a preHandler hook that enforces a specific role.
 * Must be used AFTER the authenticate middleware.
 *
 * Phase 18: Uses throw pattern for cleaner error handling.
 * Fastify's error handler will catch the exception and format the response
 * consistently with all other API errors.
 *
 * Usage in routes:
 *   app.get("/admin-only", { preHandler: [authenticate, requireRole("ADMIN")] }, handler);
 */
export function requireRole(role: JwtPayload["role"]) {
    return async (request: FastifyRequest): Promise<void> => {
        if (request.user.role !== role) {
            throw new ForbiddenError(`This action requires ${role} role`);
        }
    };
}
