import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
vi.mock("../../src/config/redis.js", () => ({ redisClient: { on: vi.fn(), quit: vi.fn(), disconnect: vi.fn() } }));
vi.mock("../../src/modules/field-operations/field-operations.repository.js", () => ({
  fieldRepository: { settings: vi.fn(), createSettings: vi.fn(), sites: vi.fn(), saveSite: vi.fn(), salaries: vi.fn(),
    setSalary: vi.fn(), report: vi.fn(), payments: vi.fn(), previewPayment: vi.fn(), recordPayment: vi.fn() },
  checkDbError: vi.fn(),
}));
import { buildTestApp, signEmployeeToken, signAdminToken, TEST_EMPLOYEE_ID, TEST_ORG_ID, TEST_ORG_ID_B } from "../setup/test-server.js";
import { fieldRepository } from "../../src/modules/field-operations/field-operations.repository.js";

describe("field operations authorization", () => {
  let app: FastifyInstance; let employeeToken: string; let adminToken: string;
  beforeAll(async () => { app = await buildTestApp(); employeeToken = signEmployeeToken(app); adminToken = signAdminToken(app); });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { vi.clearAllMocks(); });
  it("requires authentication to read fixed locations", async () => {
    expect((await app.inject({ method: "GET", url: "/field/sites" })).statusCode).toBe(401);
    expect(fieldRepository.sites).not.toHaveBeenCalled();
  });
  it("employees cannot change salary or view company payroll", async () => {
    const headers = { authorization: `Bearer ${employeeToken}` };
    expect((await app.inject({ method: "POST", url: `/admin/field/basic-pay/${TEST_EMPLOYEE_ID}`, headers,
      payload: { effective_month: "2026-11-01", amount_minor: 3000000 } })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/admin/field/reports?period=month&date=2026-11-24", headers })).statusCode).toBe(403);
    expect(fieldRepository.setSalary).not.toHaveBeenCalled(); expect(fieldRepository.report).not.toHaveBeenCalled();
  });
  it("always restricts employee reports to the authenticated employee", async () => {
    vi.mocked(fieldRepository.report).mockResolvedValue({ employees: [] } as never);
    const res = await app.inject({ method: "GET", url: `/field/my-report?period=month&date=2026-11-24&employee_id=${TEST_ORG_ID_B}`,
      headers: { authorization: `Bearer ${employeeToken}` } });
    expect(res.statusCode).toBe(200);
    expect(fieldRepository.report).toHaveBeenCalledWith(expect.objectContaining({ organizationId: TEST_ORG_ID }), "2026-11-01", "2026-12-01", "month", TEST_EMPLOYEE_ID);
  });
  it("uses authenticated organization for admin reports, not injected tenant parameters", async () => {
    vi.mocked(fieldRepository.report).mockResolvedValue({ employees: [] } as never);
    const res = await app.inject({ method: "GET", url: `/admin/field/reports?period=week&date=2026-11-24&organization_id=${TEST_ORG_ID_B}`,
      headers: { authorization: `Bearer ${adminToken}` } });
    expect(res.statusCode).toBe(200);
    expect(fieldRepository.report).toHaveBeenCalledWith(expect.objectContaining({ organizationId: TEST_ORG_ID }), "2026-11-23", "2026-11-30", "week", undefined);
  });
  it("accepts an inclusive custom range for one employee", async () => {
    vi.mocked(fieldRepository.report).mockResolvedValue({ employees: [] } as never);
    const res = await app.inject({ method: "GET",
      url: `/admin/field/reports?period=range&from=2026-10-04&to=2026-11-24&employee_id=${TEST_EMPLOYEE_ID}`,
      headers: { authorization: `Bearer ${adminToken}` } });
    expect(res.statusCode).toBe(200);
    expect(fieldRepository.report).toHaveBeenCalledWith(expect.objectContaining({ organizationId: TEST_ORG_ID }),
      "2026-10-04", "2026-11-25", "range", TEST_EMPLOYEE_ID);
  });
  it("rejects invalid report calendar dates before querying", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/field/reports?period=month&date=2026-02-30", headers: { authorization: `Bearer ${adminToken}` } });
    expect(res.statusCode).toBe(400); expect(fieldRepository.report).not.toHaveBeenCalled();
  });
  it("restricts payment preview, records and history to admins", async () => {
    const headers = { authorization: `Bearer ${employeeToken}` };
    const url = `/admin/field/payments/${TEST_EMPLOYEE_ID}`;
    expect((await app.inject({ method: "GET", url, headers })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: `${url}/preview?period=day&date=2026-11-24`, headers })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url, headers,
      payload: { period: "day", date: "2026-11-24", expected_total_minor: 8500 } })).statusCode).toBe(403);
    expect(fieldRepository.payments).not.toHaveBeenCalled();
    expect(fieldRepository.previewPayment).not.toHaveBeenCalled();
    expect(fieldRepository.recordPayment).not.toHaveBeenCalled();
  });
  it("uses the selected employee and token tenant for payment preview and recording", async () => {
    vi.mocked(fieldRepository.previewPayment).mockResolvedValue({ total_pay_minor: 8500 } as never);
    vi.mocked(fieldRepository.recordPayment).mockResolvedValue({ total_pay_minor: 8500 } as never);
    const url = `/admin/field/payments/${TEST_EMPLOYEE_ID}`;
    const headers = { authorization: `Bearer ${adminToken}` };
    const query = "period=month&date=2026-11-24&component=visits";
    expect((await app.inject({ method: "GET", url: `${url}/preview?${query}&organization_id=${TEST_ORG_ID_B}`, headers })).statusCode).toBe(200);
    expect(fieldRepository.previewPayment).toHaveBeenCalledWith(expect.objectContaining({ organizationId: TEST_ORG_ID }),
      TEST_EMPLOYEE_ID, { period: "month", date: "2026-11-24", component: "visits" });
    expect((await app.inject({ method: "POST", url, headers,
      payload: { period: "month", date: "2026-11-24", expected_total_minor: 8500, organization_id: TEST_ORG_ID_B } })).statusCode).toBe(201);
    expect(fieldRepository.recordPayment).toHaveBeenCalledWith(expect.objectContaining({ organizationId: TEST_ORG_ID }),
      TEST_EMPLOYEE_ID, { period: "month", date: "2026-11-24", component: "both", expected_total_minor: 8500 });
  });
  it("requires a positive reviewed amount before recording payment", async () => {
    const res = await app.inject({ method: "POST", url: `/admin/field/payments/${TEST_EMPLOYEE_ID}`,
      headers: { authorization: `Bearer ${adminToken}` }, payload: { period: "month", date: "2026-11-24", expected_total_minor: -1 } });
    expect(res.statusCode).toBe(400);
    expect(fieldRepository.recordPayment).not.toHaveBeenCalled();
  });
});
