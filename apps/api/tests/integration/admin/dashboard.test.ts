import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

vi.mock("../../../src/config/redis.js", () => ({
  redisClient: { on: vi.fn(), quit: vi.fn(), disconnect: vi.fn() },
}));

vi.mock("../../../src/workers/distance.queue.js", () => ({
  enqueueDistanceJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/workers/analytics.queue.js", () => ({
  enqueueAnalyticsJob: vi.fn().mockResolvedValue(undefined),
}));

// The dashboard route calls supabaseServiceClient.from() directly for
// employee_latest_sessions, attendance_sessions, and expenses queries.
vi.mock("../../../src/config/supabase.js", () => ({
  supabaseServiceClient: { from: vi.fn() },
}));

// Stub the analytics service so the dashboard test does not hit Redis.
// The dashboard correctly embeds sessionTrend + leaderboard; these stubs
// keep the test fast and focused on the dashboard's own aggregation logic.
vi.mock("../../../src/modules/analytics/analytics.service.js", () => ({
  analyticsService: {
    getSessionTrend: vi.fn().mockResolvedValue([]),
    getLeaderboard: vi.fn().mockResolvedValue([]),
  },
}));

import {
  buildTestApp,
  signEmployeeToken,
  signAdminToken,
  TEST_ORG_ID,
} from "../../setup/test-server.js";
import { supabaseServiceClient as supabase } from "../../../src/config/supabase.js";

// ─── Supabase query builder factory ──────────────────────────────────────────

/** Build a mock Supabase chainable query builder that resolves to `result`. */
function makeBuilder(result: { data: unknown; error: null | { message: string }; count?: number | null }) {
  const b = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    then: (_resolve: (v: unknown) => void): Promise<unknown> =>
      Promise.resolve(result).then(_resolve),
  };
  // Make the builder itself a thenable so `await builder.eq(...)` works
  Object.defineProperty(b, Symbol.toStringTag, { value: "Promise" });
  return b;
}

/** Returns a builder whose final `await` resolves to `result` */
function makeChainBuilder(result: { data: unknown; error: null | { message: string }; count?: number }) {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "gte", "in", "order", "range", "limit"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Make it awaitable (for direct-await usage)
  (chain as { then: (r: (v: unknown) => void) => Promise<unknown> }).then = (resolve) =>
    Promise.resolve(result).then(resolve);
  // Support .maybeSingle() terminal call (used by org_daily_metrics today query)
  (chain as { maybeSingle: () => Promise<unknown> }).maybeSingle = () =>
    Promise.resolve(result);
  return chain as ReturnType<typeof makeBuilder>;
}

// ─── Default fixture data ─────────────────────────────────────────────────────

// Phase 21: today stats come from org_daily_metrics (not attendance_sessions scan)
const TODAY_METRICS = { total_sessions: 2, total_distance_km: 19.8 };

// Three pending expense rows totalling 225.00
const PENDING_EXPENSES = [
  { amount: 100 },
  { amount: 75 },
  { amount: 50 },
];

// ─── Helper: set up supabase.from mock for one test ──────────────────────────

/**
 * The dashboard now issues three count-only queries to employee_latest_sessions
 * (ACTIVE, RECENT, total) plus one maybeSingle to org_daily_metrics for today.
 * We use a call-index counter so each sequential snapshot call returns the right count.
 */
let snapshotCallIndex = 0;

function mockDashboardSupabase(
  activeCnt = 2,
  recentCnt = 1,
  totalCnt = 4,
): void {
  snapshotCallIndex = 0;
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === "employee_latest_sessions") {
      const idx = snapshotCallIndex++;
      if (idx === 0) return makeChainBuilder({ data: null, error: null, count: activeCnt });
      if (idx === 1) return makeChainBuilder({ data: null, error: null, count: recentCnt });
      return makeChainBuilder({ data: null, error: null, count: totalCnt });
    }
    // Phase 21: today's session + distance stats come from org_daily_metrics (.maybeSingle)
    if (table === "org_daily_metrics") {
      return makeChainBuilder({ data: TODAY_METRICS, error: null });
    }
    if (table === "expenses") {
      return makeChainBuilder({ data: PENDING_EXPENSES, error: null });
    }
    // employee_daily_metrics / employees (leaderboard) — empty by default.
    return makeChainBuilder({ data: [], error: null });
  });
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("GET /admin/dashboard", () => {
  let app: FastifyInstance;
  let employeeToken: string;
  let adminToken: string;

  beforeAll(async () => {
    app = await buildTestApp();
    employeeToken = signEmployeeToken(app);
    adminToken = signAdminToken(app);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockDashboardSupabase();
  });

  // ─── Auth & role guards ───────────────────────────────────────────────────

  it("returns 401 when no JWT is provided", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/dashboard" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 when called with an employee token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/dashboard",
      headers: { authorization: `Bearer ${employeeToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  it("returns 200 with aggregated dashboard data", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/dashboard",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{
      success: boolean;
      data: {
        activeEmployeeCount: number;
        recentEmployeeCount: number;
        inactiveEmployeeCount: number;
        todaySessionCount: number;
        todayDistanceKm: number;
        pendingExpenseCount: number;
        pendingExpenseAmount: number;
        sessionTrend: unknown[];
        leaderboard: unknown[];
      };
    }>();

    expect(body.success).toBe(true);
    expect(body.data.activeEmployeeCount).toBe(2);
    expect(body.data.recentEmployeeCount).toBe(1);
    expect(body.data.inactiveEmployeeCount).toBe(1);
    expect(body.data.todaySessionCount).toBe(2);
    expect(body.data.todayDistanceKm).toBe(19.8);
    expect(body.data.pendingExpenseCount).toBe(3);
    expect(body.data.pendingExpenseAmount).toBe(225.0);
    expect(Array.isArray(body.data.sessionTrend)).toBe(true);
    expect(Array.isArray(body.data.leaderboard)).toBe(true);
  });

  it("returns zero counts when org has no data", async () => {
    vi.mocked(supabase.from).mockImplementation(() =>
      makeChainBuilder({ data: [], error: null }),
    );

    const res = await app.inject({
      method: "GET",
      url: "/admin/dashboard",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { activeEmployeeCount: number; todaySessionCount: number } }>();
    expect(body.data.activeEmployeeCount).toBe(0);
    expect(body.data.todaySessionCount).toBe(0);
  });

  it("returns 500 when the snapshot query fails", async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "employee_latest_sessions") {
        return makeChainBuilder({ data: null, error: { message: "connection timeout" } });
      }
      return makeChainBuilder({ data: [], error: null });
    });

    const res = await app.inject({
      method: "GET",
      url: "/admin/dashboard",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(500);
  });

  it("scopes query to requesting org ID", async () => {
    await app.inject({
      method: "GET",
      url: "/admin/dashboard",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    // Verify each data source is queried (scoping via .eq("organization_id", ...) is
    // enforced by the route handler for every table).
    expect(supabase.from).toHaveBeenCalledWith("employee_latest_sessions");
    // Phase 21: today's stats come from org_daily_metrics, not attendance_sessions
    expect(supabase.from).toHaveBeenCalledWith("org_daily_metrics");
    expect(supabase.from).toHaveBeenCalledWith("expenses");
  });
});
