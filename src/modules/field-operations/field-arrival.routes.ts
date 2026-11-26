import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { supabaseServiceClient as db } from "../../config/supabase.js";
import { authenticate, requireJwtAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { BadRequestError, ForbiddenError, NotFoundError, requireEmployeeContext } from "../../utils/errors.js";
import { handleError, ok } from "../../utils/response.js";

const params = z.object({ id: z.string().uuid() });
const gpsFix = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100),
  recorded_at: z.string().datetime({ offset: true }),
});

export async function fieldArrivalRoutes(app: FastifyInstance): Promise<void> {
  app.post("/field/sites/:id/reach", {
    preValidation: [authenticate, requireJwtAuth, requireRole("EMPLOYEE")],
    schema: { tags: ["field operations"], params, body: gpsFix },
  }, async (request, reply) => {
    try {
      requireEmployeeContext(request);
      const body = gpsFix.parse(request.body);
      const { id } = params.parse(request.params);
      const { data, error } = await db.rpc("confirm_field_arrival", {
        p_org: request.organizationId,
        p_employee: request.employeeId,
        p_site: id,
        p_lat: body.latitude,
        p_lng: body.longitude,
        p_accuracy: body.accuracy,
        p_recorded_at: body.recorded_at,
      });
      if (error?.code === "22023") throw new BadRequestError(error.message);
      if (error?.code === "42501") throw new ForbiddenError("Employee is inactive.", "EMPLOYEE_INACTIVE");
      if (error?.code === "P0002") throw new NotFoundError("Work site not found.");
      if (error) throw new Error(`Could not confirm field arrival: ${error.message}`);
      return ok(data);
    } catch (error) {
      handleError(error, request, reply, "Unable to confirm arrival");
    }
  });
}
