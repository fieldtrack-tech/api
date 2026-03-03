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
    }
}
