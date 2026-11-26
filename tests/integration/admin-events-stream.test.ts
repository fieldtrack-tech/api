import Fastify from "fastify";
import cors from "@fastify/cors";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/auth/jwtVerifier.js", () => ({
  verifySupabaseToken: vi.fn(async () => ({
    sub: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    role: "ADMIN",
    org_id: "11111111-1111-4111-8111-111111111111",
    exp: Math.floor(Date.now() / 1000) + 60,
  })),
}));

import { eventsRoutes } from "../../src/routes/events.routes.js";
import { sseEventBus } from "../../src/utils/sse-emitter.js";

const org = "11111111-1111-4111-8111-111111111111";

describe("Admin event stream", () => {
  const app = Fastify();
  afterEach(() => app.close());

  it("preserves cross-origin headers, delivers tenant events and unsubscribes on disconnect", async () => {
    await app.register(cors, { origin: "https://dashboard.example" });
    await app.register(eventsRoutes);
    const origin = await app.listen({ host: "127.0.0.1", port: 0 });
    const endpoint = new URL("/admin/events", origin);
    const rejected = await fetch(endpoint, { signal: AbortSignal.timeout(2000) });
    expect(rejected.status).toBe(401);
    await rejected.body?.cancel();

    const response = await fetch(endpoint, {
      headers: { Authorization: "Bearer test-token", Origin: "https://dashboard.example" },
      signal: AbortSignal.timeout(4000),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://dashboard.example");
    expect(response.headers.get("content-type")).toMatch(/^text\/event-stream/);
    const reader = response.body!.getReader();
    try {
      expect(new TextDecoder().decode((await reader.read()).value)).toContain("event: connected");
      sseEventBus.emitOrgEvent(org, "session.checkin", { employeeId: "test" });
      expect(new TextDecoder().decode((await reader.read()).value)).toContain("event: session.checkin");
    } finally {
      await reader.cancel();
    }
    await vi.waitFor(() => expect(sseEventBus.listenerCount(`org:${org}`)).toBe(0));
  });
});
