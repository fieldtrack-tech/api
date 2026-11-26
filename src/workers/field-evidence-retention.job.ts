import type { FastifyInstance } from "fastify";
import { supabaseServiceClient as db } from "../config/supabase.js";

const RUN_INTERVAL_MS = 5 * 60_000;
const MAX_BATCHES_PER_RUN = 20;
const SELFIE_BATCH_SIZE = 100;

export function registerFieldEvidenceRetention(app: FastifyInstance): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  async function pruneDatabase(): Promise<void> {
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN && !stopped; batch++) {
      const { data, error } = await db.rpc("prune_field_evidence");
      if (error) throw new Error(error.message);
      if (!data.more) return;
    }
  }

  async function pruneSelfies(): Promise<void> {
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN && !stopped; batch++) {
      const { data, error } = await db.rpc("field_selfies_for_cleanup");
      if (error) throw new Error(error.message);
      const paths = data as string[];
      if (!paths.length) return;

      // Supabase's bulk removal is safe to repeat after an interrupted run,
      // including keys from upload challenges that never had a file.
      const removed = await db.storage.from("attendance-selfies").remove(paths);
      if (removed.error) throw new Error(removed.error.message);
      const completed = await db.rpc("complete_field_selfie_cleanup", { p_paths: paths });
      if (completed.error) throw new Error(completed.error.message);
      if (paths.length < SELFIE_BATCH_SIZE) return;
    }
  }

  async function run(): Promise<void> {
    const results = await Promise.allSettled([pruneDatabase(), pruneSelfies()]);
    for (const result of results) {
      if (result.status === "rejected") app.log.error({ err: result.reason }, "Field evidence cleanup failed");
    }
    if (!stopped) {
      timer = setTimeout(() => void run(), RUN_INTERVAL_MS);
      timer.unref();
    }
  }

  app.addHook("onListen", async () => { void run(); });
  app.addHook("onClose", async () => {
    stopped = true;
    clearTimeout(timer);
  });
}
