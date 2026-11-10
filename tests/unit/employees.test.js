
jest.mock("../../src/config/prisma", () => ({
  $transaction: jest.fn(),
  employee: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  user: {
    findUnique: jest.fn(),
    update: jest.fn()
  },
  staffAssignment: {
    count: jest.fn()
  },
  teacherSubject: {
    count: jest.fn()
  },
  scheduleItem: {
    count: jest.fn()
  }
}));

jest.mock("../../src/modules/audit/audit.service", () => ({
  createLog: jest.fn()
}));

jest.mock("../../src/modules/employees/employees.service", () => ({
  getAll: jest.fn(),
  getById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn()
}));

jest.mock("../../src/middleware/auth.middleware", () =>
  jest.fn((req, res, next) => next())
);

jest.mock("../../src/middleware/rbac.middleware", () =>
  jest.fn((...allowedRoles) => {
    const middleware = (req, res, next) => next();
    middleware.allowedRoles = allowedRoles;
    return middleware;
  })
);

jest.mock("../../src/middleware/validate.middleware", () =>
  jest.fn((schema, property) => {
    const middleware = (req, res, next) => next();
    middleware.validationSchema = schema;
    middleware.validationProperty = property;
    return middleware;
  })
);

const prisma = require("../../src/config/prisma");
const auditService = require("../../src/modules/audit/audit.service");
const service = require("../../src/modules/employees/employees.service");
const controller = require("../../src/modules/employees/employees.controller");
const HTTP_STATUS = require("../../src/utils/http-status");

const authMiddleware = require("../../src/middleware/auth.middleware");

const {
  idParamsSchema,
  createEmployeeSchema,
  updateEmployeeSchema,
  queryEmployeesSchema
} = require("../../src/modules/employees/employees.validation");

const employeeRouter = require("../../src/modules/employees/employees.routes");

const realService = jest.requireActual(
  "../../src/modules/employees/employees.service"
);

const ADMIN = {
  id: "111111111111111111111111",
  role: "ADMIN"
};

const MANAGER = {
  id: "222222222222222222222222",
  role: "MANAGER"
};

const USER_ID = "333333333333333333333333";
const EMPLOYEE_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";

const TEACHER = {
  id: USER_ID,
  role: "TEACHER"
};

const employee = {
  id: EMPLOYEE_ID,
  employeeCode: "EMP001",
  firstName: "Ivan",
  lastName: "Petrenko",
  role: "TEACHER",
  phone: "123456789",
  email: "ivan@example.com",
  userId: USER_ID,
  status: "ACTIVE"
};

const validEmployee = {
  employeeCode: "EMP001",
  firstName: "Ivan",
  lastName: "Petrenko",
  role: "TEACHER",
  phone: "123456789",
  email: "ivan@example.com",
  userId: USER_ID
};

function createResponse() {
  const res = {};

  res.locals = {
    validated: {
      query: {},
      params: {},
      body: {}
    }
  };

  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);

  return res;
}

describe("Employees Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("getAll should return employees", async () => {
    const req = { user: ADMIN };
    const res = createResponse();
    const employees = [employee];

    res.locals.validated.query = { status: "ACTIVE" };
    service.getAll.mockResolvedValue(employees);

    await controller.getAll(req, res);

    expect(service.getAll).toHaveBeenCalledWith(
      { status: "ACTIVE" },
      ADMIN
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: employees
    });
  });

  test("getById should return employee", async () => {
    const req = { user: ADMIN };
    const res = createResponse();

    res.locals.validated.params.id = EMPLOYEE_ID;
    service.getById.mockResolvedValue(employee);

    await controller.getById(req, res);

    expect(service.getById).toHaveBeenCalledWith(
      EMPLOYEE_ID,
      ADMIN
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: employee
    });
  });

  test("create should create employee", async () => {
    const req = { user: ADMIN };
    const res = createResponse();

    res.locals.validated.body = validEmployee;
    service.create.mockResolvedValue(employee);

    await controller.create(req, res);

    expect(service.create).toHaveBeenCalledWith(
      validEmployee,
      ADMIN
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: employee
    });
  });

  test("update should update employee", async () => {
    const req = { user: ADMIN };
    const res = createResponse();
    const updateData = { firstName: "Petro" };

    res.locals.validated.params.id = EMPLOYEE_ID;
    res.locals.validated.body = updateData;

    service.update.mockResolvedValue({
      ...employee,
      firstName: "Petro"
    });

    await controller.update(req, res);

    expect(service.update).toHaveBeenCalledWith(
      EMPLOYEE_ID,
      updateData,
      ADMIN
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
  });

  test("remove should archive employee", async () => {
    const req = { user: ADMIN };
    const res = createResponse();

    res.locals.validated.params.id = EMPLOYEE_ID;
    service.remove.mockResolvedValue(employee);

    await controller.remove(req, res);

    expect(service.remove).toHaveBeenCalledWith(
      EMPLOYEE_ID,
      ADMIN
    );

    expect(res.status).toHaveBeenCalledWith(
      HTTP_STATUS.NO_CONTENT
    );

    expect(res.send).toHaveBeenCalled();
  });
});

