import type { FastifyInstance } from "fastify";
import { setTimeout as delay } from "node:timers/promises";
import { getConfigHash } from "../config/env.js";
import { shouldStartWorkers, areWorkersStarted, getExpectedWorkerCount } from "../workers/startup.js";

// Bootstrap flag: set to true only after Fastify has fully initialised
// (plugins registered, routes attached, app.listen() resolved).
// /health returns 503 until this is set — prevents the deploy gate and Docker
// HEALTHCHECK (127.0.0.1:3000/health) from treating a partial boot as healthy.
// /ready is separate: deep checks (Redis, Supabase, queues) — never use it for
// Docker HEALTHCHECK or deploy.sh; workers must not block liveness.
let isBootstrapped = false;

export function setBootstrapped(): void {
    isBootstrapped = true;
}

interface HealthResponse {
        status: string;
        timestamp: string;
        config_hash: string;
}

interface ReadyResponse {
    status: "ready" | "not_ready";
    timestamp: string;
    checks: {
        redis: "ok" | "error";
        supabase: "ok" | "error";
        bullmq: "ok" | "error";
        workers?: {
            status: "ok" | "error" | "skipped";
            active: number;
            expected: number;
        };
    };
}

const READY_CACHE_TTL_MS = 3000;
const READY_TIMEOUT_MS = 2500;

async function checkDependency(probe: () => Promise<unknown>): Promise<"ok" | "error"> {
    const controller = new AbortController();
    try {
        return await Promise.race([
            probe().then(() => "ok" as const, () => "error" as const),
            delay(READY_TIMEOUT_MS, "error" as const, { signal: controller.signal, ref: false }),
        ]);
    } finally {
        controller.abort();
    }
}

interface RootResponse {
    service: string;
    status: string;
    version: string;
    docs: string;
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
    let readyCache: { expiresAt: number; response: ReadyResponse } | null = null;
    let readinessCheck: Promise<ReadyResponse> | undefined;
    // Root — service identity probe.
    // Previously served by Nginx as a static response; now handled by Fastify
    // so the response goes through the same middleware chain as all other routes.
    app.get<{ Reply: RootResponse }>("/", {
        schema: { tags: ["health"] },
    }, async () => {
        return {
            service: "FieldTrack 2.0",
            status: "online",
            version: "1.0.0",
            docs: "/docs",
        };
    });

    app.get<{ Reply: HealthResponse }>("/health", {
        schema: { tags: ["health"] },
    }, async (_request, reply) => {
        if (!isBootstrapped) {
            await reply.status(503).send({
                status: "starting",
                timestamp: new Date().toISOString(),
                config_hash: "",
            });
            return;
        }
        return {
            status: "ok",
            timestamp: new Date().toISOString(),
            config_hash: getConfigHash(),
        };
    });

    app.get<{ Reply: ReadyResponse }>("/ready", {
        schema: { tags: ["health"] },
    }, async (_request, reply) => {
        if (!readyCache || readyCache.expiresAt <= Date.now()) {
            readinessCheck ??= probeReadiness().then((response) => {
                readyCache = { expiresAt: Date.now() + READY_CACHE_TTL_MS, response };
                return response;
            }).finally(() => { readinessCheck = undefined; });
            const response = await readinessCheck;
            return reply.status(response.status === "ready" ? 200 : 503).send(response);
        }
        const { response } = readyCache;
        return reply.status(response.status === "ready" ? 200 : 503).send(response);
    });
}

async function probeReadiness(): Promise<ReadyResponse> {
    const [redis, supabase, bullmq] = await Promise.all([
        checkDependency(async () => {
            const { distanceQueue } = await import("../workers/distance.queue.js");
            const client = await distanceQueue.client;
            if (client.status !== "ready") throw new Error("Redis is unavailable");
            await client.get("fieldtrack:readiness");
        }),
        checkDependency(async () => {
            const { supabaseServiceClient } = await import("../config/supabase.js");
            const { error } = await supabaseServiceClient.from("organizations").select("id")
                .limit(1).abortSignal(AbortSignal.timeout(READY_TIMEOUT_MS));
            if (error) throw error;
        }),
        checkDependency(async () => {
            const [{ distanceQueue }, { analyticsQueue }, { getWebhookQueueDepth }, { getSnapshotQueueDepth }] = await Promise.all([
                import("../workers/distance.queue.js"), import("../workers/analytics.queue.js"),
                import("../workers/webhook.queue.js"), import("../workers/snapshot.queue.js"),
            ]);
            const client = await distanceQueue.client;
            if (client.status !== "ready") throw new Error("Queue broker is unavailable");
            await Promise.all([distanceQueue.getWaitingCount(), analyticsQueue.getWaitingCount(),
                getWebhookQueueDepth(), getSnapshotQueueDepth()]);
        }),
    ]);
    const expected = getExpectedWorkerCount();
    const started = areWorkersStarted();
    const workers = {
        status: shouldStartWorkers() ? (started ? "ok" as const : "error" as const) : "skipped" as const,
        active: started ? expected : 0,
        expected,
    };
    const ready = isBootstrapped && redis === "ok" && supabase === "ok" && bullmq === "ok" && workers.status !== "error";
    return { status: ready ? "ready" : "not_ready", timestamp: new Date().toISOString(), checks: { redis, supabase, bullmq, workers } };
}
