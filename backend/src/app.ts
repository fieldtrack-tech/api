import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { env } from "./config/env.js";
import { getLoggerConfig } from "./config/logger.js";
import { registerJwt } from "./plugins/jwt.js";
import { registerRoutes } from "./routes/index.js";
import fastifyRateLimit from "@fastify/rate-limit";
import { startDistanceWorker } from "./workers/queue.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: getLoggerConfig(env.NODE_ENV),
  });

  // Register plugins
  await app.register(fastifyRateLimit, {
    global: false, // Applied selectively per-route
  });
  await registerJwt(app);

  // Register routes
  await registerRoutes(app);

  // Bootstrap Phase 7 Background Worker.
  // Explicitly NOT awaited — this is a perpetual infinite loop that must
  // run alongside the HTTP server, not block app construction.
  startDistanceWorker(app);

  // NOTE: performStartupRecovery is intentionally NOT called here.
  // It must run AFTER app.listen() resolves in server.ts so it never
  // prevents the server from accepting traffic during the recovery scan.

  return app;
}
