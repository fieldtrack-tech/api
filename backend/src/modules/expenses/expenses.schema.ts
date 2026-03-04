import { z } from "zod";

// ─── Database Row Type ────────────────────────────────────────────────────────

export const EXPENSE_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export interface Expense {
  id: string;
  organization_id: string;
  user_id: string;
  amount: number;
  description: string;
  status: ExpenseStatus;
  receipt_url: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Request Schemas ──────────────────────────────────────────────────────────

/**
 * Body schema for POST /expenses.
 * Enforces positive amount and minimum description length.
 */
export const createExpenseBodySchema = z.object({
  amount: z
    .number({ error: "amount must be a number" })
    .positive({ message: "amount must be greater than 0" }),
  description: z
    .string()
    .min(3, { message: "description must be at least 3 characters" })
    .max(500, { message: "description must not exceed 500 characters" }),
  receipt_url: z
    .string()
    .url({ message: "receipt_url must be a valid URL" })
    .optional(),
});

export type CreateExpenseBody = z.infer<typeof createExpenseBodySchema>;

/**
 * Body schema for PATCH /admin/expenses/:id.
 * ADMIN may only transition to APPROVED or REJECTED (not back to PENDING).
 */
export const updateExpenseStatusBodySchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"], {
    error: "status must be APPROVED or REJECTED",
  }),
});

export type UpdateExpenseStatusBody = z.infer<
  typeof updateExpenseStatusBodySchema
>;

/**
 * Shared pagination schema for expense list endpoints.
 */
export const expensePaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ExpensePaginationQuery = z.infer<typeof expensePaginationSchema>;

// ─── Response Types ───────────────────────────────────────────────────────────

export interface ExpenseResponse {
  success: true;
  data: Expense;
}

export interface ExpenseListResponse {
  success: true;
  data: Expense[];
}
