import { z } from "zod";

const ROLES = ["ADMIN", "EMPLOYEE"] as const;

/**
 * Strict schema for validating decoded JWT payloads.
 * Every request must carry a valid sub, role, and organization_id.
 */
export const jwtPayloadSchema = z.object({
    sub: z.string().min(1, "JWT 'sub' claim is required"),
    role: z.enum(ROLES, {
        error: "Role must be ADMIN or EMPLOYEE",
    }),
    organization_id: z.string().uuid({ error: "organization_id must be a valid UUID" }),
});

export type JwtPayload = z.infer<typeof jwtPayloadSchema>;
