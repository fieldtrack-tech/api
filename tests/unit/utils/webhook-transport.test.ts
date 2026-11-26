import { EventEmitter } from "node:events";
import type { RequestOptions } from "node:https";
import { Readable } from "node:stream";
import type { LookupAddress } from "node:dns";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lookupWebhookDestination, validateWebhookUrl } from "../../../src/utils/url-validator.js";
import { deliverWebhook } from "../../../src/workers/webhook.worker.js";

const { lookup, request } = vi.hoisted(() => ({
  lookup: vi.fn<(hostname: string, options: object) => Promise<LookupAddress[]>>(),
  request: vi.fn(),
}));
vi.mock("node:dns/promises", () => ({ lookup }));
vi.mock("node:https", () => ({ request }));

const destination = "https://webhooks.example.org:8443/events?version=1";
const payload = '{"example":"£"}';

function stubResponse(statusCode: number, chunks: Buffer[]) {
  const response = Object.assign(Readable.from(chunks), { statusCode });
  const end = vi.fn();
  request.mockImplementation((_url: URL, options: RequestOptions, callback: (body: typeof response) => void) => {
    const outgoing = Object.assign(new EventEmitter(), { end });
    const pinned = options.lookup!;
    pinned("webhooks.example.org", { all: true }, (error) => {
      if (error) outgoing.emit("error", error);
      else callback(response);
    });
    return outgoing;
  });
  return { response, end };
}

describe("webhook transport", () => {
  beforeEach(() => {
    lookup.mockReset().mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    request.mockReset();
  });

  it("keeps the configured origin and supplies the validated address directly to TLS", async () => {
    const { end } = stubResponse(200, [Buffer.from("received")]);
    const result = await deliverWebhook(destination, payload, "signature", "session.checkin", 1, "delivery-id");
    expect(result).toEqual({ status: 200, body: "received" });
    expect(request).toHaveBeenCalledOnce();
    const [origin, options] = request.mock.calls[0] as [URL, RequestOptions];
    expect(origin.href).toBe(destination);
    expect(options).toMatchObject({ rejectUnauthorized: true, agent: false,
      headers: { "Content-Length": Buffer.byteLength(payload), "X-FieldTrack-Delivery-Id": "delivery-id" } });
    expect(options.lookup).toBe(lookupWebhookDestination);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(lookup).toHaveBeenCalledExactlyOnceWith("webhooks.example.org", { all: true, order: "ipv4first" });
    expect(end).toHaveBeenCalledExactlyOnceWith(payload);
  });

  it("returns the selected public IPv6 answer in the format requested by the socket", async () => {
    const address = { address: "2606:4700::1111", family: 6 };
    lookup.mockResolvedValue([address, { address: "2606:4700::1001", family: 6 }]);
    const pinned = await new Promise((resolve, reject) => {
      lookupWebhookDestination("webhooks.example.org", { all: true }, (error, value) => {
        if (error) reject(error);
        else resolve(value);
      });
    });
    expect(pinned).toEqual([address]);
  });

  it("rejects non-public destinations before opening a connection", async () => {
    expect(() => validateWebhookUrl("https://[fd00::1]/")).toThrow(/private.*not permitted/i);
    expect(() => validateWebhookUrl("https://[::1]/")).toThrow(/private.*not permitted/i);
    expect(() => validateWebhookUrl("https://[2606:4700::1111]/")).not.toThrow();
    lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }, { address: "10.1.0.1", family: 4 }]);
    await expect(new Promise((resolve, reject) => {
      lookupWebhookDestination("webhooks.example.org", { all: true }, (error, value) => {
        if (error) reject(error);
        else resolve(value);
      });
    })).rejects.toThrow(/must resolve only to public addresses/i);
  });

  it("returns redirect status without making another request", async () => {
    const { response } = stubResponse(302, []);
    const result = await deliverWebhook(destination, payload, "signature", "session.checkin", 1, "delivery-id");
    expect(result).toEqual({ status: 302, body: "" });
    expect(request).toHaveBeenCalledOnce();
    expect(response.destroyed).toBe(true);
  });

  it("caps the captured response at 4096 bytes and closes the stream", async () => {
    const { response } = stubResponse(422, [Buffer.alloc(8192, "a"), Buffer.alloc(8192, "b")]);
    const result = await deliverWebhook(destination, payload, "signature", "session.checkin", 1, "delivery-id");
    expect(result).toEqual({ status: 422, body: "a".repeat(4096) });
    expect(response.destroyed).toBe(true);
  });
});
