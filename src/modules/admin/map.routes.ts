import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { supabaseServiceClient as supabase } from "../../config/supabase.js";
import { ok, handleError } from "../../utils/response.js";
import type { EmployeeMapMarker } from "../../types/shared.js";

/** Hard safety cap — prevents map from crashing if the org scales rapidly. */
const MAX_MAP_EMPLOYEES = 1000;

// ─── Row shape returned by the get_active_map_markers RPC function ────────────
interface MapMarkerRow {
  employee_id: string;
  latitude: number;
  longitude: number;
  recorded_at: string;
  employee_name: string;
  employee_code: string | null;
  status: string;
  session_id: string | null;
}

// ─── Route registration ───────────────────────────────────────────────────────

/**
 * GET /admin/monitoring/map
 *
 * Returns the latest GPS point from each active shift in the organization.
 */
export async function adminMapRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/admin/monitoring/map",
    {
      schema: {
        tags: ["admin"],
        summary: "Live map markers for active shifts",
        description:
          "Returns the latest GPS position from each active shift. Filter by employeeId to follow a single employee. " +
          "The fleet map is capped at 1000 markers.",
        querystring: z.object({ employeeId: z.string().uuid().optional() }),
        response: {
          200: z.object({
            success: z.literal(true),
            data: z.array(z.object({
              employeeId:   z.string().uuid(),
              employeeName: z.string(),
              employeeCode: z.string().nullable(),
              status:       z.enum(["ACTIVE", "RECENT"]),
              sessionId:    z.string().uuid().nullable(),
              latitude:     z.number(),
              longitude:    z.number(),
              recordedAt:   z.string().datetime({ offset: true }),
            })),
          }).describe("Map markers for active shifts"),
        },
      },
      preValidation: [authenticate, requireRole("ADMIN")],
    },
    async (request, reply) => {
      try {
        const orgId = request.organizationId;
        const { employeeId } = request.query as { employeeId?: string };

        const queryStart = Date.now();
        const { data, error } = await supabase.rpc("get_active_map_markers", {
          p_org_id: orgId,
          p_limit: employeeId ? 1 : MAX_MAP_EMPLOYEES,
          ...(employeeId ? { p_employee_id: employeeId } : {}),
        });
        const durationMs = Date.now() - queryStart;

        if (durationMs > 100) {
          request.log.warn(
            { route: "/admin/monitoring/map", queryName: "get_active_map_markers", table: "gps_locations", durationMs },
            "slow DB query",
          );
        }

        if (error) {
          throw new Error(`Map: RPC query failed: ${error.message}`);
        }

        const rows = (data ?? []) as MapMarkerRow[];

        // Safety warning if we hit the cap
        if (rows.length >= MAX_MAP_EMPLOYEES) {
          request.log.warn(
            { orgId, count: rows.length, limit: MAX_MAP_EMPLOYEES },
            "Map marker limit reached — some active employees may be hidden",
          );
        }

        const markers: EmployeeMapMarker[] = rows.map((row) => ({
          employeeId: row.employee_id,
          employeeName: row.employee_name ?? "Unknown",
          employeeCode: row.employee_code ?? null,
          status: row.status as EmployeeMapMarker["status"],
          sessionId: row.session_id ?? null,
          latitude: row.latitude,
          longitude: row.longitude,
          recordedAt: row.recorded_at,
        }));

        reply.status(200).send(ok(markers));
      } catch (error) {
        handleError(error, request, reply, "Unexpected error fetching map data");
      }
    },
  );
}
