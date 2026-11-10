jest.mock("../../src/config/prisma", () => ({
  staffAssignment: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  employee: {
    findUnique: jest.fn()
  },
  group: {
    findUnique: jest.fn()
  },
  $transaction: jest.fn()
}));

jest.mock("../../src/modules/audit/audit.service", () => ({
  createLog: jest.fn()
}));

jest.mock("../../src/middleware/auth.middleware", () => jest.fn());

jest.mock("../../src/middleware/rbac.middleware", () =>
  jest.fn((...roles) => {
    const middleware = jest.fn();
    middleware.allowedRoles = roles;
    return middleware;
  })
);

jest.mock("../../src/middleware/validate.middleware", () =>
  jest.fn((schema, property = "body") => {
    const middleware = jest.fn();
    middleware.validationProperty = property;
    middleware.schema = schema;
    return middleware;
  })
);

const prisma = require("../../src/config/prisma");
const auditService = require("../../src/modules/audit/audit.service");
const HTTP_STATUS = require("../../src/utils/http-status");

const service = require("../../src/modules/staff-assignments/staff-assignments.service");
const controller = require("../../src/modules/staff-assignments/staff-assignments.controller");
const routes = require("../../src/modules/staff-assignments/staff-assignments.routes");
const validation = require("../../src/modules/staff-assignments/staff-assignments.validation");

const requireAuth = require("../../src/middleware/auth.middleware");
const authorizeRoles = require("../../src/middleware/rbac.middleware");
const validate = require("../../src/middleware/validate.middleware");

const ASSIGNMENT_ID = "507f1f77bcf86cd799439011";
const EMPLOYEE_ID = "507f1f77bcf86cd799439012";
const GROUP_ID = "507f1f77bcf86cd799439013";
const USER_ID = "507f1f77bcf86cd799439014";
const OTHER_USER_ID = "507f1f77bcf86cd799439015";

const admin = {
  id: USER_ID,
  role: "ADMIN"
};

const manager = {
  id: USER_ID,
  role: "MANAGER"
};

const teacher = {
  id: USER_ID,
  role: "TEACHER"
};

const assignment = {
  id: ASSIGNMENT_ID,
  employeeId: EMPLOYEE_ID,
  groupId: GROUP_ID,
  role: "TEACHER",
  startDate: new Date("2026-01-01T00:00:00.000Z"),
  endDate: null,
  employee: {
    id: EMPLOYEE_ID,
    userId: USER_ID,
    role: "TEACHER",
    status: "ACTIVE"
  },
  group: {
    id: GROUP_ID,
    status: "ACTIVE"
  }
};

const employee = {
  id: EMPLOYEE_ID,
  userId: USER_ID,
  role: "TEACHER",
  status: "ACTIVE"
};

const group = {
  id: GROUP_ID,
  status: "ACTIVE"
};

const createData = {
  employeeId: EMPLOYEE_ID,
  groupId: GROUP_ID,
  role: "TEACHER"
};

function expectAppError(promise, status, code) {
  return expect(promise).rejects.toMatchObject({
    statusCode: status,
    code
  });
}

function setupTransaction() {
  prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
}

function setupDefaults() {
  setupTransaction();

  prisma.staffAssignment.findMany.mockResolvedValue([assignment]);
  prisma.staffAssignment.findUnique.mockResolvedValue(assignment);
  prisma.staffAssignment.findFirst.mockResolvedValue(null);
  prisma.staffAssignment.create.mockResolvedValue(assignment);
  prisma.staffAssignment.update.mockResolvedValue({
    ...assignment,
    endDate: new Date("2026-02-01T00:00:00.000Z")
  });

  prisma.employee.findUnique.mockResolvedValue(employee);
  prisma.group.findUnique.mockResolvedValue(group);

  auditService.createLog.mockResolvedValue({});
}

function createResponse() {
  return {
    locals: {
      validated: {
        body: createData,
        params: {
          id: ASSIGNMENT_ID,
          groupId: GROUP_ID,
          employeeId: EMPLOYEE_ID
        }
      }
    },
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  setupDefaults();
});

