import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyRequest } from "fastify";
import { gpsSelfieFixture } from "../setup/selfie-fixture.js";
const mocks = vi.hoisted(() => {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  const storage = { download: vi.fn(), createSignedUrl: vi.fn() };
  return { query, storage, from: vi.fn() };
});
vi.mock("../../src/config/supabase.js", () => ({ supabaseServiceClient: {
  from: mocks.from, storage: { from: vi.fn(() => mocks.storage) },
} }));
import { attendanceSelfieService } from "../../src/modules/attendance/attendance-selfie.service.js";

const orgId = "11111111-1111-4111-8111-111111111111";
const employeeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const challengeId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const request = (role = "EMPLOYEE") => ({ organizationId: orgId, employeeId: role === "EMPLOYEE" ? employeeId : undefined,
  user: { role }, log: { info: vi.fn() } }) as unknown as FastifyRequest;
const camera = () => ({ challenge_id: challengeId, latitude: 19, longitude: 73, accuracy: 10,
  captured_at: new Date().toISOString(), location_at: new Date().toISOString() });
const challenge = () => ({ id: challengeId, organization_id: orgId, employee_id: employeeId,
  object_path: `${orgId}/${employeeId}/${challengeId}.jpg`, consumed_at: null,
  created_at: new Date(Date.now() - 1000).toISOString(), expires_at: new Date(Date.now() + 60000).toISOString() });
beforeEach(() => {
  vi.clearAllMocks(); mocks.from.mockReturnValue(mocks.query);
  mocks.query.select.mockReturnValue(mocks.query); mocks.query.eq.mockReturnValue(mocks.query);
  mocks.query.maybeSingle.mockResolvedValue({ data: challenge(), error: null });
  const bytes = gpsSelfieFixture();
  mocks.storage.download.mockResolvedValue({ data: new Blob([bytes], { type: "image/jpeg" }), error: null });
});
describe("private one-use attendance selfies", () => {
  it("scopes challenge lookup to both organization and employee before downloading", async () => {
    await attendanceSelfieService.validate(request(), camera());
    expect(mocks.query.eq).toHaveBeenCalledWith("organization_id", orgId);
    expect(mocks.query.eq).toHaveBeenCalledWith("employee_id", employeeId);
    expect(mocks.storage.download).toHaveBeenCalledWith(challenge().object_path);
  });
  it("rejects missing/foreign challenge before touching storage", async () => {
    mocks.query.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(attendanceSelfieService.validate(request(), camera())).rejects.toThrow(/expired/);
    expect(mocks.storage.download).not.toHaveBeenCalled();
  });
  it.each(["consumed", "expired"])("rejects a %s challenge", async (state) => {
    mocks.query.maybeSingle.mockResolvedValue({ data: { ...challenge(),
      ...(state === "consumed" ? { consumed_at: new Date().toISOString() } : { expires_at: new Date(Date.now() - 1000).toISOString() }) }, error: null });
    await expect(attendanceSelfieService.validate(request(), camera())).rejects.toThrow(/expired|used/);
    expect(mocks.storage.download).not.toHaveBeenCalled();
  });
  it("rejects a photo taken before the one-use challenge was issued", async () => {
    const body = { ...camera(), captured_at: new Date(Date.now() - 60000).toISOString() };
    await expect(attendanceSelfieService.validate(request(), body)).rejects.toThrow(/after starting/);
  });
  it("rejects missing uploads and non-JPEG content", async () => {
    mocks.storage.download.mockResolvedValueOnce({ data: null, error: { message: "missing" } });
    await expect(attendanceSelfieService.validate(request(), camera())).rejects.toThrow(/Upload/);
    mocks.storage.download.mockResolvedValueOnce({ data: new Blob([new Uint8Array(128)]), error: null });
    await expect(attendanceSelfieService.validate(request(), camera())).rejects.toThrow(/JPEG/);
  });
  it("rejects a selfie without embedded GPS", async () => {
    const bytes = new Uint8Array(128); bytes.set([0xff, 0xd8, 0xff, 0xd9]);
    mocks.storage.download.mockResolvedValueOnce({ data: new Blob([bytes]), error: null });
    await expect(attendanceSelfieService.validate(request(), camera())).rejects.toThrow(/embedded GPS/);
  });
  it("rejects embedded coordinates that differ from the attendance location", async () => {
    mocks.storage.download.mockResolvedValueOnce({ data: new Blob([gpsSelfieFixture(19, 74)]), error: null });
    await expect(attendanceSelfieService.validate(request(), camera())).rejects.toThrow(/does not match/);
  });
  it("rejects matching GPS metadata without an image frame", async () => {
    const metadataOnly = gpsSelfieFixture().slice(0, 142);
    metadataOnly.set([0xff, 0xd9], 140);
    mocks.storage.download.mockResolvedValueOnce({ data: new Blob([metadataOnly]), error: null });
    await expect(attendanceSelfieService.validate(request(), camera())).rejects.toThrow(/complete JPEG/);
  });
  it("only issues a short-lived URL for an employee's own session", async () => {
    mocks.query.maybeSingle.mockResolvedValue({ data: { selfie_path: "private.jpg" }, error: null });
    mocks.storage.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://storage.invalid/private" }, error: null });
    await attendanceSelfieService.view(request(), challengeId);
    expect(mocks.query.eq).toHaveBeenCalledWith("organization_id", orgId);
    expect(mocks.query.eq).toHaveBeenCalledWith("employee_id", employeeId);
    expect(mocks.storage.createSignedUrl).toHaveBeenCalledWith("private.jpg", 60);
  });
  it("allows admins to view an organization session without an employee identity", async () => {
    mocks.query.maybeSingle.mockResolvedValue({ data: { selfie_path: "private.jpg" }, error: null });
    mocks.storage.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://storage.invalid/private" }, error: null });
    await attendanceSelfieService.view(request("ADMIN"), challengeId);
    expect(mocks.query.eq).toHaveBeenCalledWith("organization_id", orgId);
    expect(mocks.query.eq).not.toHaveBeenCalledWith("employee_id", expect.anything());
  });
});
