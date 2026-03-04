import type { FastifyInstance, FastifyRequest } from "fastify";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { expensesController } from "./expenses.controller.js";

/**
 * Expense routes.
 *
 * EMPLOYEE endpoints:
 *   POST  /expenses          — create a new expense (rate-limited per user)
 *   GET   /expenses/my       — list own expenses (paginated)
 *
 * ADMIN endpoints:
 *   GET   /admin/expenses    — list all org expenses (paginated)
 *   PATCH /admin/expenses/:id — approve or reject a PENDING expense
 */
export async function expensesRoutes(app: FastifyInstance): Promise<void> {
  // ─── EMPLOYEE: Create expense ───────────────────────────────────────────────
  // Rate-limited per JWT sub to prevent abuse. A legitimate employee has no
  // reason to submit more than 10 expense claims per minute.
  app.post(
    "/expenses",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: 60_000, // 10 requests per 60 seconds per user
          keyGenerator: (req: FastifyRequest): string => {
            const auth = req.headers.authorization;
            if (auth && auth.startsWith("Bearer ")) {
              try {
                const base64Url = auth.split(".")[1];
                if (!base64Url) return req.ip;
                const base64 = base64Url
                  .replace(/-/g, "+")
                  .replace(/_/g, "/");
                const payload = JSON.parse(
                  Buffer.from(base64, "base64").toString("utf8"),
                ) as Record<string, unknown>;
                const sub = payload["sub"];
                return typeof sub === "string" && sub.length > 0
                  ? `expense-create:${sub}`
                  : req.ip;
              } catch {
                return req.ip;
              }
            }
            return req.ip;
          },
        },
      },
      preHandler: [authenticate, requireRole("EMPLOYEE")],
    },
    expensesController.create,
  );

  // ─── EMPLOYEE: List own expenses ────────────────────────────────────────────
  app.get(
    "/expenses/my",
    {
      preHandler: [authenticate, requireRole("EMPLOYEE")],
    },
    expensesController.getMy,
  );

  // ─── ADMIN: List all org expenses ───────────────────────────────────────────
  app.get(
    "/admin/expenses",
    {
      preHandler: [authenticate, requireRole("ADMIN")],
    },
    expensesController.getOrgAll,
  );

  // ─── ADMIN: Approve or reject a single expense ──────────────────────────────
  app.patch<{ Params: { id: string } }>(
    "/admin/expenses/:id",
    {
      preHandler: [authenticate, requireRole("ADMIN")],
    },
    expensesController.updateStatus,
  );
}
