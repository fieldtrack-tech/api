import type { FastifyRequest } from "fastify";
import { orgTable } from "../../db/query.js";
import type { DashboardSummary } from "@fieldtrack/types";

/**
 * Returns the ISO date string for the Monday of the current UTC week (YYYY-MM-DD).
 * Used as the lower bound for employee_daily_metrics range queries.
 */
function getWeekStartDate(): string {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 = Sun, 1 = Mon … 6 = Sat
  const daysSinceMonday = (dayOfWeek + 6) % 7; // Mon = 0, Tue = 1 …
  const weekStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday),
  );
  return weekStart.toISOString().substring(0, 10); // YYYY-MM-DD
}

export const dashboardService = {
  /**
   * GET /dashboard/my-summary
   *
   * Returns statistics for the current employee scoped to the current ISO week
   * (Mon 00:00 UTC → now) plus all-time expense counts.
   *
   * Phase 1 optimization: Replaced raw attendance_sessions scan with
   * employee_daily_metrics (pre-aggregated by the analytics worker). This avoids
   * full-table scans on high-volume session tables — one bounded date-range lookup
   * against the metrics table instead of potentially thousands of session rows.
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

    const weekStartDate = getWeekStartDate(); // YYYY-MM-DD, aligns with daily_metrics.date

    // employee_daily_metrics aggregates session and expense data per day.
    // Querying this week's rows (Mon → today) is O(~5-7 rows) not O(sessions).
    // expenses_count / expenses_amount track submissions; we still need status
    // breakdown so we keep a bounded expense query (only this week's submissions).
    const [metricsResult, expensesResult] = await Promise.all([
      orgTable(request, "employee_daily_metrics")
        .select("sessions, distance_km, duration_seconds")
        .eq("employee_id", employeeId)
        .gte("date", weekStartDate),
      orgTable(request, "expenses")
        .select("status")
        .eq("employee_id", employeeId),
    ]);

    if (metricsResult.error) {
      throw new Error(`Dashboard metrics query failed: ${metricsResult.error.message}`);
    }
    if (expensesResult.error) {
      throw new Error(`Dashboard expenses query failed: ${expensesResult.error.message}`);
    }

    const metricRows = (metricsResult.data ?? []) as {
      sessions: number;
      distance_km: number;
      duration_seconds: number;
    }[];

    const expenses = (expensesResult.data ?? []) as { status: string }[];

    let sessionsThisWeek = 0;
    let distanceThisWeek = 0;
    let durationSecondsThisWeek = 0;

    for (const row of metricRows) {
      sessionsThisWeek += row.sessions ?? 0;
      distanceThisWeek += row.distance_km ?? 0;
      durationSecondsThisWeek += row.duration_seconds ?? 0;
    }

    return {
      sessionsThisWeek,
      distanceThisWeek: Math.round(distanceThisWeek * 100) / 100,
      hoursThisWeek: Math.round((durationSecondsThisWeek / 3600) * 100) / 100,
      expensesSubmitted: expenses.length,
      expensesApproved: expenses.filter((e) => e.status === "APPROVED").length,
    };
  },
};
