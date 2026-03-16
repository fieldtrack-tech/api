import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/role-guard.js";
import { sseEventBus } from "../utils/sse-emitter.js";

/**
 * GET /admin/events
 *
 * Server-Sent Events stream scoped to the authenticated admin's organization.
 *
 * Pushed event types:
 *   session.checkin  — a new attendance session opened
 *   session.checkout — an attendance session closed
 *   expense.created  — a new expense submitted
 *   expense.status   — an expense approved or rejected
 *
 * The endpoint sends a heartbeat comment (``: ping`) every 30 s to
 * keep the connection alive through proxies and load balancers.
 *
 * Auth: ADMIN only.
 * Nginx: requires `proxy_buffering off` — already configured in fieldtrack.conf.
 */
export async function eventsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/admin/events",
    {
      schema: {
        tags: ["admin"],
        description: "Server-Sent Events stream for real-time org activity (ADMIN only).",
        // No response schema — SSE uses raw `text/event-stream`, not JSON.
      },
      preValidation: [authenticate, requireRole("ADMIN")],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = request.organizationId;

      // SSE headers
      void reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      // Helper — write a formatted SSE message to the raw socket
      function sendEvent(type: string, data: unknown): void {
        void reply.raw.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
      }

      function sendComment(text: string): void {
        void reply.raw.write(`: ${text}\n\n`);
      }

      // Send initial connection confirmation
      sendEvent("connected", { orgId });

      // Heartbeat — keeps the connection alive through proxies
      const heartbeat = setInterval(() => {
        if (!reply.raw.writableEnded) {
          sendComment("ping");
        }
      }, 30_000);

      // Org-scoped event handler
      function onOrgEvent(event: { type: string; payload: Record<string, unknown>; ts: string }) {
        if (!reply.raw.writableEnded) {
          sendEvent(event.type, event);
        }
      }

      const channelKey = `org:${orgId}`;
      sseEventBus.on(channelKey, onOrgEvent);

      // Cleanup when client disconnects
      request.raw.on("close", () => {
        clearInterval(heartbeat);
        sseEventBus.off(channelKey, onOrgEvent);
      });

      // Keep the Fastify handler alive — SSE is a long-lived connection
      await new Promise<void>((resolve) => {
        request.raw.on("close", resolve);
      });
    },
  );
}
