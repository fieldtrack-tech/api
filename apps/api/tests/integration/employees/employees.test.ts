import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

vi.mock("../../../src/config/redis.js", () => ({
  redisClient: { on: vi.fn(), quit: vi.fn(), disconnect: vi.fn() },
}));

vi.mock("../../../src/workers/distance.queue.js", () => ({
  enqueueDistanceJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/modules/employees/employees.repository.js", () => ({
  employeesRepository: {
    createEmployee: vi.fn(),
  },
}));

import {
  buildTestApp,
  signEmployeeToken,
  signAdminToken,
  TEST_ORG_ID,
} from "../../setup/test-server.js";
import { employeesRepository } from "../../../src/modules/employees/employees.repository.js";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const EMPLOYEE_ROW_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const newEmployee = {
  id: EMPLOYEE_ROW_ID,
  organization_id: TEST_ORG_ID,
  user_id: null,
  name: "Alice Smith",
  employee_code: "EMP002",
  phone: null,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("Employees Integration Tests", () => {
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
  });

  // ─── POST /admin/employees ────────────────────────────────────────────────────

  describe("POST /admin/employees", () => {
    it("returns 401 when no JWT is provided", async () => {
      const res = await app.inject({ method: "POST", url: "/admin/employees" });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 when called by an EMPLOYEE", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/admin/employees",
        headers: {
          authorization: `Bearer ${employeeToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "Bob", employee_code: "EMP003" }),
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 201 with the new employee on valid creation", async () => {
      vi.mocked(employeesRepository.createEmployee).mockResolvedValue(
        newEmployee as never,
      );

      const res = await app.inject({
        method: "POST",
        url: "/admin/employees",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Alice Smith",
          employee_code: "EMP002",
        }),
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body) as { success: boolean; data: typeof newEmployee };
      expect(body.success).toBe(true);
      expect(body.data.employee_code).toBe("EMP002");
      expect(body.data.name).toBe("Alice Smith");
    });

    it("returns 400 when name is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/admin/employees",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ employee_code: "EMP003" }),
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when employee_code is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/admin/employees",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "Bob" }),
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when user_id is not a valid UUID", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/admin/employees",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "Bob", employee_code: "EMP003", user_id: "not-a-uuid" }),
      });
      expect(res.statusCode).toBe(400);
    });

    it("calls repository with the correct body", async () => {
      vi.mocked(employeesRepository.createEmployee).mockResolvedValue(
        newEmployee as never,
      );

      await app.inject({
        method: "POST",
        url: "/admin/employees",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "Alice Smith", employee_code: "EMP002" }),
      });

      expect(employeesRepository.createEmployee).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ name: "Alice Smith", employee_code: "EMP002" }),
      );
    });
  });
});
