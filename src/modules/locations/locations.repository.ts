import { supabaseServiceClient as supabase } from "../../config/supabase.js";
import { orgTable } from "../../db/query.js";
import type { TenantContext } from "../../utils/tenant.js";
import { applyPagination } from "../../utils/pagination.js";
import type { FastifyRequest } from "fastify";
import type { LocationRecord, CreateLocationBody } from "./locations.schema.js";
import { BadRequestError, ForbiddenError } from "../../utils/errors.js";

type LocationIngestResult = {
    inserted: LocationRecord[];
    discarded_recorded_at: string[];
    closed: boolean;
};

/**
 * Locations repository — Supabase queries for gps_locations.
 *
 * Phase 16 confirmed column set:
 *   id, organization_id, session_id, employee_id,
 *   latitude, longitude, accuracy, recorded_at,
 *   sequence_number, is_duplicate
 *
 * organization_id on the table enables direct tenantQuery() filtering
 * without joins to attendance_sessions.
 */
export const locationsRepository = {
    async ingestLocationPoints(
        request: FastifyRequest,
        employeeId: string,
        sessionId: string,
        points: Omit<CreateLocationBody, "session_id">[],
        allowClosed: boolean,
    ): Promise<LocationIngestResult> {
        const { data, error } = await supabase.rpc("ingest_field_gps", {
            p_org: request.organizationId,
            p_employee: employeeId,
            p_session: sessionId,
            p_points: points,
            p_allow_closed: allowClosed,
        });
        if (error?.code === "42501") throw new ForbiddenError("Employee is inactive.", "EMPLOYEE_INACTIVE");
        if (error?.code === "P0002") throw new BadRequestError(error.message, "LOCATION_SESSION_EXPIRED");
        if (error) throw new Error(`Failed to save locations: ${error.message}`);
        return data as LocationIngestResult;
    },

    async findLocationsBySession(
        request: FastifyRequest,
        sessionId: string,
        employeeId?: string,
    ): Promise<LocationRecord[]> {
        let query = orgTable(request, "gps_locations")
            .select("id, organization_id, session_id, employee_id, latitude, longitude, accuracy, recorded_at, sequence_number, is_duplicate")
            .eq("session_id", sessionId)
            .order("recorded_at", { ascending: true });

        if (employeeId !== undefined) {
            query = query.eq("employee_id", employeeId) as typeof query;
        }

        const rows: LocationRecord[] = [];
        for (;;) {
            const { data, error } = await query.range(rows.length, rows.length + 499);
            if (error) throw new Error(`Failed to fetch location history: ${error.message}`);
            rows.push(...(data ?? []));
            if ((data?.length ?? 0) < 500) return rows;
        }
    },

    async findPointsForDistancePaginated(
        context: TenantContext | FastifyRequest,
        sessionId: string,
        page: number,
        limit: number,
    ): Promise<{ latitude: number; longitude: number; recorded_at: string }[]> {
        const { data, error } = await applyPagination(
            orgTable(context, "gps_locations")
                .select("latitude, longitude, recorded_at")
                .eq("session_id", sessionId)
                .order("recorded_at", { ascending: true }),
            page,
            limit,
        );

        if (error) {
            throw new Error(`Failed to fetch paginated points for distance: ${error.message}`);
        }
        return data ?? [];
    },
};
