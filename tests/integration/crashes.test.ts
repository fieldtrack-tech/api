import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";

vi.mock("../../src/config/redis.js", () => ({
  redisClient: { on: vi.fn(), quit: vi.fn(), disconnect: vi.fn() },
}));

vi.mock("../../src/workers/distance.queue.js", () => ({
  enqueueDistanceJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/workers/analytics.queue.js", () => ({
  enqueueAnalyticsJob: vi.fn().mockResolvedValue(undefined),
}));

const supabaseMock = vi.hoisted(() => {
  const single = vi.fn();
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  return { from, insert, select, single };
});

vi.mock("../../src/config/supabase.js", () => ({
  supabaseServiceClient: { from: supabaseMock.from },
  supabaseAnonClient: { auth: { signInWithPassword: vi.fn() } },
}));

vi.mock("../../src/auth/jwtVerifier.js", () => ({
  verifySupabaseToken: vi.fn().mockImplementation(async (token: string) => {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Invalid JWT structure");
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  }),
}));

import { buildTestApp, signEmployeeToken } from "../setup/test-server.js";

describe("POST /crashes", () => {
  let app: FastifyInstance;
  let employeeToken: string;

  beforeAll(async () => {
    app = await buildTestApp();
    employeeToken = signEmployeeToken(app);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock.single.mockResolvedValue({
      data: { id: "11111111-1111-4111-8111-111111111111" },
      error: null,
    });
  });

  it("requires authentication", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/crashes",
      payload: { file_name: "crash.txt", platform: "android", raw_report: "stack" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("stores an authenticated Android crash report", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/crashes",
      headers: { authorization: `Bearer ${employeeToken}` },
      payload: { file_name: "crash_1.txt", platform: "android", raw_report: "stacktrace" },
    });

    expect(res.statusCode).toBe(201);
    expect(supabaseMock.from).toHaveBeenCalledWith("mobile_crash_reports");
    expect(supabaseMock.insert).toHaveBeenCalledWith(expect.objectContaining({
      platform: "android",
      file_name: "crash_1.txt",
      raw_report: "stacktrace",
    }));
  });

  it("rejects invalid payloads", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/crashes",
      headers: { authorization: `Bearer ${employeeToken}` },
      payload: { file_name: "", platform: "ios", raw_report: "" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 500 when persistence fails", async () => {
    supabaseMock.single.mockResolvedValue({
      data: null,
      error: { message: "insert failed" },
    });

    const res = await app.inject({
      method: "POST",
      url: "/crashes",
      headers: { authorization: `Bearer ${employeeToken}` },
      payload: { file_name: "crash_2.txt", platform: "android", raw_report: "stacktrace" },
    });

    expect(res.statusCode).toBe(500);
  });
});
