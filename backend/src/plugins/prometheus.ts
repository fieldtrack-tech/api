import type { FastifyPluginAsync } from "fastify";
import client from "prom-client";

// Isolated registry — avoids polluting the global prom-client default registry
// in case other libraries also use prom-client internally.
const register = new client.Registry();

// Default Node.js metrics: CPU usage, heap, event-loop lag, GC, libuv handles.
client.collectDefaultMetrics({ register });

const prometheusPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.get("/metrics", async (_request, reply) => {
    // Prometheus exposition format — no auth required (scraped internally).
    await reply
      .header("Content-Type", register.contentType)
      .send(await register.metrics());
  });
};

export default prometheusPlugin;
