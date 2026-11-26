import type { FastifyRequest } from "fastify";
import { supabaseServiceClient as db } from "../../config/supabase.js";
import { orgTable } from "../../db/query.js";
import { BadRequestError, NotFoundError } from "../../utils/errors.js";
import { reportBounds, type FieldSettings, type FieldSite, type SiteInput, type FieldReport, type BasicPay,
  type FieldPayment, type FieldPaymentPreview, type PaymentComponent, type PaymentInput, type ReportPeriod,
  type ReportQuery } from "./field-operations.schema.js";

export function checkDbError(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === "P0002") throw new NotFoundError(error.message);
  if (["P0001", "23514", "22007", "22023"].includes(error.code ?? "")) throw new BadRequestError(error.message);
  throw new Error(`Field operations database error: ${error.message}`);
}

export const fieldRepository = {
  async settings(request: FastifyRequest): Promise<FieldSettings | null> {
    const { data, error } = await orgTable(request, "field_settings").select().maybeSingle();
    checkDbError(error); return data;
  },
  async createSettings(request: FastifyRequest, settings: Omit<FieldSettings, "organization_id">) {
    // Settings are intentionally immutable: currency/timezone changes would
    // reinterpret historical money and reporting boundaries.
    const { error } = await db.from("field_settings").insert({ ...settings, organization_id: request.organizationId });
    if (error?.code === "23505") throw new BadRequestError("Company settings are already configured and cannot be reinterpreted.");
    checkDbError(error); return this.settings(request);
  },
  async sites(request: FastifyRequest): Promise<FieldSite[]> {
    // Do not silently truncate larger organizations at Supabase's row limit.
    const rows: FieldSite[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await orgTable(request, "field_sites").select().order("id").range(offset, offset + 499);
      checkDbError(error); rows.push(...(data ?? []));
      if ((data?.length ?? 0) < 500) break;
    }
    return rows;
  },
  async saveSite(request: FastifyRequest, site: SiteInput, id?: string): Promise<FieldSite> {
    if (!await this.settings(request)) throw new BadRequestError("Configure company settings first.");
    const query = id
      ? orgTable(request, "field_sites").update(site).eq("id", id)
      : db.from("field_sites").insert({ ...site, organization_id: request.organizationId });
    const { data, error } = await query.select().maybeSingle();
    checkDbError(error); if (!data) throw new NotFoundError("Location not found"); return data;
  },
  async salaries(request: FastifyRequest): Promise<BasicPay[]> {
    const rows: BasicPay[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await orgTable(request, "employee_basic_pay").select()
        .order("employee_id").order("effective_month", { ascending: false }).range(offset, offset + 499);
      checkDbError(error); rows.push(...(data ?? [])); if ((data?.length ?? 0) < 500) break;
    }
    return rows;
  },
  async setSalary(request: FastifyRequest, employeeId: string, month: string, amount: number) {
    const { error } = await db.rpc("set_employee_basic_pay", {
      p_org: request.organizationId, p_employee: employeeId, p_month: month, p_amount: amount,
    });
    checkDbError(error);
  },
  async report(request: FastifyRequest, from: string, to: string, period: ReportPeriod, employeeId?: string): Promise<FieldReport> {
    const { data, error } = await db.rpc("field_report_cycle", {
      p_org: request.organizationId, p_from: from, p_to: to, p_period: period, p_employee: employeeId ?? null,
    });
    checkDbError(error); return data as FieldReport;
  },
  async payments(request: FastifyRequest, employeeId: string): Promise<FieldPayment[]> {
    const rows: FieldPayment[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db.from("field_payments")
        .select("id,employee_id,from:period_from,to_exclusive,component,currency,basic_pay_minor,visit_pay_minor,total_pay_minor,recorded_by,reference,created_at")
        .eq("organization_id", request.organizationId).eq("employee_id", employeeId)
        .order("created_at", { ascending: false }).order("id").range(offset, offset + 499);
      checkDbError(error);
      rows.push(...(data ?? []) as FieldPayment[]);
      if ((data?.length ?? 0) < 500) return rows;
    }
  },
  async previewPayment(request: FastifyRequest, employeeId: string, query: ReportQuery & { component: PaymentComponent }): Promise<FieldPaymentPreview> {
    const range = reportBounds(query);
    const { data, error } = await db.rpc("preview_field_payment", {
      p_org: request.organizationId, p_employee: employeeId, p_from: range.from,
      p_to: range.to, p_period: query.period, p_component: query.component,
    });
    checkDbError(error);
    return data as FieldPaymentPreview;
  },
  async recordPayment(request: FastifyRequest, employeeId: string, body: PaymentInput): Promise<FieldPayment> {
    const range = reportBounds(body);
    const { data, error } = await db.rpc("record_field_payment", {
      p_org: request.organizationId, p_employee: employeeId, p_from: range.from,
      p_to: range.to, p_period: body.period, p_component: body.component,
      p_actor: request.user.sub, p_expected_total: body.expected_total_minor,
      p_reference: body.reference ?? null, p_request_id: body.request_id ?? null,
    });
    checkDbError(error);
    return data as FieldPayment;
  },
};
