import type { FastifyInstance } from "fastify";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { supabaseServiceClient as supabase } from "../../config/supabase.js";
import { ok, handleError } from "../../utils/response.js";
import { analyticsService } from "../analytics/analytics.service.js";
import { getCached } from "../../utils/cache.js";
import { deduped } from "../../utils/dedup.js";
import type { AdminDashboardData } from "@fieldtrack/types";

// Phase 22: 60-second TTL for the dashboard aggregate response.
// Short enough that status counts (ACTIVE/RECENT) stay fresh;
// long enough to absorb repeated polling from the frontend.
const DASHBOARD_CACHE_TTL = 60;

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
        const todayDateStr = new Date().toISOString().substring(0, 10);

        // Phase 22: Two-layer optimisation:
        //  1. deduped() — collapses concurrent cache-miss requests into one DB fetch.
        //  2. getCached() — serves subsequent requests from Redis for 60 s.
        // The cache key pattern (org:{id}:analytics:*) is covered by
        // invalidateOrgAnalytics(), so fresh data appears within 60 s of checkout.
        const result = await deduped(
          `dashboard:${orgId}:${todayDateStr}`,
          () =>
            getCached<AdminDashboardData>(
              `org:${orgId}:analytics:dashboard:${todayDateStr}`,
              DASHBOARD_CACHE_TTL,
              async () => {
                const todayStart = new Date(`${todayDateStr}T00:00:00Z`);
                const sevenDaysAgo = new Date(todayStart);
                sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
                const thirtyDaysAgo = new Date(todayStart);
                thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

                const [activeCountResult, recentCountResult, totalCountResult, todayMetricsResult, pendingExpensesResult, sessionTrend, leaderboard] = await Promise.all([
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

                  supabase
                    .from("org_daily_metrics")
                    .select("total_sessions, total_distance_km")
                    .eq("organization_id", orgId)
                    .eq("date", todayDateStr)
                    .maybeSingle(),

                  supabase
                    .from("expenses")
                    .select("amount")
                    .eq("organization_id", orgId)
                    .eq("status", "PENDING"),

                  analyticsService.getSessionTrend(request, sevenDaysAgo.toISOString(), undefined),

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

                const activeEmployeeCount = activeCountResult.count ?? 0;
                const recentEmployeeCount = recentCountResult.count ?? 0;
                const inactiveEmployeeCount = (totalCountResult.count ?? 0) - activeEmployeeCount - recentEmployeeCount;

                const todayRow = todayMetricsResult.data as { total_sessions: number; total_distance_km: number } | null;
                const todaySessionCount = todayRow?.total_sessions ?? 0;
                const todayDistanceKm = Math.round((todayRow?.total_distance_km ?? 0) * 100) / 100;

                const pendingExpenses = (pendingExpensesResult.data ?? []) as Array<{ amount: number }>;
                const pendingExpenseCount = pendingExpenses.length;
                const pendingExpenseAmount = Math.round(
                  pendingExpenses.reduce((sum, e) => sum + Number(e.amount), 0) * 100,
                ) / 100;

                return {
                  activeEmployeeCount,
                  recentEmployeeCount,
                  inactiveEmployeeCount,
                  activeEmployeesToday: activeEmployeeCount,
                  todaySessionCount,
                  todayDistanceKm,
                  pendingExpenseCount,
                  pendingExpenseAmount,
                  sessionTrend,
                  leaderboard,
                } satisfies AdminDashboardData;
              },
            ),
        );

        reply.status(200).send(ok(result));
      } catch (error) {
        handleError(error, request, reply, "Unexpected error fetching admin dashboard");
      }
    },
  );
}
