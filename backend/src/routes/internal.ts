import type { FastifyInstance } from "fastify";
import { metrics } from "../utils/metrics.js";
import { getQueueDepth } from "../workers/queue.js";

/**
 * Internal observability routes.
 *
 * These endpoints are NOT authenticated — they are intended to be called by
 * internal monitoring tools, health-check sidecars, or a local ops dashboard
 * that sits behind a network boundary (e.g. not exposed to the public internet).
 *
 * If this service is ever publicly reachable, add an IP allowlist or a shared
 * secret header check in front of these routes.
 */
export async function internalRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /internal/metrics
   *
   * Returns a structured JSON snapshot of the process's current operational
   * state. All values are point-in-time readings — no aggregation window.
   *
   * Response shape:
   * {
   *   uptimeSeconds:          number   — seconds since the process started
   *   queueDepth:             number   — sessions currently waiting in the worker queue
   *   totalRecalculations:    number   — cumulative completed distance recalculations
   *   totalLocationsInserted: number   — cumulative GPS points written (deduped)
   *   avgRecalculationMs:     number   — rolling average recalculation latency (last 100 jobs)
   * }
   */
  app.get("/internal/metrics", async (_request, reply): Promise<void> => {
    const snapshot = metrics.snapshot(getQueueDepth());
    reply.status(200).send(snapshot);
  });
}