describe("Staff assignments validation", () => {
  test("accepts valid assignment data", () => {
    const result = validation.createAssignmentSchema.validate(createData);

    expect(result.error).toBeUndefined();
  });

  test("rejects invalid employee id", () => {
    const result = validation.createAssignmentSchema.validate({
      ...createData,
      employeeId: "invalid"
    });

    expect(result.error).toBeDefined();
  });

  test("rejects invalid group id", () => {
    const result = validation.createAssignmentSchema.validate({
      ...createData,
      groupId: "invalid"
    });

    expect(result.error).toBeDefined();
  });

  test("rejects unsupported role", () => {
    const result = validation.createAssignmentSchema.validate({
      ...createData,
      role: "ADMIN"
    });

    expect(result.error).toBeDefined();
  });

  test("requires all assignment fields", () => {
    const result = validation.createAssignmentSchema.validate({});

    expect(result.error).toBeDefined();
  });

  test("accepts valid assignment id params", () => {
    const result = validation.idParamsSchema.validate({
      id: ASSIGNMENT_ID
    });

    expect(result.error).toBeUndefined();
  });

  test("rejects invalid assignment id params", () => {
    const result = validation.idParamsSchema.validate({
      id: "invalid"
    });

    expect(result.error).toBeDefined();
  });

  test("accepts valid group id params", () => {
    const result = validation.groupParamsSchema.validate({
      groupId: GROUP_ID
    });

    expect(result.error).toBeUndefined();
  });

  test("rejects invalid group id params", () => {
    const result = validation.groupParamsSchema.validate({
      groupId: "invalid"
    });

    expect(result.error).toBeDefined();
  });

  test("accepts valid employee id params", () => {
    const result = validation.employeeParamsSchema.validate({
      employeeId: EMPLOYEE_ID
    });

    expect(result.error).toBeUndefined();
  });

  test("rejects invalid employee id params", () => {
    const result = validation.employeeParamsSchema.validate({
      employeeId: "invalid"
    });

    expect(result.error).toBeDefined();
  });
});