describe("Employees Routes", () => {
  test("should register authentication middleware", () => {
    const registered = employeeRouter.stack.some(
      (layer) => layer.handle === authMiddleware
    );

    expect(registered).toBe(true);
  });

  test("should register all employee routes", () => {
    const routes = employeeRouter.stack
      .filter((layer) => layer.route)
      .map((layer) => ({
        path: layer.route.path,
        method: Object.keys(layer.route.methods)[0]
      }));

    expect(routes).toEqual([
      { path: "/", method: "get" },
      { path: "/:id", method: "get" },
      { path: "/", method: "post" },
      { path: "/:id", method: "patch" },
      { path: "/:id", method: "delete" }
    ]);
  });

  test("should register correct access roles", () => {
    const registeredRoles = employeeRouter.stack
      .filter((layer) => layer.route)
      .flatMap((layer) => layer.route.stack)
      .map((layer) => layer.handle.allowedRoles)
      .filter(Boolean);

    expect(registeredRoles).toEqual([
      ["ADMIN", "MANAGER", "TEACHER", "EDUCATOR", "ASSISTANT"],
      ["ADMIN", "MANAGER", "TEACHER", "EDUCATOR", "ASSISTANT"],
      ["ADMIN", "MANAGER"],
      ["ADMIN", "MANAGER"],
      ["ADMIN", "MANAGER"]
    ]);
  });

  test("should register validation middleware", () => {
    const registeredValidations = employeeRouter.stack
      .filter((layer) => layer.route)
      .flatMap((layer) => layer.route.stack)
      .map((layer) => ({
        schema: layer.handle.validationSchema,
        property: layer.handle.validationProperty
      }))
      .filter((validation) => validation.schema);

    expect(registeredValidations).toEqual(
      expect.arrayContaining([
        {
          schema: queryEmployeesSchema,
          property: "query"
        },
        {
          schema: idParamsSchema,
          property: "params"
        },
        {
          schema: createEmployeeSchema,
          property: "body"
        },
        {
          schema: updateEmployeeSchema,
          property: "body"
        }
      ])
    );
  });
});

describe("Employees Validation", () => {
  test("should accept valid employee data", () => {
    const { error } = createEmployeeSchema.validate(validEmployee);

    expect(error).toBeUndefined();
  });

  test("should reject employee without required fields", () => {
    const { error } = createEmployeeSchema.validate({});

    expect(error).toBeDefined();
  });

  test("should reject invalid employee role", () => {
    const { error } = createEmployeeSchema.validate({
      ...validEmployee,
      role: "PARENT"
    });

    expect(error).toBeDefined();
  });

  test("should reject invalid email", () => {
    const { error } = createEmployeeSchema.validate({
      ...validEmployee,
      email: "invalid-email"
    });

    expect(error).toBeDefined();
  });

  test("should reject employee code longer than 30 characters", () => {
    const { error } = createEmployeeSchema.validate({
      ...validEmployee,
      employeeCode: "A".repeat(31)
    });

    expect(error).toBeDefined();
  });

  test("should accept empty phone and email", () => {
    const { error } = createEmployeeSchema.validate({
      ...validEmployee,
      phone: "",
      email: ""
    });

    expect(error).toBeUndefined();
  });

  test("should accept null userId", () => {
    const { error } = createEmployeeSchema.validate({
      ...validEmployee,
      userId: null
    });

    expect(error).toBeUndefined();
  });

  test("should accept valid update data", () => {
    const { error } = updateEmployeeSchema.validate({
      firstName: "Petro",
      status: "INACTIVE"
    });

    expect(error).toBeUndefined();
  });

  test("should reject empty update data", () => {
    const { error } = updateEmployeeSchema.validate({});

    expect(error).toBeDefined();
  });

  test("should reject invalid update status", () => {
    const { error } = updateEmployeeSchema.validate({
      status: "DELETED"
    });

    expect(error).toBeDefined();
  });

  test("should accept valid MongoDB ObjectId", () => {
    const { error } = idParamsSchema.validate({
      id: EMPLOYEE_ID
    });

    expect(error).toBeUndefined();
  });

  test("should reject invalid MongoDB ObjectId", () => {
    const { error } = idParamsSchema.validate({
      id: "invalid-id"
    });

    expect(error).toBeDefined();
  });

  test("should accept valid query parameters", () => {
    const { error } = queryEmployeesSchema.validate({
      search: "Ivan",
      role: "TEACHER",
      status: "ACTIVE"
    });

    expect(error).toBeUndefined();
  });

  test("should reject invalid query role", () => {
    const { error } = queryEmployeesSchema.validate({
      role: "PARENT"
    });

    expect(error).toBeDefined();
  });

  test("should reject invalid query status", () => {
    const { error } = queryEmployeesSchema.validate({
      status: "DELETED"
    });

    expect(error).toBeDefined();
  });
});

