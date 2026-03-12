import { supabaseServiceClient as supabase } from "../../config/supabase.js";
import { orgTable } from "../../db/query.js";
import { applyPagination } from "../../utils/pagination.js";
import type { FastifyRequest } from "fastify";
import type { AdminSession } from "../../types/db.js";

const MONITORING_COLS = "id, admin_id, organization_id, started_at, ended_at, created_at";

export const monitoringRepository = {
  /**
   * Insert a new admin monitoring session with ended_at = null.
   */
  async startSession(request: FastifyRequest): Promise<AdminSession> {
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("admin_sessions")
      .insert({
        admin_id: request.user.sub,
        organization_id: request.organizationId,
        started_at: now,
      })
      .select(MONITORING_COLS)
      .single();

    if (error) {
      throw new Error(`Failed to start monitoring session: ${error.message}`);
    }
    return data as AdminSession;
  },

  /**
   * Close the most recent open monitoring session for this admin.
   * Throws PGRST116 (mapped to NotFoundError by the service) if none is open.
   */
  async stopSession(request: FastifyRequest): Promise<AdminSession | null> {
    const now = new Date().toISOString();

    const { data, error } = await orgTable(request, "admin_sessions")
      .update({ ended_at: now })
      .eq("admin_id", request.user.sub)
      .is("ended_at", null)
      .select(MONITORING_COLS)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to stop monitoring session: ${error.message}`);
    }
    return data as AdminSession | null;
  },

  /**
   * Return monitoring history for the authenticated admin, newest first.
   */
  async findHistory(
    request: FastifyRequest,
    page: number,
    limit: number,
  ): Promise<AdminSession[]> {
    const { data, error } = await applyPagination(
      orgTable(request, "admin_sessions")
        .select(MONITORING_COLS)
        .eq("admin_id", request.user.sub)
        .order("started_at", { ascending: false }),
      page,
      limit,
    );

    if (error) {
      throw new Error(`Failed to fetch monitoring history: ${error.message}`);
    }
    return (data ?? []) as AdminSession[];
  },
};
