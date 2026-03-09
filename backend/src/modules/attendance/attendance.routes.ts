import type { FastifyInstance, FastifyRequest } from "fastify";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { attendanceController } from "./attendance.controller.js";
import { sessionSummaryController } from "../session_summary/session_summary.controller.js";

/**
 * Attendance routes — all endpoints require authentication.
 * ADMIN-only routes use the requireRole middleware.
 */
export async function attendanceRoutes(app: FastifyInstance): Promise<void> {
  // Check in — any authenticated user
  app.post(
    "/attendance/check-in",
    {
      schema: {
        tags: ["attendance"],
        summary: "Check in to start attendance session",
        description: "Creates a new attendance session for the authenticated user",
        security: [{ BearerAuth: [] }],
      },
      preHandler: [authenticate],
    },
    attendanceController.checkIn,
  );

  // Check out — any authenticated user
  app.post(
    "/attendance/check-out",
    {
      schema: {
        tags: ["attendance"],
        summary: "Check out to end attendance session",
        description: "Closes the active attendance session for the authenticated user",
        security: [{ BearerAuth: [] }],
      },
      preHandler: [authenticate],
    },
    attendanceController.checkOut,
  );

  // Recalculate distance and duration explicitly.
  // Rate-limited per user (JWT sub) to prevent recalculation flooding.
  // A legitimate client has no reason to trigger more than a handful of
  // recalculations per minute for the same session — this cap is generous
  // while still blocking adversarial or runaway retry loops.
  app.post<{ Params: { sessionId: string } }>(
    "/attendance/:sessionId/recalculate",
    {
      schema: {
        tags: ["attendance"],
        summary: "Recalculate session distance and duration",
        description: "Manually triggers recalculation of distance and duration for a specific session",
        security: [{ BearerAuth: [] }],
      },
      config: {
        rateLimit: {
          max: 5,
          timeWindow: 60_000, // 5 requests per 60 seconds per user
          keyGenerator: (req: FastifyRequest): string => {
            // Use the JWT sub (user ID) as the rate-limit key so the
            // limit is per-identity, not per-IP. Fall back to IP only
            // if the token cannot be decoded (should not happen in practice
            // because authenticate runs before the handler, but we guard
            // defensively here since keyGenerator runs in onRequest phase).
            const auth = req.headers.authorization;
            if (auth && auth.startsWith("Bearer ")) {
              try {
                const base64Url = auth.split(".")[1];
                if (!base64Url) return req.ip;
                const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
                const payload = JSON.parse(
                  Buffer.from(base64, "base64").toString("utf8"),
                ) as Record<string, unknown>;
                const sub = payload["sub"];
                return typeof sub === "string" && sub.length > 0
                  ? `recalc:${sub}`
                  : req.ip;
              } catch {
                return req.ip;
              }
            }
            return req.ip;
          },
        },
      },
      preHandler: [authenticate],
    },
    sessionSummaryController.recalculate,
  );

  // My sessions — employee's own sessions
  app.get(
    "/attendance/my-sessions",
    {
      schema: {
        tags: ["attendance"],
        summary: "Get my attendance sessions",
        description: "Retrieves paginated list of the authenticated user's attendance sessions",
        security: [{ BearerAuth: [] }],
      },
      preHandler: [authenticate],
    },
    attendanceController.getMySessions,
  );

  // Org sessions — ADMIN only
  app.get(
    "/attendance/org-sessions",
    {
      schema: {
        tags: ["admin", "attendance"],
        summary: "Get all organization attendance sessions",
        description: "Retrieves paginated list of all attendance sessions in the organization (ADMIN only)",
        security: [{ BearerAuth: [] }],
      },
      preHandler: [authenticate, requireRole("ADMIN")],
    },
    attendanceController.getOrgSessions,
  );
}
