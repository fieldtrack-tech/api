/**
 * webhook-dlq.routes.ts — Admin API for Dead-Letter Queue (DLQ) management.
 *
 * GET  /admin/webhook-dlq            — list DLQ jobs pending review
 * POST /admin/webhook-dlq/:id/replay — replay a single DLQ job (reset attempt_count)
 *
 * All routes require ADMIN role (JWT + RBAC).
 * Only available when WORKERS_ENABLED=true (registered from app.ts).
 *
 * Replay semantics:
 *  - Removes the job from the DLQ
 *  - Re-enqueues into the main webhook-delivery queue with attempt_number=1
 *  - Resets attempt_count in DB to allow full retry schedule
 *  - Logs a structured audit entry on every replay
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import {
  replayWebhookDlqJob,
  listWebhookDlqJobs,
  getWebhookDlqDepth,
} from "../../workers/webhook.queue.js";
import { supabaseServiceClient as supabase } from "../../config/supabase.js";
import { NotFoundError } from "../../utils/errors.js";
import { handleError } from "../../utils/response.js";
import { insertAuditRecord } from "../../utils/audit.js";

const DLQ_REPLAY_COOLDOWN_MS = 5_000;
let lastDlqReplayAt = 0;

export async function webhookDlqRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /admin/webhook-dlq ─────────────────────────────────────────────────
  app.get(
    "/admin/webhook-dlq",
    {
      schema: {
        tags: ["admin", "webhooks"],
        description: "List jobs in the webhook Dead-Letter Queue (ADMIN only).",
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(100).default(50),
        }),
      },
      preValidation: [authenticate, requireRole("ADMIN")],
    },
    async (request, reply) => {
      try {
        const { limit } = request.query as { limit: number };
        const [jobs, depth] = await Promise.all([
          listWebhookDlqJobs(limit),
          getWebhookDlqDepth(),
        ]);
        reply.status(200).send({
          success: true,
          dlq_depth: depth,
          jobs,
        });
      } catch (error) {
        handleError(error, request, reply, "Failed to list DLQ jobs");
      }
    },
  );

  // ── POST /admin/webhook-dlq/:id/replay ────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    "/admin/webhook-dlq/:id/replay",
    {
      schema: {
        tags: ["admin", "webhooks"],
        description: "Replay a DLQ job: re-enqueue with attempt_count reset (ADMIN only).",
        params: z.object({ id: z.string().uuid() }),
      },
      preValidation: [authenticate, requireRole("ADMIN")],
    },
    async (request, reply) => {
      try {
        const { id: deliveryId } = request.params;
        const adminId = (request as { user?: { sub?: string } }).user?.sub;
        const orgId   = (request as { organizationId?: string }).organizationId;

        // Per-admin replay cooldown — prevents accidental mass re-delivery
        const now = Date.now();
        const elapsed = now - lastDlqReplayAt;
        if (elapsed < DLQ_REPLAY_COOLDOWN_MS) {
          reply.status(429).send({
            success: false,
            error: `DLQ replay rate-limited. Retry in ${DLQ_REPLAY_COOLDOWN_MS - elapsed}ms.`,
          });
          return;
        }
        lastDlqReplayAt = now;

        const replayed = await replayWebhookDlqJob(deliveryId);
        if (!replayed) {
          throw new NotFoundError(`DLQ job for delivery ${deliveryId} not found`);
        }

        // Reset attempt_count in DB so the full retry schedule applies
        await supabase
          .from("webhook_deliveries")
          .update({
            status:        "pending",
            attempt_count:  0,
            next_retry_at:  new Date().toISOString(),
          })
          .eq("id", deliveryId);

        // Structured audit log — queryable in Grafana/Loki
        request.log.info(
          {
            audit:      true,
            event:      "WEBHOOK_DLQ_REPLAY",
            deliveryId,
            adminId,
            organizationId: orgId,
            timestamp:  new Date().toISOString(),
          },
          "webhook-dlq: DLQ job replayed by admin",
        );

        // Persist to DB audit trail for GET /admin/audit-log
        await insertAuditRecord({
          event:          "WEBHOOK_DLQ_REPLAY",
          actor_id:       adminId,
          organization_id: orgId,
          resource_type:  "webhook_delivery",
          resource_id:    deliveryId,
          payload:        { replayed_at: new Date().toISOString() },
        });

        reply.status(200).send({
          success: true,
          data: {
            delivery_id: deliveryId,
            replayed_at: new Date().toISOString(),
            message: "Job re-queued with attempt_count reset",
          },
        });
      } catch (error) {
        handleError(error, request, reply, "Failed to replay DLQ job");
      }
    },
  );
}
