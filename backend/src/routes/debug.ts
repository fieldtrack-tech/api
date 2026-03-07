import type { FastifyInstance } from "fastify";
import { distanceQueue } from "../workers/distance.queue.js";

interface DebugRedisResponse {
  status: "ok" | "error";
  redis: string;
}

/**
 * Debug routes for observability validation.
 *
 * GET /debug/redis — pings Redis via the existing BullMQ ioredis connection.
 * Because OpenTelemetry ioredis instrumentation wraps the underlying client,
 * this call produces a downstream span and creates the
 * fieldtrack-backend → redis edge in the Tempo service graph.
 *
 * The route is intentionally unauthenticated so it can be exercised from curl
 * or a monitoring probe without a JWT. It returns no sensitive data.
 */
export async function debugRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: DebugRedisResponse }>(
    "/debug/redis",
    async (request, reply): Promise<void> => {
      try {
        // Reuse the ioredis connection that BullMQ already owns.
        // waitUntilReady() resolves to the same RedisClient instance used by
        // the queue — no new TCP connection is opened.
        const redisClient = await distanceQueue.waitUntilReady();
        const pong = await redisClient.ping();

        request.log.info({ redis: pong }, "debug/redis ping succeeded");
        void reply.status(200).send({ status: "ok", redis: pong });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        request.log.error({ error: message }, "debug/redis ping failed");
        void reply.status(503).send({ status: "error", redis: "unreachable" });
      }
    },
  );
}