describe("Staff assignments service", () => {
  describe("getAll", () => {
    test("returns all assignments for management roles", async () => {
      const result = await service.getAll(admin);

      expect(result).toEqual([assignment]);

      expect(prisma.staffAssignment.findMany).toHaveBeenCalledWith({
        where: {},
        include: {
          employee: true,
          group: true
        },
        orderBy: {
          startDate: "desc"
        }
      });
    });

    test("returns only own assignments for employee roles", async () => {
      await service.getAll(teacher);

      expect(prisma.staffAssignment.findMany).toHaveBeenCalledWith({
        where: {
          employee: {
            userId: USER_ID
          }
        },
        include: {
          employee: true,
          group: true
        },
        orderBy: {
          startDate: "desc"
        }
      });
    });

    test.each(["EDUCATOR", "ASSISTANT"])(
      "allows %s to read assignments",
      async (role) => {
        await expect(
          service.getAll({
            id: USER_ID,
            role
          })
        ).resolves.toEqual([assignment]);
      }
    );

    test("rejects missing user", async () => {
      await expectAppError(
        service.getAll(null),
        HTTP_STATUS.UNAUTHORIZED,
        "UNAUTHORIZED"
      );
    });

    test("rejects unsupported role", async () => {
      await expectAppError(
        service.getAll({
          id: USER_ID,
          role: "STUDENT"
        }),
        HTTP_STATUS.FORBIDDEN,
        "FORBIDDEN"
      );
    });
  });

  describe("create", () => {
    test("creates assignment and writes audit log", async () => {
      const result = await service.create(createData, admin);

      expect(result).toEqual(assignment);

      expect(prisma.employee.findUnique).toHaveBeenCalledWith({
        where: {
          id: EMPLOYEE_ID
        }
      });

      expect(prisma.group.findUnique).toHaveBeenCalledWith({
        where: {
          id: GROUP_ID
        }
      });

      expect(prisma.staffAssignment.create).toHaveBeenCalledWith({
        data: {
          employeeId: EMPLOYEE_ID,
          groupId: GROUP_ID,
          role: "TEACHER",
          startDate: expect.any(Date)
        },
        include: {
          employee: true,
          group: true
        }
      });

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: USER_ID,
          action: "CREATE",
          entityType: "StaffAssignment",
          entityId: ASSIGNMENT_ID,
          after: assignment
        }),
        prisma
      );
    });

    test("allows manager to create assignment", async () => {
      await expect(
        service.create(createData, manager)
      ).resolves.toEqual(assignment);
    });

    test.each(["TEACHER", "EDUCATOR", "ASSISTANT"])(
      "creates assignment for role %s when employee role matches",
      async (role) => {
        prisma.employee.findUnique.mockResolvedValue({
          ...employee,
          role
        });

        prisma.staffAssignment.create.mockResolvedValue({
          ...assignment,
          role
        });

        await expect(
          service.create(
            {
              ...createData,
              role
            },
            admin
          )
        ).resolves.toMatchObject({
          role
        });
      }
    );

    test("rejects creation for non-management role", async () => {
      await expectAppError(
        service.create(createData, teacher),
        HTTP_STATUS.FORBIDDEN,
        "FORBIDDEN"
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test("rejects missing employee", async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expectAppError(
        service.create(createData, admin),
        HTTP_STATUS.NOT_FOUND,
        "EMPLOYEE_NOT_FOUND"
      );

      expect(prisma.staffAssignment.create).not.toHaveBeenCalled();
    });

    test("rejects inactive employee", async () => {
      prisma.employee.findUnique.mockResolvedValue({
        ...employee,
        status: "INACTIVE"
      });

      await expectAppError(
        service.create(createData, admin),
        HTTP_STATUS.NOT_FOUND,
        "EMPLOYEE_NOT_FOUND"
      );
    });

    test("rejects unsupported assignment role", async () => {
      await expectAppError(
        service.create(
          {
            ...createData,
            role: "ADMIN"
          },
          admin
        ),
        HTTP_STATUS.CONFLICT,
        "INVALID_EMPLOYEE_ROLE"
      );
    });

    test("rejects when employee role does not match assignment role", async () => {
      await expectAppError(
        service.create(
          {
            ...createData,
            role: "EDUCATOR"
          },
          admin
        ),
        HTTP_STATUS.CONFLICT,
        "INVALID_EMPLOYEE_ROLE"
      );
    });

    test("rejects missing group", async () => {
      prisma.group.findUnique.mockResolvedValue(null);

      await expectAppError(
        service.create(createData, admin),
        HTTP_STATUS.NOT_FOUND,
        "GROUP_NOT_FOUND"
      );

      expect(prisma.staffAssignment.create).not.toHaveBeenCalled();
    });

    test("rejects inactive group", async () => {
      prisma.group.findUnique.mockResolvedValue({
        ...group,
        status: "INACTIVE"
      });

      await expectAppError(
        service.create(createData, admin),
        HTTP_STATUS.NOT_FOUND,
        "GROUP_NOT_FOUND"
      );
    });

    test("rejects employee with another active assignment", async () => {
      prisma.staffAssignment.findFirst.mockResolvedValueOnce(assignment);

      await expectAppError(
        service.create(createData, admin),
        HTTP_STATUS.CONFLICT,
        "EMPLOYEE_ALREADY_ASSIGNED"
      );

      expect(prisma.staffAssignment.create).not.toHaveBeenCalled();
    });

    test("checks employee active assignment by employee id", async () => {
      await service.create(createData, admin);

      expect(prisma.staffAssignment.findFirst).toHaveBeenNthCalledWith(1, {
        where: {
          employeeId: EMPLOYEE_ID,
          endDate: null
        }
      });
    });

    test("rejects group with active assignment for the same role", async () => {
      prisma.staffAssignment.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(assignment);

      await expectAppError(
        service.create(createData, admin),
        HTTP_STATUS.CONFLICT,
        "GROUP_ROLE_ALREADY_ASSIGNED"
      );

      expect(prisma.staffAssignment.create).not.toHaveBeenCalled();
    });

    test("checks group active assignment by group and role", async () => {
      await service.create(createData, admin);

      expect(prisma.staffAssignment.findFirst).toHaveBeenNthCalledWith(2, {
        where: {
          groupId: GROUP_ID,
          role: "TEACHER",
          endDate: null
        }
      });
    });

    test("maps Prisma unique constraint error", async () => {
      prisma.staffAssignment.create.mockRejectedValue({
        code: "P2002"
      });

      await expectAppError(
        service.create(createData, admin),
        HTTP_STATUS.CONFLICT,
        "ASSIGNMENT_ALREADY_EXISTS"
      );
    });

    test.each(["P2025", "P2003"])(
      "maps Prisma related record error %s",
      async (code) => {
        prisma.staffAssignment.create.mockRejectedValue({
          code
        });

        await expectAppError(
          service.create(createData, admin),
          HTTP_STATUS.NOT_FOUND,
          "RELATED_RECORD_NOT_FOUND"
        );
      }
    );

    test("rethrows unknown Prisma errors", async () => {
      const error = new Error("Database unavailable");

      prisma.staffAssignment.create.mockRejectedValue(error);

      await expect(service.create(createData, admin)).rejects.toBe(error);
    });
  });
    describe("complete", () => {
    test("completes active assignment and writes audit log", async () => {
      const updated = {
        ...assignment,
        endDate: new Date("2026-02-01T00:00:00.000Z")
      };

      prisma.staffAssignment.update.mockResolvedValue(updated);

      const result = await service.complete(ASSIGNMENT_ID, admin);

      expect(result).toEqual(updated);

      expect(prisma.staffAssignment.findUnique).toHaveBeenCalledWith({
        where: {
          id: ASSIGNMENT_ID
        },
        include: {
          employee: true,
          group: true
        }
      });

      expect(prisma.staffAssignment.update).toHaveBeenCalledWith({
        where: {
          id: ASSIGNMENT_ID
        },
        data: {
          endDate: expect.any(Date)
        },
        include: {
          employee: true,
          group: true
        }
      });

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: USER_ID,
          action: "UPDATE",
          entityType: "StaffAssignment",
          entityId: ASSIGNMENT_ID,
          before: assignment,
          after: updated
        }),
        prisma
      );
    });

    test("allows manager to complete assignment", async () => {
      await expect(
        service.complete(ASSIGNMENT_ID, manager)
      ).resolves.toMatchObject({
        id: ASSIGNMENT_ID
      });
    });

    test("rejects completion for non-management role", async () => {
      await expectAppError(
        service.complete(ASSIGNMENT_ID, teacher),
        HTTP_STATUS.FORBIDDEN,
        "FORBIDDEN"
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test("rejects when assignment does not exist", async () => {
      prisma.staffAssignment.findUnique.mockResolvedValue(null);

      await expectAppError(
        service.complete(ASSIGNMENT_ID, admin),
        HTTP_STATUS.NOT_FOUND,
        "STAFF_ASSIGNMENT_NOT_FOUND"
      );

      expect(prisma.staffAssignment.update).not.toHaveBeenCalled();
    });

    test("rejects already completed assignment", async () => {
      prisma.staffAssignment.findUnique.mockResolvedValue({
        ...assignment,
        endDate: new Date("2026-01-15T00:00:00.000Z")
      });

      await expectAppError(
        service.complete(ASSIGNMENT_ID, admin),
        HTTP_STATUS.CONFLICT,
        "ASSIGNMENT_ALREADY_COMPLETED"
      );

      expect(prisma.staffAssignment.update).not.toHaveBeenCalled();
    });
  });

  describe("getGroupAssignments", () => {
    test("returns group assignments for management role", async () => {
      const result = await service.getGroupAssignments(GROUP_ID, admin);

      expect(result).toEqual([assignment]);

      expect(prisma.group.findUnique).toHaveBeenCalledWith({
        where: {
          id: GROUP_ID
        }
      });

      expect(prisma.staffAssignment.findMany).toHaveBeenCalledWith({
        where: {
          groupId: GROUP_ID
        },
        include: {
          employee: true
        },
        orderBy: {
          startDate: "desc"
        }
      });
    });

    test("returns only active own-group assignments for employee role", async () => {
      prisma.staffAssignment.findFirst.mockResolvedValue(assignment);

      await service.getGroupAssignments(GROUP_ID, teacher);

      expect(prisma.staffAssignment.findFirst).toHaveBeenCalledWith({
        where: {
          groupId: GROUP_ID,
          employee: {
            userId: USER_ID
          },
          endDate: null
        }
      });

      expect(prisma.staffAssignment.findMany).toHaveBeenCalledWith({
        where: {
          groupId: GROUP_ID,
          endDate: null
        },
        include: {
          employee: true
        },
        orderBy: {
          startDate: "desc"
        }
      });
    });

    test("rejects missing group", async () => {
      prisma.group.findUnique.mockResolvedValue(null);

      await expectAppError(
        service.getGroupAssignments(GROUP_ID, admin),
        HTTP_STATUS.NOT_FOUND,
        "GROUP_NOT_FOUND"
      );

      expect(prisma.staffAssignment.findMany).not.toHaveBeenCalled();
    });

    test("rejects employee without active assignment in group", async () => {
      prisma.staffAssignment.findFirst.mockResolvedValue(null);

      await expectAppError(
        service.getGroupAssignments(GROUP_ID, teacher),
        HTTP_STATUS.FORBIDDEN,
        "FORBIDDEN"
      );

      expect(prisma.staffAssignment.findMany).not.toHaveBeenCalled();
    });

    test("rejects unsupported role", async () => {
      await expectAppError(
        service.getGroupAssignments(GROUP_ID, {
          id: USER_ID,
          role: "STUDENT"
        }),
        HTTP_STATUS.FORBIDDEN,
        "FORBIDDEN"
      );
    });
  });

  describe("getEmployeeAssignments", () => {
    test("returns employee assignments for management role", async () => {
      const result = await service.getEmployeeAssignments(EMPLOYEE_ID, admin);

      expect(result).toEqual([assignment]);

      expect(prisma.employee.findUnique).toHaveBeenCalledWith({
        where: {
          id: EMPLOYEE_ID
        }
      });

      expect(prisma.staffAssignment.findMany).toHaveBeenCalledWith({
        where: {
          employeeId: EMPLOYEE_ID
        },
        include: {
          group: true
        },
        orderBy: {
          startDate: "desc"
        }
      });
    });

    test("allows employee to access own assignments", async () => {
      await expect(
        service.getEmployeeAssignments(EMPLOYEE_ID, teacher)
      ).resolves.toEqual([assignment]);
    });

    test("rejects missing employee", async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expectAppError(
        service.getEmployeeAssignments(EMPLOYEE_ID, admin),
        HTTP_STATUS.NOT_FOUND,
        "EMPLOYEE_NOT_FOUND"
      );

      expect(prisma.staffAssignment.findMany).not.toHaveBeenCalled();
    });

    test("rejects employee accessing another employee assignments", async () => {
      prisma.employee.findUnique.mockResolvedValue({
        ...employee,
        userId: OTHER_USER_ID
      });

      await expectAppError(
        service.getEmployeeAssignments(EMPLOYEE_ID, teacher),
        HTTP_STATUS.FORBIDDEN,
        "FORBIDDEN"
      );

      expect(prisma.staffAssignment.findMany).not.toHaveBeenCalled();
    });

    test("rejects unsupported role", async () => {
      await expectAppError(
        service.getEmployeeAssignments(EMPLOYEE_ID, {
          id: USER_ID,
          role: "STUDENT"
        }),
        HTTP_STATUS.FORBIDDEN,
        "FORBIDDEN"
      );
    });
  });
});
describe("Staff assignments controller", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("getAll returns assignments", async () => {
    jest.spyOn(service, "getAll").mockResolvedValue([assignment]);

    const req = {
      user: admin
    };

    const res = createResponse();

    await controller.getAll(req, res);

    expect(service.getAll).toHaveBeenCalledWith(admin);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [assignment]
    });
  });

  test("create returns created assignment", async () => {
    jest.spyOn(service, "create").mockResolvedValue(assignment);

    const req = {
      user: admin
    };

    const res = createResponse();

    await controller.create(req, res);

    expect(service.create).toHaveBeenCalledWith(createData, admin);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: assignment
    });
  });

  test("complete returns completed assignment", async () => {
    jest.spyOn(service, "complete").mockResolvedValue(assignment);

    const req = {
      user: admin
    };

    const res = createResponse();

    await controller.complete(req, res);

    expect(service.complete).toHaveBeenCalledWith(ASSIGNMENT_ID, admin);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: assignment
    });
  });

  test("getGroupAssignments returns group assignments", async () => {
    jest.spyOn(service, "getGroupAssignments").mockResolvedValue([assignment]);

    const req = {
      user: admin
    };

    const res = createResponse();

    await controller.getGroupAssignments(req, res);

    expect(service.getGroupAssignments).toHaveBeenCalledWith(GROUP_ID, admin);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [assignment]
    });
  });

  test("getEmployeeAssignments returns employee assignments", async () => {
    jest.spyOn(service, "getEmployeeAssignments").mockResolvedValue([assignment]);

    const req = {
      user: admin
    };

    const res = createResponse();

    await controller.getEmployeeAssignments(req, res);

    expect(service.getEmployeeAssignments).toHaveBeenCalledWith(
      EMPLOYEE_ID,
      admin
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [assignment]
    });
  });
});

