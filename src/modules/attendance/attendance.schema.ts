import { z } from "zod";
import type { AttendanceSession } from "../../types/db.js";

// ─── Database Row Type ───────────────────────────────────

export type { AttendanceSession };

export const cameraCheckInSchema = z.object({
    challenge_id: z.string().uuid(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(100),
    captured_at: z.string().datetime(),
    location_at: z.string().datetime(),
});
export type CameraCheckIn = z.infer<typeof cameraCheckInSchema>;

// ─── Request Schemas ─────────────────────────────────────

export const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;

export const mySessionsQuerySchema = paginationSchema.extend({
    status: z.enum(["all", "active", "recent", "inactive"]).default("all"),
});

export type MySessionsQuery = z.infer<typeof mySessionsQuerySchema>;

export const orgSessionsQuerySchema = paginationSchema.extend({
    status: z.enum(["all", "active", "recent", "inactive"]).default("all"),
    employee_id: z.string().uuid().optional(),
});

export type OrgSessionsQuery = z.infer<typeof orgSessionsQuerySchema>;

// ─── Response Types ──────────────────────────────────────

export interface AttendanceResponse {
    success: true;
    data: AttendanceSession;
}

export interface AttendanceListResponse {
    success: true;
    data: AttendanceSession[];
}
