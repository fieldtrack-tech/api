import type { FastifyRequest, FastifyReply } from "fastify";
import { employeesRepository } from "./employees.repository.js";
import { createEmployeeBodySchema } from "./employees.schema.js";
import { ok, handleError } from "../../utils/response.js";

export const employeesController = {
  /**
   * POST /admin/employees
   * Create a new employee. Requires employee_code in the request body.
   */
  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const body = createEmployeeBodySchema.parse(request.body);
      const employee = await employeesRepository.createEmployee(request, body);

      request.log.info(
        {
          event: "employee_created",
          employeeId: employee.id,
          employeeCode: employee.employee_code,
          organizationId: request.organizationId,
          createdBy: request.user.sub,
        },
        "Employee created",
      );

      reply.status(201).send(ok(employee));
    } catch (error) {
      handleError(error, request, reply, "Unexpected error creating employee");
    }
  },
};
