import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { authenticate, requireJwtAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { requireEmployeeContext } from "../../utils/errors.js";
import { handleError, ok } from "../../utils/response.js";
import { fieldRepository } from "./field-operations.repository.js";
import { settingsSchema, siteSchema, salarySchema, reportQuerySchema, employeeReportQuerySchema,
  paymentPreviewSchema, recordPaymentSchema, reportBounds, csvCell } from "./field-operations.schema.js";

const employeeParams = z.object({ employeeId: z.string().uuid() });

export async function fieldOperationsRoutes(app: FastifyInstance) {
  const admin = [authenticate, requireRole("ADMIN")];
  const wrap = (fn: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      try { return await fn(request, reply); }
      catch (error) { handleError(error, request, reply, "Field operations request failed"); }
    };
  app.get("/field/settings", { preValidation: [authenticate] }, wrap(async (r) => ok(await fieldRepository.settings(r))));
  app.post("/admin/field/settings", { preValidation: admin, schema: { body: settingsSchema } },
    wrap(async (r, reply) => reply.code(201).send(ok(await fieldRepository.createSettings(r, settingsSchema.parse(r.body))))));
  app.get("/field/sites", { preValidation: [authenticate] }, wrap(async (r) => ok(await fieldRepository.sites(r))));
  app.post("/admin/field/sites", { preValidation: admin, schema: { body: siteSchema } },
    wrap(async (r, reply) => reply.code(201).send(ok(await fieldRepository.saveSite(r, siteSchema.parse(r.body))))));
  app.patch("/admin/field/sites/:id", { preValidation: admin, schema: { body: siteSchema, params: z.object({ id: z.string().uuid() }) } },
    wrap(async (r) => ok(await fieldRepository.saveSite(r, siteSchema.parse(r.body), (r.params as { id: string }).id))));
  app.get("/admin/field/basic-pay", { preValidation: admin }, wrap(async (r) => ok(await fieldRepository.salaries(r))));
  app.post("/admin/field/basic-pay/:employeeId", {
    preValidation: admin, schema: { body: salarySchema, params: employeeParams },
  }, wrap(async (r) => {
    const body = salarySchema.parse(r.body);
    await fieldRepository.setSalary(r, (r.params as { employeeId: string }).employeeId, body.effective_month, body.amount_minor);
    return ok({ saved: true });
  }));
  app.get("/admin/field/reports", { preValidation: admin, schema: { querystring: reportQuerySchema } }, wrap(async (r) => {
    const q = reportQuerySchema.parse(r.query);
    const range = reportBounds(q);
    return ok(await fieldRepository.report(r, range.from, range.to, q.period, q.employee_id));
  }));
  app.get("/field/my-report", { preValidation: [authenticate, requireRole("EMPLOYEE")], schema: { querystring: employeeReportQuerySchema } },
    wrap(async (r) => {
      requireEmployeeContext(r);
      const q = employeeReportQuerySchema.parse(r.query);
      const range = reportBounds(q);
      return ok(await fieldRepository.report(r, range.from, range.to, q.period, r.employeeId));
    }));
  app.get("/admin/field/reports/export", { preValidation: admin, schema: { querystring: reportQuerySchema } }, wrap(async (r) => {
    const q = reportQuerySchema.parse(r.query);
    const range = reportBounds(q);
    const report = await fieldRepository.report(r, range.from, range.to, q.period, q.employee_id);
    const header = ["Employee code", "Employee", "From", "To (exclusive)", "Currency", "Attendance days", "Check-ins",
      "Worked seconds", "Open shift", "Visits", "Basic pay for full months", "Visit pay", "Total pay"];
    const lines = [header.map(csvCell).join(","), ...report.employees.map((employee) =>
      [employee.employee_code, employee.employee_name, report.from, report.to_exclusive, report.currency, employee.attendance_days,
        employee.attendance_count, employee.worked_seconds, employee.has_open_shift ? "Yes" : "No", employee.visit_count,
        employee.basic_pay_minor == null ? "" : employee.basic_pay_minor / 100, employee.visit_pay_minor / 100,
        employee.total_pay_minor == null ? "" : employee.total_pay_minor / 100].map(csvCell).join(","))];
    // JSON envelope allows the shared authenticated client to handle token refresh.
    return ok({ filename: `field-${q.period}-${range.from}.csv`, csv: lines.join("\r\n") });
  }));
  app.get("/admin/field/payments/:employeeId", { preValidation: admin, schema: { params: employeeParams } },
    wrap(async (r) => ok(await fieldRepository.payments(r, employeeParams.parse(r.params).employeeId))));
  app.get("/admin/field/payments/:employeeId/preview", {
    preValidation: admin, schema: { params: employeeParams, querystring: paymentPreviewSchema },
  }, wrap(async (r) => ok(await fieldRepository.previewPayment(r, employeeParams.parse(r.params).employeeId,
    paymentPreviewSchema.parse(r.query)))));
  app.post("/admin/field/payments/:employeeId", {
    preValidation: [...admin, requireJwtAuth], schema: { params: employeeParams, body: recordPaymentSchema },
  }, wrap(async (r, reply) => {
    const payment = await fieldRepository.recordPayment(r, employeeParams.parse(r.params).employeeId, recordPaymentSchema.parse(r.body));
    return reply.code(201).send(ok(payment));
  }));
}
