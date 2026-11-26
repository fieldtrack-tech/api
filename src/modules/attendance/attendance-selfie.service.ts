import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import sharp from "sharp";
import { supabaseServiceClient as db } from "../../config/supabase.js";
import { orgTable } from "../../db/query.js";
import { BadRequestError, ForbiddenError, NotFoundError, requireEmployeeContext } from "../../utils/errors.js";
import { checkDbError } from "../field-operations/field-operations.repository.js";
import type { SelfieChallenge } from "../field-operations/field-operations.schema.js";
import type { CameraCheckIn } from "./attendance.schema.js";
import { selfieGpsLocation } from "./attendance-selfie.metadata.js";

const BUCKET = "attendance-selfies";
const MAX_SELFIE_PIXELS = 4_000_000;

async function validateJpeg(bytes: Uint8Array) {
  try {
    const image = sharp(bytes, { failOn: "warning", limitInputPixels: MAX_SELFIE_PIXELS });
    const { format, width, height } = await image.metadata();
    if (format !== "jpeg" || !width || !height || width > 2048 || height > 2048) {
      throw new Error("Unsupported selfie image dimensions or format");
    }
    // Decode the original frame so a readable EXIF header cannot pass alone.
    await image.raw().toBuffer();
  } catch {
    throw new BadRequestError("Selfie must be a valid, complete JPEG image.");
  }
}
export function validateCameraTimes(body: CameraCheckIn, now = Date.now()) {
  for (const time of [body.captured_at, body.location_at]) {
    const age = now - new Date(time).getTime();
    if (!Number.isFinite(age) || age > 120_000 || age < -30_000)
      throw new BadRequestError("Photo and GPS must be fresh. Take a new selfie and GPS fix.");
  }
}
export const attendanceSelfieService = {
  async challenge(request: FastifyRequest) {
    requireEmployeeContext(request);
    const employee = await orgTable(request, "employees").select("id")
      .eq("id", request.employeeId).eq("is_active", true).maybeSingle();
    checkDbError(employee.error);
    if (!employee.data) throw new ForbiddenError("Employee is inactive.", "EMPLOYEE_INACTIVE");
    const id = randomUUID();
    const path = `${request.organizationId}/${request.employeeId}/${id}.jpg`;
    const { data, error } = await db.from("attendance_selfie_challenges").insert({
      id, organization_id: request.organizationId, employee_id: request.employeeId, object_path: path,
    }).select().single();
    checkDbError(error);
    const upload = await db.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
    if (upload.error) throw new Error(`Failed to prepare camera upload: ${upload.error.message}`);
    return { challenge_id: id, upload_url: upload.data.signedUrl, expires_at: (data as SelfieChallenge).expires_at };
  },
  async validate(request: FastifyRequest, body: CameraCheckIn) {
    requireEmployeeContext(request); validateCameraTimes(body);
    const { data, error } = await orgTable(request, "attendance_selfie_challenges").select()
      .eq("id", body.challenge_id).eq("employee_id", request.employeeId).maybeSingle();
    checkDbError(error);
    const challenge = data as SelfieChallenge | null;
    if (!challenge || challenge.consumed_at || new Date(challenge.expires_at).getTime() < Date.now())
      throw new BadRequestError("Selfie challenge expired or already used. Take a new photo.");
    if (new Date(body.captured_at).getTime() < new Date(challenge.created_at).getTime() - 30_000)
      throw new BadRequestError("Photo must be taken after starting camera check-in.");
    // Never accept an arbitrary URL or another employee's file. Require an
    // actual upload to this one-use, non-overwritable, server-selected path.
    const file = await db.storage.from(BUCKET).download(challenge.object_path);
    if (file.error || !file.data) throw new BadRequestError("Upload the camera selfie before checking in.");
    if (file.data.size < 100 || file.data.size > 5 * 1024 * 1024)
      throw new BadRequestError("Selfie must be a JPEG image smaller than 5 MB.");
    const bytes = new Uint8Array(await file.data.arrayBuffer());
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff)
      throw new BadRequestError("Selfie must be a JPEG image.");
    let embeddedGps: ReturnType<typeof selfieGpsLocation>;
    try { embeddedGps = selfieGpsLocation(bytes); }
    catch { throw new BadRequestError("Invalid selfie GPS metadata. Take a new photo with the updated app camera."); }
    if (!embeddedGps) throw new BadRequestError("Selfie must have embedded GPS. Take a new photo with the updated app camera.");
    if (Math.abs(embeddedGps.latitude - body.latitude) > 0.00001 || Math.abs(embeddedGps.longitude - body.longitude) > 0.00001)
      throw new BadRequestError("Selfie GPS does not match the attendance location. Take a new photo.");
    await validateJpeg(bytes);
  },
  async view(request: FastifyRequest, sessionId: string) {
    let query = orgTable(request, "attendance_sessions").select("selfie_path").eq("id", sessionId);
    if (request.user.role !== "ADMIN") {
      requireEmployeeContext(request); query = query.eq("employee_id", request.employeeId);
    }
    const { data, error } = await query.maybeSingle(); checkDbError(error);
    if (!data?.selfie_path) throw new NotFoundError("No selfie available for this session.");
    const signed = await db.storage.from(BUCKET).createSignedUrl(data.selfie_path as string, 60);
    if (signed.error) throw new Error(`Cannot view selfie: ${signed.error.message}`);
    return { url: signed.data.signedUrl, expires_in: 60 };
  },
};
