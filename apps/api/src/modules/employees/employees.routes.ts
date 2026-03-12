import type { FastifyInstance } from "fastify";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { employeesController } from "./employees.controller.js";
import { createEmployeeBodySchema } from "./employees.schema.js";

/**
 * Employees management routes — ADMIN only.
 *
 * POST /admin/employees — create a new employee (employee_code required)
 */
export async function employeesRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/admin/employees",
    {
      schema: { tags: ["admin"], body: createEmployeeBodySchema },
      preValidation: [authenticate, requireRole("ADMIN")],
    },
    employeesController.create,
  );
}