describe("Staff assignments routes", () => {
  function findRoute(method, path) {
    return routes.stack.find(
      (layer) =>
        layer.route &&
        layer.route.path === path &&
        layer.route.methods[method]
    );
  }

  function routeHandlers(method, path) {
    const route = findRoute(method, path);

    expect(route).toBeDefined();

    return route.route.stack.map((layer) => layer.handle);
  }

  test("uses authentication middleware for all routes", () => {
    expect(routes.stack[0].handle).toBe(requireAuth);
  });

  test("registers GET / with read access", () => {
    const handlers = routeHandlers("get", "/");

    expect(handlers[0].allowedRoles).toEqual([
      "ADMIN",
      "MANAGER",
      "TEACHER",
      "EDUCATOR",
      "ASSISTANT"
    ]);
    expect(handlers[1]).toBe(controller.getAll);
  });

  test("registers POST / with management access and body validation", () => {
    const handlers = routeHandlers("post", "/");

    expect(handlers[0].allowedRoles).toEqual(["ADMIN", "MANAGER"]);
    expect(handlers[1].schema).toBe(validation.createAssignmentSchema);
    expect(handlers[1].validationProperty).toBe("body");
    expect(handlers[2]).toBe(controller.create);
  });

  test("registers GET /group/:groupId with params validation", () => {
    const handlers = routeHandlers("get", "/group/:groupId");

    expect(handlers[0].allowedRoles).toEqual([
      "ADMIN",
      "MANAGER",
      "TEACHER",
      "EDUCATOR",
      "ASSISTANT"
    ]);
    expect(handlers[1].schema).toBe(validation.groupParamsSchema);
    expect(handlers[1].validationProperty).toBe("params");
    expect(handlers[2]).toBe(controller.getGroupAssignments);
  });

  test("registers GET /employee/:employeeId with params validation", () => {
    const handlers = routeHandlers("get", "/employee/:employeeId");

    expect(handlers[0].allowedRoles).toEqual([
      "ADMIN",
      "MANAGER",
      "TEACHER",
      "EDUCATOR",
      "ASSISTANT"
    ]);
    expect(handlers[1].schema).toBe(validation.employeeParamsSchema);
    expect(handlers[1].validationProperty).toBe("params");
    expect(handlers[2]).toBe(controller.getEmployeeAssignments);
  });

  test("registers PATCH /:id/complete with management access and params validation", () => {
    const handlers = routeHandlers("patch", "/:id/complete");

    expect(handlers[0].allowedRoles).toEqual(["ADMIN", "MANAGER"]);
    expect(handlers[1].schema).toBe(validation.idParamsSchema);
    expect(handlers[1].validationProperty).toBe("params");
    expect(handlers[2]).toBe(controller.complete);
  });
});
