import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyRequest } from "fastify";

vi.mock("../../../src/modules/locations/locations.repository.js", () => ({
  locationsRepository: {
    ingestLocationPoints: vi.fn(),
    findLocationsBySession: vi.fn(),
  },
}));
vi.mock("../../../src/workers/snapshot.queue.js", () => ({
  enqueueLocationUpdate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/modules/profile/profile.repository.js", () => ({
  profileRepository: { updateLastActivity: vi.fn().mockResolvedValue(undefined) },
}));

import { locationsService } from "../../../src/modules/locations/locations.service.js";
import { locationsRepository } from "../../../src/modules/locations/locations.repository.js";
import { enqueueLocationUpdate } from "../../../src/workers/snapshot.queue.js";
import { BadRequestError, ForbiddenError } from "../../../src/utils/errors.js";

const employeeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const organizationId = "11111111-1111-4111-8111-111111111111";
const sessionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const point = { latitude: 28.61, longitude: 77.21, accuracy: 5, recorded_at: "2026-11-01T10:00:00.000Z" };
const later = { ...point, recorded_at: "2026-11-01T10:00:15.000Z" };
const saved = {
  ...point,
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  employee_id: employeeId,
  organization_id: organizationId,
  session_id: sessionId,
  is_duplicate: false,
  sequence_number: null,
};
const request = { organizationId, employeeId, user: { role: "EMPLOYEE" } } as unknown as FastifyRequest;
const ingest = vi.mocked(locationsRepository.ingestLocationPoints);

beforeEach(() => vi.clearAllMocks());

describe("GPS ingestion", () => {
  it("uses verified employee/session identity to store a single active-shift point", async () => {
    ingest.mockResolvedValue({ inserted: [saved], discarded_recorded_at: [], closed: false });
    await expect(locationsService.recordLocation(request, { ...point, session_id: sessionId })).resolves.toEqual(saved);
    expect(ingest).toHaveBeenCalledWith(request, employeeId, sessionId, [point], false);
  });

  it("requires employee context before calling the repository", async () => {
    await expect(locationsService.recordLocationBatch({ ...request, employeeId: undefined }, { session_id: sessionId, points: [point] })).rejects.toThrow(ForbiddenError);
    expect(ingest).not.toHaveBeenCalled();
  });

  it("rejects a single point outside the session window", async () => {
    ingest.mockResolvedValue({ inserted: [], discarded_recorded_at: [point.recorded_at], closed: false });
    await expect(locationsService.recordLocation(request, { ...point, session_id: sessionId })).rejects.toThrow(BadRequestError);
  });

  it("acknowledges valid points and reports discarded timestamps in a recently closed session", async () => {
    ingest.mockResolvedValue({ inserted: [saved], discarded_recorded_at: [later.recorded_at], closed: true });
    await expect(locationsService.recordLocationBatch(request, { session_id: sessionId, points: [point, later] })).resolves.toEqual({
      inserted: 1, discarded_recorded_at: [later.recorded_at], session_closed: true,
    });
    expect(ingest).toHaveBeenCalledWith(request, employeeId, sessionId, [point, later], true);
    expect(enqueueLocationUpdate).not.toHaveBeenCalled();
  });

  it("publishes the newest saved active fix and acknowledges duplicate batches", async () => {
    ingest.mockResolvedValueOnce({ inserted: [saved, { ...saved, ...later }], discarded_recorded_at: [], closed: false });
    ingest.mockResolvedValueOnce({ inserted: [], discarded_recorded_at: [], closed: false });
    const body = { session_id: sessionId, points: [point, later] };
    await expect(locationsService.recordLocationBatch(request, body)).resolves.toEqual({ inserted: 2 });
    await expect(locationsService.recordLocationBatch(request, body)).resolves.toEqual({ inserted: 0 });
    expect(enqueueLocationUpdate).toHaveBeenCalledTimes(1);
    expect(enqueueLocationUpdate).toHaveBeenCalledWith(expect.objectContaining({ recordedAt: later.recorded_at }));
  });
});

describe("GPS route history", () => {
  it("uses tenant and employee context to return a route", async () => {
    vi.mocked(locationsRepository.findLocationsBySession).mockResolvedValue([saved]);
    await expect(locationsService.getRoute(request, sessionId)).resolves.toEqual([saved]);
    expect(locationsRepository.findLocationsBySession).toHaveBeenCalledWith(request, sessionId, employeeId);
  });

  it("returns an empty array for an empty route", async () => {
    vi.mocked(locationsRepository.findLocationsBySession).mockResolvedValue([]);
    await expect(locationsService.getRoute(request, sessionId)).resolves.toEqual([]);
  });
});
