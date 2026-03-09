import type { FastifyInstance, FastifyRequest } from "fastify";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { locationsController } from "./locations.controller.js";

/**
 * Location routes — endpoints for ingesting and retrieving GPS tracks.
 */
export async function locationsRoutes(app: FastifyInstance): Promise<void> {
    const rateLimitConfig = {
        schema: {
            tags: ["locations"],
            summary: "Record GPS location",
            description: "Ingests a single GPS location point for the authenticated user's active session",
            security: [{ BearerAuth: [] }],
        },
        config: {
            rateLimit: {
                max: 10,
                timeWindow: 10000, // 10 requests per 10 seconds
                keyGenerator: (req: FastifyRequest) => {
                    // req.user might not be populated in onRequest, so decode JWT payload manually 
                    const auth = req.headers.authorization;
                    if (auth && auth.startsWith("Bearer ")) {
                        try {
                            const base64Url = auth.split(".")[1];
                            if (!base64Url) return req.ip;
                            const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
                            const payload = JSON.parse(Buffer.from(base64, "base64").toString()) as { sub?: string };
                            return payload.sub ?? req.ip;
                        } catch {
                            return req.ip;
                        }
                    }
                    return req.ip;
                },
            },
        },
        preHandler: [authenticate, requireRole("EMPLOYEE")],
    };

    // Ingest location — EMPLOYEE only
    app.post("/locations", rateLimitConfig, locationsController.recordLocation);

    // Bulk ingest locations — EMPLOYEE only
    app.post("/locations/batch", {
        schema: {
            tags: ["locations"],
            summary: "Record multiple GPS locations",
            description: "Ingests multiple GPS location points in bulk for the authenticated user's active session",
            security: [{ BearerAuth: [] }],
        },
        config: rateLimitConfig.config,
        preHandler: rateLimitConfig.preHandler,
    }, locationsController.recordLocationBatch);

    // Retrieve route — specific session history (EMPLOYEE)
    app.get("/locations/my-route", {
        schema: {
            tags: ["locations"],
            summary: "Get my route history",
            description: "Retrieves GPS location history for a specific session of the authenticated user",
            security: [{ BearerAuth: [] }],
        },
        preHandler: [authenticate, requireRole("EMPLOYEE")],
    }, locationsController.getRoute);
}
