import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyRequest } from "fastify";
import {
  EmployeeAlreadyCheckedIn,
  NotFoundError,
  SessionAlreadyClosed,
} from "../../../src/utils/errors.js";

// ─── Module mocks (hoisted before all imports) ────────────────────────────────

vi.mock("../../../src/modules/attendance/attendance.repository.js", () => ({
  attendanceRepository: {
    findEmployeeInOrg: vi.fn(),
    findOpenSession: vi.fn(),
    createSession: vi.fn(),
    closeSession: vi.fn(),
    findSessionsByUser: vi.fn(),
    findSessionsByOrg: vi.fn(),
    validateSessionActive: vi.fn(),
  },
}));

vi.mock("../../../src/workers/distance.queue.js", () => ({
  enqueueDistanceJob: vi.fn().mockResolvedValue(undefined),
}));

// Import AFTER mocks are declared so they receive mock implementations
import { attendanceService } from "../../../src/modules/attendance/attendance.service.js";
import { attendanceRepository } from "../../../src/modules/attendance/attendance.repository.js";
import { enqueueDistanceJob } from "../../../src/workers/distance.queue.js";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_ID = "11111111-1111-1111-1111-111111111111";
const SESSION_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function makeFakeRequest(): FastifyRequest {
  return {
    user: { sub: USER_ID, role: "EMPLOYEE", organization_id: ORG_ID },
    organizationId: ORG_ID,
    id: "test-req-id",
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as unknown as FastifyRequest;
}

const openSession = {
  id: SESSION_ID,
  employee_id: USER_ID,
  organization_id: ORG_ID,
  checkin_at: new Date().toISOString(),
  checkout_at: null,
  distance_recalculation_status: "pending",
  total_distance_km: null,
  total_duration_seconds: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const closedSession = {
  ...openSession,
  checkout_at: new Date().toISOString(),
};

// ─── attendanceService.checkIn ────────────────────────────────────────────────

describe("attendanceService.checkIn()", () => {
  beforeEach(() => {
    vi.mocked(attendanceRepository.findEmployeeInOrg).mockResolvedValue(true);
    vi.mocked(attendanceRepository.findOpenSession).mockResolvedValue(null);
    vi.mocked(attendanceRepository.createSession).mockResolvedValue(openSession as never);
  });

  it("returns a new session on successful check-in", async () => {
    const result = await attendanceService.checkIn(makeFakeRequest());
    expect(result).toEqual(openSession);
  });

  it("calls findEmployeeInOrg with the JWT sub", async () => {
    await attendanceService.checkIn(makeFakeRequest());
    expect(attendanceRepository.findEmployeeInOrg).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID }),
      USER_ID,
    );
  });

  it("calls createSession after validating the employee", async () => {
    await attendanceService.checkIn(makeFakeRequest());
    expect(attendanceRepository.createSession).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
    );
  });

  it("throws NotFoundError when employee does not exist in org", async () => {
    vi.mocked(attendanceRepository.findEmployeeInOrg).mockResolvedValue(false);
    await expect(attendanceService.checkIn(makeFakeRequest())).rejects.toThrow(
      NotFoundError,
    );
  });

  it("throws EmployeeAlreadyCheckedIn when an open session exists", async () => {
    vi.mocked(attendanceRepository.findOpenSession).mockResolvedValue(
      openSession as never,
    );
    await expect(attendanceService.checkIn(makeFakeRequest())).rejects.toThrow(
      EmployeeAlreadyCheckedIn,
    );
  });

  it("does NOT call createSession if employee validation fails", async () => {
    vi.mocked(attendanceRepository.findEmployeeInOrg).mockResolvedValue(false);
    await expect(attendanceService.checkIn(makeFakeRequest())).rejects.toThrow();
    expect(attendanceRepository.createSession).not.toHaveBeenCalled();
  });
});

// ─── attendanceService.checkOut ───────────────────────────────────────────────

describe("attendanceService.checkOut()", () => {
  beforeEach(() => {
    vi.mocked(attendanceRepository.findOpenSession).mockResolvedValue(
      openSession as never,
    );
    vi.mocked(attendanceRepository.closeSession).mockResolvedValue(
      closedSession as never,
    );
  });

  it("returns the closed session on successful check-out", async () => {
    const result = await attendanceService.checkOut(makeFakeRequest());
    expect(result).toEqual(closedSession);
  });

  it("calls closeSession with the open session id", async () => {
    await attendanceService.checkOut(makeFakeRequest());
    expect(attendanceRepository.closeSession).toHaveBeenCalledWith(
      expect.anything(),
      SESSION_ID,
    );
  });

  it("enqueues a distance job after closing the session", async () => {
    await attendanceService.checkOut(makeFakeRequest());
    expect(enqueueDistanceJob).toHaveBeenCalledWith(SESSION_ID);
  });

  it("throws SessionAlreadyClosed when no open session exists", async () => {
    vi.mocked(attendanceRepository.findOpenSession).mockResolvedValue(null);
    await expect(
      attendanceService.checkOut(makeFakeRequest()),
    ).rejects.toThrow(SessionAlreadyClosed);
  });

  it("does NOT call closeSession if there is no open session", async () => {
    vi.mocked(attendanceRepository.findOpenSession).mockResolvedValue(null);
    await expect(
      attendanceService.checkOut(makeFakeRequest()),
    ).rejects.toThrow();
    expect(attendanceRepository.closeSession).not.toHaveBeenCalled();
  });
});
