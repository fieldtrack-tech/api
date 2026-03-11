import type { FastifyInstance, FastifyRequest } from "fastify";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { locationsController } from "./locations.controller.js";
import {
    createLocationSchema,
    createLocationBatchSchema,
    sessionQuerySchema,
} from "./locations.schema.js";

/**
 * Location routes — endpoints for ingesting and retrieving GPS tracks.
 */
export async function locationsRoutes(app: FastifyInstance): Promise<void> {
    // Ingest location — EMPLOYEE only
    app.post(
        "/locations",
        {
            schema: { tags: ["locations"], body: createLocationSchema },
            config: {
                rateLimit: {
                    max: 10,
                    timeWindow: 10000,
                    keyGenerator: (req: FastifyRequest) => req.user?.sub ?? req.ip,
                },
            },
            // preValidation ensures 401/403 fires before Zod body validation
            preValidation: [authenticate, requireRole("EMPLOYEE")],
        },
        locationsController.recordLocation,
    );

    // Bulk ingest locations — EMPLOYEE only
    app.post(
        "/locations/batch",
        {
            schema: { tags: ["locations"], body: createLocationBatchSchema },
            config: {
                rateLimit: {
                    max: 10,
                    timeWindow: 10000,
                    keyGenerator: (req: FastifyRequest) => req.user?.sub ?? req.ip,
                },
            },
            // preValidation ensures 401/403 fires before Zod body validation
            preValidation: [authenticate, requireRole("EMPLOYEE")],
        },
        locationsController.recordLocationBatch,
    );

    // Retrieve route — specific session history (EMPLOYEE)
    app.get(
        "/locations/my-route",
        {
            schema: { tags: ["locations"], querystring: sessionQuerySchema },
            // preValidation ensures 401/403 fires before querystring validation
            preValidation: [authenticate, requireRole("EMPLOYEE")],
        },
        locationsController.getRoute,
    );
}