describe("Employees Service", () => {
  let tx;

  beforeEach(() => {
    jest.clearAllMocks();

    tx = {
      employee: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      },
      user: {
        findUnique: jest.fn(),
        update: jest.fn()
      },
      staffAssignment: {
        count: jest.fn()
      },
      teacherSubject: {
        count: jest.fn()
      },
      scheduleItem: {
        count: jest.fn()
      }
    };

    prisma.$transaction.mockImplementation((callback) => {
      return callback(tx);
    });

    tx.employee.findUnique.mockImplementation(({ where }) => {
      if (where.id === EMPLOYEE_ID) {
        return Promise.resolve(employee);
      }

      return Promise.resolve(null);
    });

    tx.employee.findFirst.mockImplementation(({ where }) => {
      if (where.id === EMPLOYEE_ID && where.userId === USER_ID) {
        return Promise.resolve(employee);
      }

      return Promise.resolve(null);
    });

    tx.employee.create.mockResolvedValue(employee);
    tx.employee.update.mockResolvedValue(employee);

    tx.user.findUnique.mockResolvedValue({
      id: USER_ID,
      role: "TEACHER"
    });

    tx.user.update.mockResolvedValue({});

    tx.staffAssignment.count.mockResolvedValue(0);
    tx.teacherSubject.count.mockResolvedValue(0);
    tx.scheduleItem.count.mockResolvedValue(0);

    prisma.employee.findMany.mockResolvedValue([employee]);
    prisma.employee.findUnique.mockResolvedValue(employee);
    prisma.employee.findFirst.mockResolvedValue(employee);
  });

  test("getAll should return employees for administrator", async () => {
    const result = await realService.getAll({}, ADMIN);

    expect(result).toEqual([employee]);

    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { not: "ARCHIVED" }
        }
      })
    );
  });

  test("getAll should filter employees by status", async () => {
    await realService.getAll(
      { status: "INACTIVE" },
      ADMIN
    );

    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "INACTIVE"
        }
      })
    );
  });

  test("getAll should filter employees by role", async () => {
    await realService.getAll(
      { role: "TEACHER" },
      ADMIN
    );

    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { not: "ARCHIVED" },
          role: "TEACHER"
        }
      })
    );
  });

  test("getAll should search by name and employee code", async () => {
    await realService.getAll(
      { search: "Ivan" },
      ADMIN
    );

    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { not: "ARCHIVED" },
          OR: [
            {
              firstName: {
                contains: "Ivan",
                mode: "insensitive"
              }
            },
            {
              lastName: {
                contains: "Ivan",
                mode: "insensitive"
              }
            },
            {
              employeeCode: {
                contains: "Ivan",
                mode: "insensitive"
              }
            }
          ]
        }
      })
    );
  });

  test("getAll should restrict employee to own account", async () => {
    await realService.getAll({}, TEACHER);

    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "ACTIVE",
          userId: TEACHER.id
        }
      })
    );
  });

  test("getAll should reject unauthenticated user", async () => {
    await expect(
      realService.getAll({}, null)
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });
  });

  test("getAll should reject user with unsupported role", async () => {
    await expect(
      realService.getAll({}, {
        id: USER_ID,
        role: "PARENT"
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
  });

  test("getById should return employee for administrator", async () => {
    const result = await realService.getById(
      EMPLOYEE_ID,
      ADMIN
    );

    expect(result).toEqual(employee);

    expect(prisma.employee.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EMPLOYEE_ID }
      })
    );
  });

  test("getById should restrict employee to own account", async () => {
    await realService.getById(EMPLOYEE_ID, TEACHER);

    expect(prisma.employee.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: EMPLOYEE_ID,
          userId: TEACHER.id,
          status: { not: "ARCHIVED" }
        }
      })
    );
  });

  test("getById should reject when employee does not exist", async () => {
    prisma.employee.findUnique.mockResolvedValue(null);

    await expect(
      realService.getById(EMPLOYEE_ID, ADMIN)
    ).rejects.toMatchObject({
      code: "EMPLOYEE_NOT_FOUND"
    });
  });

  test("create should create employee", async () => {
    const result = await realService.create(
      validEmployee,
      ADMIN
    );

    expect(result).toEqual(employee);

    expect(tx.employee.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employeeCode: "EMP001",
          firstName: "Ivan",
          lastName: "Petrenko",
          role: "TEACHER",
          phone: "123456789",
          email: "ivan@example.com",
          userId: USER_ID,
          status: "ACTIVE"
        })
      })
    );

    expect(auditService.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ADMIN.id,
        action: "CREATE",
        entityType: "Employee",
        entityId: EMPLOYEE_ID
      }),
      tx
    );
  });

  test("create should trim employee data", async () => {
    await realService.create(
      {
        ...validEmployee,
        employeeCode: " EMP001 ",
        firstName: " Ivan ",
        lastName: " Petrenko "
      },
      ADMIN
    );

    expect(tx.employee.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employeeCode: "EMP001",
          firstName: "Ivan",
          lastName: "Petrenko"
        })
      })
    );
  });

  test("create should convert empty phone and email to null", async () => {
    await realService.create(
      {
        ...validEmployee,
        phone: "",
        email: "",
        userId: null
      },
      ADMIN
    );

    expect(tx.employee.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phone: null,
          email: null,
          userId: null
        })
      })
    );
  });

  test("create should reject duplicate employee code", async () => {
    tx.employee.findUnique.mockResolvedValue({
      id: "cccccccccccccccccccccccc",
      employeeCode: "EMP001"
    });

    await expect(
      realService.create(validEmployee, ADMIN)
    ).rejects.toMatchObject({
      code: "EMPLOYEE_CODE_EXISTS"
    });
  });

  test("create should reject when linked user does not exist", async () => {
    tx.user.findUnique.mockResolvedValue(null);

    await expect(
      realService.create(validEmployee, ADMIN)
    ).rejects.toMatchObject({
      code: "USER_NOT_FOUND"
    });
  });

  test("create should reject when user role does not match employee role", async () => {
    tx.user.findUnique.mockResolvedValue({
      id: USER_ID,
      role: "EDUCATOR"
    });

    await expect(
      realService.create(validEmployee, ADMIN)
    ).rejects.toMatchObject({
      code: "USER_ROLE_MISMATCH"
    });
  });

  test("create should reject when user is already linked", async () => {
    tx.employee.findFirst.mockResolvedValue(employee);

    await expect(
      realService.create(validEmployee, ADMIN)
    ).rejects.toMatchObject({
      code: "USER_ALREADY_LINKED"
    });
  });

  test("create should activate linked user", async () => {
    await realService.create(validEmployee, ADMIN);

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { isActive: true }
    });
  });

  test("create should reject user without management permissions", async () => {
    await expect(
      realService.create(validEmployee, TEACHER)
    ).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
  });

  test("update should update employee", async () => {
    const updatedEmployee = {
      ...employee,
      firstName: "Petro"
    };

    tx.employee.update.mockResolvedValue(updatedEmployee);

    const result = await realService.update(
      EMPLOYEE_ID,
      { firstName: "Petro" },
      ADMIN
    );

    expect(result).toEqual(updatedEmployee);

    expect(tx.employee.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EMPLOYEE_ID },
        data: {
          firstName: "Petro"
        }
      })
    );

    expect(auditService.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ADMIN.id,
        action: "UPDATE",
        entityType: "Employee",
        entityId: EMPLOYEE_ID
      }),
      tx
    );
  });

  test("update should reject when employee does not exist", async () => {
    tx.employee.findUnique.mockResolvedValue(null);

    await expect(
      realService.update(
        EMPLOYEE_ID,
        { firstName: "Petro" },
        ADMIN
      )
    ).rejects.toMatchObject({
      code: "EMPLOYEE_NOT_FOUND"
    });
  });

  test("update should reject role change with active assignments", async () => {
    tx.staffAssignment.count.mockResolvedValue(1);

    await expect(
      realService.update(
        EMPLOYEE_ID,
        { role: "EDUCATOR" },
        ADMIN
      )
    ).rejects.toMatchObject({
      code: "EMPLOYEE_HAS_ASSIGNMENTS"
    });
  });

  test("update should reject deactivation with active assignments", async () => {
    tx.staffAssignment.count.mockResolvedValue(1);

    await expect(
      realService.update(
        EMPLOYEE_ID,
        { status: "INACTIVE" },
        ADMIN
      )
    ).rejects.toMatchObject({
      code: "EMPLOYEE_HAS_ASSIGNMENTS"
    });
  });

  test("update should reject role change when employee has subjects", async () => {
    tx.teacherSubject.count.mockResolvedValue(1);

    await expect(
      realService.update(
        EMPLOYEE_ID,
        { role: "EDUCATOR" },
        ADMIN
      )
    ).rejects.toMatchObject({
      code: "EMPLOYEE_HAS_SUBJECTS"
    });
  });

  test("update should reject role change with active schedule items", async () => {
    tx.scheduleItem.count.mockResolvedValue(1);

    await expect(
      realService.update(
        EMPLOYEE_ID,
        { role: "EDUCATOR" },
        ADMIN
      )
    ).rejects.toMatchObject({
      code: "EMPLOYEE_HAS_SCHEDULE_ITEMS"
    });
  });

  test("update should update linked user role and status", async () => {
    const updatedEmployee = {
      ...employee,
      status: "INACTIVE"
    };

    tx.employee.update.mockResolvedValue(updatedEmployee);

    await realService.update(
      EMPLOYEE_ID,
      { status: "INACTIVE" },
      ADMIN
    );

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: {
        role: "TEACHER",
        isActive: false
      }
    });
  });

  test("update should reject user without management permissions", async () => {
    await expect(
      realService.update(
        EMPLOYEE_ID,
        { firstName: "Petro" },
        TEACHER
      )
    ).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
  });

  test("remove should archive employee", async () => {
    const archivedEmployee = {
      ...employee,
      status: "ARCHIVED"
    };

    tx.employee.update.mockResolvedValue(archivedEmployee);

    const result = await realService.remove(
      EMPLOYEE_ID,
      ADMIN
    );

    expect(result).toEqual(archivedEmployee);

    expect(tx.employee.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EMPLOYEE_ID },
        data: expect.objectContaining({
          status: "ARCHIVED",
          archivedAt: expect.any(Date)
        })
      })
    );

    expect(auditService.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ADMIN.id,
        action: "ARCHIVE",
        entityType: "Employee",
        entityId: EMPLOYEE_ID
      }),
      tx
    );
  });

  test("remove should deactivate linked user", async () => {
    await realService.remove(EMPLOYEE_ID, ADMIN);

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { isActive: false }
    });
  });

  test("remove should reject employee with active responsibilities", async () => {
    tx.staffAssignment.count.mockResolvedValue(1);

    await expect(
      realService.remove(EMPLOYEE_ID, ADMIN)
    ).rejects.toMatchObject({
      code: "EMPLOYEE_HAS_RESPONSIBILITIES"
    });
  });

  test("remove should reject employee with assigned subjects", async () => {
    tx.teacherSubject.count.mockResolvedValue(1);

    await expect(
      realService.remove(EMPLOYEE_ID, ADMIN)
    ).rejects.toMatchObject({
      code: "EMPLOYEE_HAS_RESPONSIBILITIES"
    });
  });

  test("remove should reject employee with active schedule items", async () => {
    tx.scheduleItem.count.mockResolvedValue(1);

    await expect(
      realService.remove(EMPLOYEE_ID, ADMIN)
    ).rejects.toMatchObject({
      code: "EMPLOYEE_HAS_RESPONSIBILITIES"
    });
  });

  test("remove should reject when employee does not exist", async () => {
    tx.employee.findUnique.mockResolvedValue(null);

    await expect(
      realService.remove(EMPLOYEE_ID, ADMIN)
    ).rejects.toMatchObject({
      code: "EMPLOYEE_NOT_FOUND"
    });
  });

  test("remove should reject user without management permissions", async () => {
    await expect(
      realService.remove(EMPLOYEE_ID, TEACHER)
    ).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
  });
});
