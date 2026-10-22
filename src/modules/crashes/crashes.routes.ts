import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { supabaseServiceClient as supabase } from "../../config/supabase.js";
import { authenticate } from "../../middleware/auth.js";
import { handleError, ok } from "../../utils/response.js";

const crashReportBodySchema = z.object({
  file_name: z.string().min(1).max(255),
  platform: z.literal("android"),
  raw_report: z.string().min(1).max(200_000),
});

export async function crashRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/crashes",
    {
      schema: {
        tags: ["crashes"],
        summary: "Ingest a mobile crash report",
        body: crashReportBodySchema,
        response: {
          201: z.object({
            success: z.literal(true),
            data: z.object({ id: z.string().uuid() }),
          }),
        },
      },
      preValidation: [authenticate],
    },
    async (request, reply) => {
      try {
        const body = crashReportBodySchema.parse(request.body);
        const { data, error } = await supabase
          .from("mobile_crash_reports")
          .insert({
            organization_id: request.organizationId,
            user_id: request.user.sub,
            role: request.user.role,
            platform: body.platform,
            file_name: body.file_name,
            raw_report: body.raw_report,
          })
          .select("id")
          .single();

        if (error) {
          throw new Error(`Crash report insert failed: ${error.message}`);
        }

        reply.status(201).send(ok({ id: String((data as { id: string }).id) }));
      } catch (error) {
        handleError(error, request, reply, "Unexpected error ingesting crash report");
      }
    },
  );
}
