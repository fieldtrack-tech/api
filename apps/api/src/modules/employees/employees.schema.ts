import { z } from "zod";
import type { Employee } from "../../types/db.js";

export type { Employee };

export const createEmployeeBodySchema = z.object({
  name: z.string().min(1, { message: "name is required" }),
  employee_code: z.string().min(1, { message: "employee_code is required" }),
  user_id: z.string().uuid({ message: "user_id must be a valid UUID" }).optional(),
  phone: z.string().optional(),
});

export type CreateEmployeeBody = z.infer<typeof createEmployeeBodySchema>;
