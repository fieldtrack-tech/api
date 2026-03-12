import type { FastifyRequest } from "fastify";
import { orgTable } from "../../db/query.js";
import type { DashboardSummary } from "@fieldtrack/types";

/**
 * Returns the Monday of the current ISO week at 00:00:00 UTC as an ISO string.
 */
function getWeekStart(): string {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 = Sun, 1 = Mon … 6 = Sat
  const daysSinceMonday = (dayOfWeek + 6) % 7; // Mon = 0, Tue = 1 …
  const weekStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday),
  );
  return weekStart.toISOString();
}

export const dashboardService = {
  /**
   * GET /dashboard/my-summary
   *
   * Returns statistics for the current employee scoped to the current ISO week
   * (Mon 00:00 UTC → now) plus all-time expense counts.
   *
   * Returns all zeros for ADMIN users who have no employee record.
   */
  async getMySummary(request: FastifyRequest): Promise<DashboardSummary> {
    const employeeId = request.employeeId;

    if (!employeeId) {
      return {
        sessionsThisWeek: 0,
        distanceThisWeek: 0,
        hoursThisWeek: 0,
        expensesSubmitted: 0,
        expensesApproved: 0,
      };
    }

    const weekStart = getWeekStart();

    const [sessionsResult, expensesResult] = await Promise.all([
      orgTable(request, "attendance_sessions")
        .select("total_distance_km, total_duration_seconds")
        .eq("employee_id", employeeId)
        .gte("checkin_at", weekStart),
      orgTable(request, "expenses")
        .select("status")
        .eq("employee_id", employeeId),
    ]);

    if (sessionsResult.error) {
      throw new Error(`Dashboard sessions query failed: ${sessionsResult.error.message}`);
    }
    if (expensesResult.error) {
      throw new Error(`Dashboard expenses query failed: ${expensesResult.error.message}`);
    }

    const sessions = (sessionsResult.data ?? []) as {
      total_distance_km: number | null;
      total_duration_seconds: number | null;
    }[];

    const expenses = (expensesResult.data ?? []) as { status: string }[];

    let distanceThisWeek = 0;
    let durationSecondsThisWeek = 0;

    for (const s of sessions) {
      distanceThisWeek += s.total_distance_km ?? 0;
      durationSecondsThisWeek += s.total_duration_seconds ?? 0;
    }

    return {
      sessionsThisWeek: sessions.length,
      distanceThisWeek: Math.round(distanceThisWeek * 100) / 100,
      hoursThisWeek: Math.round((durationSecondsThisWeek / 3600) * 100) / 100,
      expensesSubmitted: expenses.length,
      expensesApproved: expenses.filter((e) => e.status === "APPROVED").length,
    };
  },
};
