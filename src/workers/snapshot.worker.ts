/**
 * snapshot.worker.ts — feat-1 snapshot table maintenance worker.
 *
 * Processes events from the "snapshot-engine" BullMQ queue and keeps the
 * four denormalised snapshot tables up to date:
 *
 *   employee_last_state      ← CHECK_IN, CHECK_OUT, LOCATION_UPDATE
 *   active_users             ← CHECK_IN, CHECK_OUT
 *   employee_metrics_snapshot← CHECK_IN, CHECK_OUT, EXPENSE_APPROVED
 *   pending_expenses         ← EXPENSE_CREATED, EXPENSE_APPROVED, EXPENSE_REJECTED
 *
 * IDEMPOTENCY STRATEGY
 * ────────────────────
 * All DB writes use UPSERT (ON CONFLICT DO UPDATE) or conditional DELETEs:
 *
 * • CHECK_IN / CHECK_OUT state fields      → UPSERT via SET (not +=)
 * • employee_metrics_snapshot totals       → full recompute from
 *                                            employee_daily_metrics + expenses
 *                                            (SET, not increment)
 * • pending_expenses insert                → ON CONFLICT DO NOTHING
 * • pending_expenses delete                → DELETE WHERE id = ?  (safe if row absent)
 * • active_users insert                    → ON CONFLICT DO UPDATE (last_seen_at)
 * • active_users delete                    → DELETE WHERE employee_id = ?
 *
 * Every job carries a deterministic jobId so BullMQ deduplicates at enqueue.
 * The worker is safe to retry any number of times.
 */

import { Worker } from "bullmq";
import { metrics } from "../utils/metrics.js";
import type { Job } from "bullmq";
import type { FastifyInstance } from "fastify";
import { redisConnectionOptions } from "../config/redis.js";
import { supabaseServiceClient as supabase } from "../config/supabase.js";
import type { SnapshotJobData } from "./snapshot.queue.js";
import { moveSnapshotToDeadLetter } from "./snapshot.queue.js";

// ─── Guard ────────────────────────────────────────────────────────────────────

let workerStarted = false;

// ─── Slow job threshold ───────────────────────────────────────────────────────

const SLOW_JOB_MS = 200;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recompute and UPSERT employee_metrics_snapshot from employee_daily_metrics
 * (sessions, distance, hours) and the expenses table (total approved amount).
 *
 * Full-recompute strategy: reads aggregate values and sets them — never
 * increments — so the result is deterministic regardless of retry count.
 *
 * Only errors that truly block the snapshot update are re-thrown.
 * If the daily_metrics aggregate is missing (worker ran before analytics job)
 * we still write whatever is available; the next CHECK_OUT will fix it.
 */
async function recomputeMetricsSnapshot(
  employeeId: string,
  organizationId: string,
  app: FastifyInstance,
): Promise<void> {
  const [metricsResult, expensesResult] = await Promise.all([
    supabase
      .from("employee_daily_metrics")
      .select("sessions, distance_km, duration_seconds")
      .eq("employee_id", employeeId)
      .eq("organization_id", organizationId),

    supabase
      .from("expenses")
      .select("amount")
      .eq("employee_id", employeeId)
      .eq("organization_id", organizationId)
      .eq("status", "APPROVED"),
  ]);

  if (metricsResult.error) {
    app.log.warn(
      { employeeId, error: metricsResult.error.message },
      "snapshot-worker: failed to fetch daily_metrics for snapshot recompute",
    );
    // Don't throw — partial update is better than no update.
  }
  if (expensesResult.error) {
    app.log.warn(
      { employeeId, error: expensesResult.error.message },
      "snapshot-worker: failed to fetch approved expenses for snapshot recompute",
    );
  }

  const metrics = (metricsResult.data ?? []) as Array<{
    sessions: number;
    distance_km: number;
    duration_seconds: number;
  }>;

  let totalSessions = 0;
  let totalDurationSeconds = 0;
  let totalDistanceKm = 0;
  for (const row of metrics) {
    totalSessions += row.sessions ?? 0;
    totalDurationSeconds += row.duration_seconds ?? 0;
    totalDistanceKm += row.distance_km ?? 0;
  }

  const approvedExpenses = (expensesResult.data ?? []) as Array<{ amount: number }>;
  const totalExpenses = approvedExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

  const { error: upsertErr } = await supabase
    .from("employee_metrics_snapshot")
    .upsert(
      {
        employee_id:     employeeId,
        organization_id: organizationId,
        total_sessions:  totalSessions,
        total_hours:     Math.round((totalDurationSeconds / 3600) * 100) / 100,
        total_distance:  Math.round(totalDistanceKm * 10_000) / 10_000,
        total_expenses:  Math.round(totalExpenses * 100) / 100,
        last_active_at:  new Date().toISOString(),
        updated_at:      new Date().toISOString(),
      },
      { onConflict: "employee_id" },
    );

  if (upsertErr) {
    throw new Error(
      `snapshot-worker: failed to upsert employee_metrics_snapshot: ${upsertErr.message}`,
    );
  }
}

// ─── Job Handlers ─────────────────────────────────────────────────────────────

