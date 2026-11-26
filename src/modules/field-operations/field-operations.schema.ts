import { z } from "zod";

export const moneyMinorSchema = z.number().int().min(0).max(100_000_000_000);
export const settingsSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/).refine((code) => {
    if (!Intl.supportedValuesOf("currency").includes(code)) return false;
    return new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits === 2;
  }, "Choose a supported currency with two decimal places (INR, USD, EUR, GBP, AED)").default("INR"),
  timezone: z.string().max(100).refine((value) => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; }
    catch { return false; }
  }, "Use a valid IANA timezone, such as Asia/Kolkata").default("Asia/Kolkata"),
});
export const siteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(500).default(""),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  arrival_radius_m: z.number().int().min(25).max(5000),
  departure_radius_m: z.number().int().max(50000),
  visit_rate_minor: moneyMinorSchema,
  is_active: z.boolean().default(true),
}).refine((site) => site.departure_radius_m > site.arrival_radius_m,
  "Departure distance must be greater than the arrival radius");
export const salarySchema = z.object({
  effective_month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/),
  amount_minor: moneyMinorSchema,
});
const reportDateSchema = z.iso.date().refine((value) => value >= "0001-01-01" && value <= "9998-12-31",
  "Invalid calendar date");
const reportEmployeeId = { employee_id: z.string().uuid().optional() };
const standardReportQuery = {
  period: z.enum(["day", "week", "month"]),
  date: reportDateSchema,
};
const rangeReportQuery = {
  period: z.literal("range"),
  from: reportDateSchema,
  to: reportDateSchema,
};

export const MAX_REPORT_DAYS = 366;
const DAY_MS = 86_400_000;

function validReportRange(query: { period: string; from?: string; to?: string }) {
  if (query.period !== "range") return true;
  const days = (Date.parse(query.to!) - Date.parse(query.from!)) / DAY_MS + 1;
  return days >= 1 && days <= MAX_REPORT_DAYS;
}

const invalidRange = { message: `Select a date range of 1–${MAX_REPORT_DAYS} days.`, path: ["to"] };
export const reportQuerySchema = z.discriminatedUnion("period", [
  z.object({ ...standardReportQuery, ...reportEmployeeId }),
  z.object({ ...rangeReportQuery, ...reportEmployeeId }),
]).refine(validReportRange, invalidRange);
export const employeeReportQuerySchema = z.discriminatedUnion("period", [
  z.object(standardReportQuery),
  z.object(rangeReportQuery),
]).refine(validReportRange, invalidRange);
const paymentComponent = { component: z.enum(["visits", "basic", "both"]).default("both") };
export const paymentPreviewSchema = z.discriminatedUnion("period", [
  z.object({ ...standardReportQuery, ...paymentComponent }),
  z.object({ ...rangeReportQuery, ...paymentComponent }),
]).refine(validReportRange, invalidRange);
const paymentDetails = {
  expected_total_minor: z.number().int().positive(),
  reference: z.string().trim().max(160).optional(),
  request_id: z.string().uuid().optional(),
};
export const recordPaymentSchema = z.discriminatedUnion("period", [
  z.object({ ...standardReportQuery, ...paymentComponent, ...paymentDetails }),
  z.object({ ...rangeReportQuery, ...paymentComponent, ...paymentDetails }),
]).refine(validReportRange, invalidRange);
export type ReportQuery = z.infer<typeof employeeReportQuerySchema>;
export type ReportPeriod = ReportQuery["period"];
export type PaymentComponent = z.infer<typeof paymentPreviewSchema>["component"];
export type PaymentInput = z.infer<typeof recordPaymentSchema>;
export type SiteInput = z.infer<typeof siteSchema>;
export type FieldSettings = z.infer<typeof settingsSchema> & { organization_id: string };
export type FieldSite = SiteInput & { id: string; organization_id: string; created_at: string };
export type BasicPay = { organization_id: string; employee_id: string; effective_month: string; amount_minor: number };
export type SelfieChallenge = { id: string; organization_id: string; employee_id: string; object_path: string;
  created_at: string; expires_at: string; consumed_at: string | null };
export type FieldPayment = {
  id: string;
  employee_id: string;
  from: string;
  to_exclusive: string;
  component: PaymentComponent;
  currency: string;
  basic_pay_minor: number | null;
  visit_pay_minor: number;
  total_pay_minor: number;
  recorded_by: string;
  reference: string | null;
  created_at: string;
};
export type FieldPaymentPreview = Pick<FieldPayment, "employee_id" | "from" | "to_exclusive" | "currency" | "basic_pay_minor" | "visit_pay_minor"> & {
  total_pay_minor: number | null;
  visit_count: number;
  missing_salary_months: string[];
  recordable: boolean;
  reason: string | null;
};
type FieldReportDay = {
  date: string;
  attendance_count: number;
  worked_seconds: number;
  has_open_shift: boolean;
  visit_count: number;
  visit_pay_minor: number;
};
export type FieldReport = {
  period: ReportPeriod;
  from: string;
  to_exclusive: string;
  currency: string;
  timezone: string;
  employees: Array<{
    employee_id: string;
    employee_name: string;
    employee_code: string;
    attendance_days: number;
    attendance_count: number;
    worked_seconds: number;
    has_open_shift: boolean;
    days: FieldReportDay[];
    salary_configured: boolean;
    basic_pay_minor: number | null;
    basic_pay_months: Array<{ month: string; amount_minor: number | null }>;
    visit_count: number;
    visit_pay_minor: number;
    total_pay_minor: number | null;
    visits: Array<{
      id: string; site_id: string; site_name: string; arrived_at: string;
      departed_from_at: string | null; rate_minor: number;
    }>;
    attendance: Array<{
      id: string; checkin_at: string; checkout_at: string | null; start_latitude: number | null;
      start_longitude: number | null; selfie_available: boolean; selfie_verified: boolean; selfie_captured_at: string | null;
    }>;
  }>;
};

type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };
export type FieldOperationTables = {
  field_settings: Table<FieldSettings>;
  field_sites: Table<FieldSite>;
  employee_basic_pay: Table<BasicPay>;
  attendance_selfie_challenges: Table<SelfieChallenge>;
};

/** Monday–Sunday weeks, calendar months and inclusive custom dates. */
export function reportBounds(query: ReportQuery) {
  const from = new Date(query.period === "range" ? query.from : query.date);
  const to = new Date(from);
  if (query.period === "range") {
    to.setTime(Date.parse(query.to) + DAY_MS);
  } else if (query.period === "month") {
    from.setUTCDate(1); to.setUTCDate(1); to.setUTCMonth(to.getUTCMonth() + 1);
  } else if (query.period === "week") {
    from.setUTCDate(from.getUTCDate() - ((from.getUTCDay() + 6) % 7));
    to.setTime(from.getTime()); to.setUTCDate(to.getUTCDate() + 7);
  } else {
    to.setUTCDate(to.getUTCDate() + 1);
  }
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/** CSV cells must not become Excel/Sheets formulas, including employee names. */
export function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[\s]*[=+@-]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
