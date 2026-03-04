import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { metrics } from "../utils/metrics.js";
import { sessionSummaryService } from "../modules/session_summary/session_summary.service.js";

// ─── Queue State ──────────────────────────────────────────────────────────────

/**
 * Ordered processing queue.
 * Kept private — all mutations go through enqueueDistanceRecalculation().
 */
const queue: string[] = [];

/**
 * O(1) de-duplication mirror of `queue`.
 * Always kept in sync: item added to queue → added to set; shifted out → deleted from set.
 * Prevents the O(n) queue.includes() scan that degrades under load.
 */
const queuedSet = new Set<string>();

/**
 * Sessions currently being executed by the worker.
 * Exported so the recalculate controller can reject concurrent manual triggers (409).
 */
export const processingTracker = new Set<string>();

// ─── Configuration ────────────────────────────────────────────────────────────

/** Milliseconds the worker sleeps when the queue is empty before re-checking. */
const IDLE_SLEEP_MS = 100;

/** Number of recovered sessions to enqueue per setImmediate tick during startup recovery. */
const RECOVERY_BATCH_SIZE = 50;

// ─── Public Queue API ─────────────────────────────────────────────────────────

/**
 * Centralized, safe enqueue function.
 *
 * Guarantees:
 *  - O(1) duplicate detection (set-based, not array scan)
 *  - Hard cap at env.MAX_QUEUE_DEPTH — drops with a warning instead of growing unbounded
 *  - Logs every depth change so operators can observe queue pressure
 *
 * @returns true  if the session was accepted into the queue
 * @returns false if it was a duplicate, already processing, or queue is full
 */
export function enqueueDistanceRecalculation(
  sessionId: string,
  log?: FastifyInstance["log"],
): boolean {
  // Already being processed right now
  if (processingTracker.has(sessionId)) {
    log?.debug(
      { sessionId },
      "Enqueue skipped: session is currently processing",
    );
    return false;
  }

  // Already waiting in the queue
  if (queuedSet.has(sessionId)) {
    log?.debug({ sessionId }, "Enqueue skipped: session already in queue");
    return false;
  }

  // Hard queue depth cap — prevents unbounded memory growth
  if (queue.length >= env.MAX_QUEUE_DEPTH) {
    log?.warn(
      { sessionId, queueDepth: queue.length, maxDepth: env.MAX_QUEUE_DEPTH },
      "Queue depth limit reached — session enqueue dropped",
    );
    return false;
  }

  queue.push(sessionId);
  queuedSet.add(sessionId);

  log?.info(
    { sessionId, queueDepth: queue.length },
    "Session enqueued for distance recalculation",
  );

  return true;
}

/**
 * Returns the current number of sessions waiting in the queue.
 * Used by the metrics registry — decoupled so metrics.ts has no direct queue import.
 */
export function getQueueDepth(): number {
  return queue.length;
}

// ─── Worker Loop ──────────────────────────────────────────────────────────────

/**
 * Perpetual background distance worker.
 *
 * Design guarantees:
 *  - Never throws — every job is wrapped in try/catch/finally
 *  - Failed jobs do NOT block the queue (processingTracker cleaned in finally)
 *  - Yields to the event loop between jobs via setImmediate
 *  - Sleeps IDLE_SLEEP_MS when queue is empty to prevent aggressive spin
 *  - Structured error log on failure includes session_id for traceability
 */
export async function startDistanceWorker(
  fastifyApp: FastifyInstance,
): Promise<void> {
  fastifyApp.log.info("Distance worker started");

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (queue.length === 0) {
      // Yield to the event loop — prevents busy-waiting when idle
      await new Promise<void>((resolve) => setTimeout(resolve, IDLE_SLEEP_MS));
      continue;
    }

    const sessionId = queue.shift();
    if (!sessionId) continue;

    // Keep the de-duplication set in sync with the queue
    queuedSet.delete(sessionId);

    processingTracker.add(sessionId);

    fastifyApp.log.info(
      { sessionId, remainingQueueDepth: queue.length },
      "Worker picked up session for distance calculation",
    );

    try {
      await sessionSummaryService.calculateAndSaveSystem(fastifyApp, sessionId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      fastifyApp.log.error(
        { sessionId, error: message },
        "Background distance calculation failed — session will not be retried automatically",
      );
    } finally {
      processingTracker.delete(sessionId);

      // Yield to the event loop between jobs so in-flight HTTP requests are not starved
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
}

// ─── Crash Recovery ───────────────────────────────────────────────────────────

/**
 * Phase 7.5 — Crash Recovery & Self-Healing.
 *
 * Called AFTER app.listen() resolves in server.ts — never inside buildApp() —
 * so the recovery scan never blocks the server from accepting traffic.
 *
 * Orphaned sessions (checked-out but missing or stale summary) are re-enqueued
 * in small batches using setImmediate so the event loop is not saturated during
 * the recovery window.
 *
 * Collision safety: enqueueDistanceRecalculation() is idempotent — sessions
 * already processing or queued are silently skipped.
 */
export async function performStartupRecovery(
  fastifyApp: FastifyInstance,
): Promise<void> {
  try {
    fastifyApp.log.info("Phase 7.5: starting crash recovery scan");

    // Dynamic import avoids a circular-dependency chain at module load time
    const { attendanceRepository } =
      await import("../modules/attendance/attendance.repository.js");

    const orphans = await attendanceRepository.findSessionsNeedingRecalculation(
      fastifyApp.log,
    );

    if (orphans.length === 0) {
      fastifyApp.log.info(
        "Phase 7.5: crash recovery complete — no orphaned sessions found",
      );
      return;
    }

    fastifyApp.log.info(
      { orphanCount: orphans.length },
      "Phase 7.5: orphaned sessions found — scheduling batched re-enqueue",
    );

    // Enqueue in small batches, yielding between each batch so the worker
    // and HTTP server remain responsive throughout the recovery window.
    let batchStart = 0;
    let totalEnqueued = 0;

    const enqueueBatch = (): void => {
      const end = Math.min(batchStart + RECOVERY_BATCH_SIZE, orphans.length);
      const batch = orphans.slice(batchStart, end);

      for (const session of batch) {
        const accepted = enqueueDistanceRecalculation(
          session.id,
          fastifyApp.log,
        );
        if (accepted) totalEnqueued++;
      }

      batchStart = end;

      if (batchStart < orphans.length) {
        // More batches remain — yield to event loop before continuing
        setImmediate(enqueueBatch);
      } else {
        fastifyApp.log.info(
          { orphanCount: orphans.length, totalEnqueued },
          "Phase 7.5: crash recovery re-enqueue complete",
        );

        // Record recovered sessions in metrics so operators can see the impact
        metrics.incrementRecalculations();
      }
    };

    // Start the first batch on the next event loop tick so listen() has fully
    // resolved before we begin touching the queue.
    setImmediate(enqueueBatch);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    fastifyApp.log.error(
      { error: message },
      "Phase 7.5: crash recovery scan failed — some sessions may need manual recalculation",
    );
  }
}
