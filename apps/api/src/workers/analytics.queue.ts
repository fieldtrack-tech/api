import { Queue } from "bullmq";
import { redisConnectionOptions } from "../config/redis.js";

// ─── Job Payload Shape ────────────────────────────────────────────────────────

export interface AnalyticsJobData {
  sessionId: string;
  organizationId: string;
  employeeId: string;
}

// ─── Queue Definition ─────────────────────────────────────────────────────────

/**
 * Phase 21: Dedicated BullMQ queue for analytics aggregation jobs.
 *
 * Each job is triggered by a session checkout and performs a full idempotent
 * recompute of employee_daily_metrics and org_daily_metrics for the session's
 * date. Jobs use the session distance data that the distance worker writes
 * to attendance_sessions.total_distance_km.
 *
 * Retry strategy: 3 attempts with 5 s initial exponential backoff.  The first
 * attempt fires ~5 s after checkout; by then the distance worker has almost
 * certainly written its result.  On the rare case it hasn't, the second retry
 * at ~10 s will succeed.
 *
 * Deduplication: jobId = `analytics:<sessionId>` ensures that duplicate
 * enqueue calls for the same session (e.g. retry of the checkout endpoint)
 * produce only a single job in the queue.
 */
const analyticsQueue = new Queue<AnalyticsJobData>("analytics", {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5_000, // 5 s → 10 s → 20 s; gives distance worker time to finish
    },
    removeOnComplete: true,
    removeOnFail: false, // Retain failed jobs for operator inspection
  },
});

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Enqueue an analytics aggregation job for the given session.
 *
 * Idempotent: duplicate calls for the same sessionId are silently ignored by
 * BullMQ because the jobId is deterministic (analytics:<sessionId>).
 */
export async function enqueueAnalyticsJob(
  sessionId: string,
  organizationId: string,
  employeeId: string,
): Promise<void> {
  await analyticsQueue.add(
    "update-metrics",
    { sessionId, organizationId, employeeId },
    { jobId: `analytics:${sessionId}` },
  );
}

/**
 * Returns the count of jobs currently waiting in the analytics queue.
 * Consumed by the Prometheus metrics collector.
 */
export async function getAnalyticsQueueDepth(): Promise<number> {
  return analyticsQueue.getWaitingCount();
}

export { analyticsQueue };
