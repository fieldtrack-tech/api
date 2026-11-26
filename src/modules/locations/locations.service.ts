import type { FastifyRequest } from "fastify";
import { locationsRepository } from "./locations.repository.js";
import { BadRequestError, requireEmployeeContext } from "../../utils/errors.js";
import { metrics } from "../../utils/metrics.js";
import type { LocationRecord, CreateLocationBody, CreateLocationBatchBody } from "./locations.schema.js";
import { profileRepository } from "../profile/profile.repository.js";
import { enqueueLocationUpdate } from "../../workers/snapshot.queue.js";

function publishLatestFix(request: FastifyRequest, point: LocationRecord) {
  profileRepository.updateLastActivity(request, point.employee_id).catch(() => {});
  enqueueLocationUpdate({
    employeeId: point.employee_id,
    organizationId: request.organizationId,
    sessionId: point.session_id,
    latitude: point.latitude,
    longitude: point.longitude,
    recordedAt: point.recorded_at,
  }).catch((error: unknown) => {
    request.log.warn({ sessionId: point.session_id, error }, "Could not enqueue GPS snapshot update");
  });
}

export const locationsService = {
  async recordLocation(request: FastifyRequest, body: CreateLocationBody): Promise<LocationRecord> {
    requireEmployeeContext(request);
    const { session_id, ...point } = body;
    const saved = await locationsRepository.ingestLocationPoints(request, request.employeeId, session_id, [point], false);
    const record = saved.inserted[0];
    if (!record) {
      throw new BadRequestError(
        "Cannot record location: recorded_at is before the session start time or outside the accepted sync window.",
        "LOCATION_OUTSIDE_SESSION",
      );
    }
    metrics.incrementLocationsInserted(1);
    publishLatestFix(request, record);
    return record;
  },

  async recordLocationBatch(request: FastifyRequest, body: CreateLocationBatchBody) {
    requireEmployeeContext(request);
    const saved = await locationsRepository.ingestLocationPoints(request, request.employeeId, body.session_id, body.points, true);
    metrics.incrementLocationsInserted(saved.inserted.length);
    const latest = saved.inserted.at(-1);
    if (latest && !saved.closed) publishLatestFix(request, latest);
    return {
      inserted: saved.inserted.length,
      ...(saved.discarded_recorded_at.length > 0 && { discarded_recorded_at: saved.discarded_recorded_at }),
      ...(saved.closed && { session_closed: true as const }),
    };
  },

  async getRoute(request: FastifyRequest, sessionId: string): Promise<LocationRecord[]> {
    return (await locationsRepository.findLocationsBySession(request, sessionId, request.employeeId)) ?? [];
  },
};
