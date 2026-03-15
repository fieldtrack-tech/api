import type { FastifyInstance } from "fastify";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { supabaseServiceClient as supabase } from "../../config/supabase.js";
import { ok, handleError } from "../../utils/response.js";
import { analyticsService } from "../analytics/analytics.service.js";
import type { AdminDashboardData } from "@fieldtrack/types";

// ─── Route registration ───────────────────────────────────────────────────────

/**
 * GET /admin/dashboard
 *
 * Single aggregation endpoint that collapses what previously required 4-5
 * separate frontend calls into one round-trip.
 *
 * Data sources:
 *  - employee_latest_sessions  → status counts (O(employees), snapshot table)
 *  - attendance_sessions       → today's session + distance totals (date-scoped)
 *  - expenses                  → pending count + amount (org-scoped)
 *
 * All three queries run in parallel via Promise.all.
 */
export async function adminDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/admin/dashboard",
    {
      schema: {
        tags: ["admin"],
      },
      preValidation: [authenticate, requireRole("ADMIN")],
    },
    async (request, reply) => {
      try {
        const orgId = request.organizationId;
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);
        const todayDateStr = todayStart.toISOString().substring(0, 10); // YYYY-MM-DD

        // Date ranges for the embedded analytics snapshots
        const sevenDaysAgo = new Date(todayStart);
        sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
        const thirtyDaysAgo = new Date(todayStart);
        thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

        const [activeCountResult, recentCountResult, totalCountResult, todayMetricsResult, pendingExpensesResult, sessionTrend, leaderboard] = await Promise.all([
          // Count-only queries — head:true means no row data is transferred, only the count.
          // This is O(employees) via the snapshot index and correct for any org size.
          supabase
            .from("employee_latest_sessions")
            .select("*", { count: "exact", head: true })
            .eq("organization_id", orgId)
            .eq("status", "ACTIVE"),

          supabase
            .from("employee_latest_sessions")
            .select("*", { count: "exact", head: true })
            .eq("organization_id", orgId)
            .eq("status", "RECENT"),

          supabase
            .from("employee_latest_sessions")
            .select("*", { count: "exact", head: true })
            .eq("organization_id", orgId),

          // Phase 21: Today's aggregates from org_daily_metrics — O(1) unique-index
          // lookup instead of scanning attendance_sessions for date-filtered rows.
          // Analytics worker keeps this table current within seconds of each checkout.
          supabase
            .from("org_daily_metrics")
            .select("total_sessions, total_distance_km")
            .eq("organization_id", orgId)
            .eq("date", todayDateStr)
            .maybeSingle(),

          // Pending expenses — O(pending) targeted query instead of O(all expenses).
          // Only fetches the amount column for pending expenses to compute totals.
          supabase
            .from("expenses")
            .select("amount")
            .eq("organization_id", orgId)
            .eq("status", "PENDING"),

          // Session trend — last 7 days from org_daily_metrics (cached 5 min).
          analyticsService.getSessionTrend(request, sevenDaysAgo.toISOString(), undefined),

          // Leaderboard — top 5 by distance over the last 30 days (cached 5 min).
          analyticsService.getLeaderboard(request, "distance", thirtyDaysAgo.toISOString(), undefined, 5),
        ]);

        const snapshotError = activeCountResult.error ?? recentCountResult.error ?? totalCountResult.error;
        if (snapshotError) {
          throw new Error(`Dashboard: snapshot query failed: ${snapshotError.message}`);
        }
        if (todayMetricsResult.error) {
          throw new Error(`Dashboard: today metrics query failed: ${todayMetricsResult.error.message}`);
        }
        if (pendingExpensesResult.error) {
          throw new Error(`Dashboard: pending expenses query failed: ${pendingExpensesResult.error.message}`);
        }

        // Derive counts from the three parallel count queries
        const activeEmployeeCount = activeCountResult.count ?? 0;
        const recentEmployeeCount = recentCountResult.count ?? 0;
        const inactiveEmployeeCount = (totalCountResult.count ?? 0) - activeEmployeeCount - recentEmployeeCount;

        // Phase 21: Today's session + distance aggregates from org_daily_metrics.
        // This is an O(1) unique-index point lookup vs. the previous O(today sessions) scan.
        // The analytics worker keeps org_daily_metrics current within seconds of checkout.
        // Active (not yet checked-out) sessions are captured by activeEmployeeCount separately.
        const todayRow = todayMetricsResult.data as { total_sessions: number; total_distance_km: number } | null;
        const todaySessionCount = todayRow?.total_sessions ?? 0;
        const todayDistanceKm = Math.round((todayRow?.total_distance_km ?? 0) * 100) / 100;

        // Pending expense totals — direct sum over pending-only rows (O(pending))
        const pendingExpenses = (pendingExpensesResult.data ?? []) as Array<{ amount: number }>;
        const pendingExpenseCount = pendingExpenses.length;
        const pendingExpenseAmount = Math.round(
          pendingExpenses.reduce((sum, e) => sum + Number(e.amount), 0) * 100,
        ) / 100;

        const result: AdminDashboardData = {
          activeEmployeeCount,
          recentEmployeeCount,
          inactiveEmployeeCount,
          // activeEmployeesToday = employees with an open session right now
          // (same as activeEmployeeCount — no extra query needed)
          activeEmployeesToday: activeEmployeeCount,
          todaySessionCount,
          todayDistanceKm,
          pendingExpenseCount,
          pendingExpenseAmount,
          sessionTrend,
          leaderboard,
        };

        reply.status(200).send(ok(result));
      } catch (error) {
        handleError(error, request, reply, "Unexpected error fetching admin dashboard");
      }
    },
  );
}