async function refreshEmployeeTracking(data: { employeeId: string; organizationId: string }): Promise<void> {
  const { error } = await supabase.rpc("refresh_employee_tracking", {
    p_org: data.organizationId, p_employee: data.employeeId,
  });
  if (error) throw new Error(`Failed to refresh employee tracking: ${error.message}`);
}

async function handleCheckIn(
  data: Extract<SnapshotJobData, { type: "CHECK_IN" }>,
  app: FastifyInstance,
): Promise<void> {
  await refreshEmployeeTracking(data);
  await recomputeMetricsSnapshot(data.employeeId, data.organizationId, app);
}

async function handleCheckOut(
  data: Extract<SnapshotJobData, { type: "CHECK_OUT" }>,
  app: FastifyInstance,
): Promise<void> {
  await refreshEmployeeTracking(data);
  await recomputeMetricsSnapshot(data.employeeId, data.organizationId, app);
}

async function handleExpenseCreated(
  data: Extract<SnapshotJobData, { type: "EXPENSE_CREATED" }>,
  _app: FastifyInstance,
): Promise<void> {
  // Insert row into pending_expenses.  ON CONFLICT DO NOTHING makes this safe
  // to retry if the row already exists from a previous attempt.
  const { error } = await supabase
    .from("pending_expenses")
    .upsert(
      {
        id:              data.expenseId,
        organization_id: data.organizationId,
        employee_id:     data.employeeId,
        amount:          data.amount,
        submitted_at:    data.submittedAt,
      },
      { onConflict: "id", ignoreDuplicates: true },
    );

  if (error) {
    throw new Error(`snapshot-worker [EXPENSE_CREATED] insert failed: ${error.message}`);
  }
}

async function handleExpenseResolved(
  data: Extract<SnapshotJobData, { type: "EXPENSE_APPROVED" | "EXPENSE_REJECTED" }>,
  app: FastifyInstance,
): Promise<void> {
  // 1. Remove from pending_expenses (safe if already gone)
  const { error: deleteErr } = await supabase
    .from("pending_expenses")
    .delete()
    .eq("id", data.expenseId);

  if (deleteErr) {
    // Row may already be absent from a previous attempt — log and continue.
    app.log.warn(
      { expenseId: data.expenseId, error: deleteErr.message },
      "snapshot-worker [EXPENSE_RESOLVED]: pending_expenses delete error (non-fatal)",
    );
  }

  // 2. Recompute cumulative metrics only on approval (total_expenses is
  //    sum of approved amounts; rejections don't change it).
  if (data.type === "EXPENSE_APPROVED") {
    await recomputeMetricsSnapshot(data.employeeId, data.organizationId, app);
  }
}

// ─── Worker Factory ───────────────────────────────────────────────────────────

export function startSnapshotWorker(app: FastifyInstance): void {
  if (workerStarted) {
    app.log.warn("snapshot-worker already started — skipping duplicate start");
    return;
  }

  const worker = new Worker<SnapshotJobData>(
    "snapshot-engine",
    async (job: Job<SnapshotJobData>) => {
      const t0 = Date.now();
      const { data } = job;

      switch (data.type) {
        case "CHECK_IN":
          await handleCheckIn(data, app);
          break;
        case "CHECK_OUT":
          await handleCheckOut(data, app);
          break;
        case "LOCATION_UPDATE":
          await refreshEmployeeTracking(data);
          break;
        case "EXPENSE_CREATED":
          await handleExpenseCreated(data, app);
          break;
        case "EXPENSE_APPROVED":
        case "EXPENSE_REJECTED":
          await handleExpenseResolved(data, app);
          break;
        default: {
          // Exhaustive check — TypeScript will error if a new type is added
          // without a corresponding case.
          const _exhaustive: never = data;
          app.log.error(
            { type: (_exhaustive as SnapshotJobData).type },
            "snapshot-worker: unknown job type",
          );
        }
      }

      const durationMs = Date.now() - t0;
      metrics.recordWorkerJob();
      app.log.info(
        {
          jobId:   job.id,
          type:    data.type,
          durationMs,
          slow:    durationMs > SLOW_JOB_MS,
        },
        "snapshot-worker: job complete",
      );
    },
    {
      connection: redisConnectionOptions,
      concurrency: 5,
    },
  );

  worker.on("failed", async (job, err) => {
    if (!job) return;
    const isExhausted = (job.attemptsMade ?? 0) >= (job.opts?.attempts ?? 5);
    app.log.error(
      {
        jobId:        job.id,
        type:         job.data?.type,
        attemptsMade: job.attemptsMade,
        exhausted:    isExhausted,
        error:        err.message,
      },
      "snapshot-worker: job failed",
    );

    if (isExhausted) {
      await moveSnapshotToDeadLetter(job.data, err.message).catch((dlqErr: unknown) => {
        app.log.error(
          { jobId: job.id, dlqError: String(dlqErr) },
          "snapshot-worker: failed to move job to DLQ",
        );
      });
    }
  });

  worker.on("error", (err) => {
    app.log.error({ error: err.message }, "snapshot-worker: worker-level error");
  });

  workerStarted = true;
  app.log.info("snapshot-worker started (queue: snapshot-engine, concurrency: 5)");
}
