import "@fastify/jwt";
import type { JwtPayload } from "./jwt.js";

declare module "@fastify/jwt" {
    interface FastifyJWT {
        payload: JwtPayload;
        user: JwtPayload;
    }
}

declare module "fastify" {
    interface FastifyRequest {
        organizationId: string;
        // Phase 18: Internal Fastify property for matched route pattern.
        // Used by Prometheus metrics and abuse logging to group requests by route.
        routerPath?: string;
    }
}
