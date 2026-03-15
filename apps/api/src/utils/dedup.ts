/**
 * Phase 22: In-flight request deduplication.
 *
 * Prevents cache-miss stampedes on expensive endpoints (e.g. /admin/dashboard)
 * when multiple identical requests arrive concurrently before the first one
 * has written its result to Redis.
 *
 * Usage:
 *   const data = await deduped(`dashboard:${orgId}`, () => expensiveQuery());
 *
 * Guarantees:
 *  - Only ONE underlying call executes for a given key at any instant.
 *  - All concurrent callers resolve to the SAME promise (same data, same timing).
 *  - The key is removed from the map as soon as the promise settles (resolve OR reject),
 *    so the next caller after the first finishes starts a fresh execution.
 *  - Errors propagate to all waiters; they are not swallowed.
 *
 * Thread-safety note: Node.js is single-threaded, so the map read-check-set
 * sequence is atomic and race-free within a single process.
 */

// Module-level singleton — shared across all callers in this process.
const inflight = new Map<string, Promise<unknown>>();

/**
 * Return the in-flight promise for `key` if one exists; otherwise call `fn`,
 * store the resulting promise under `key`, and return it.
 */
export function deduped<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing !== undefined) return existing as Promise<T>;

  const promise = fn().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}
