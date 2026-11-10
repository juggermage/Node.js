const prisma = require("../../src/config/prisma");
const auditService = require("../../src/modules/audit/audit.service");
const AppError = require("../../src/utils/app-error");
const HTTP_STATUS = require("../../src/utils/http-status");

jest.mock("../../src/config/prisma", () => ({
  teacherSubject: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn()
  },
  employee: {
    findUnique: jest.fn()
  },
  subject: {
    findUnique: jest.fn()
  },
  $transaction: jest.fn()
}));

jest.mock("../../src/modules/audit/audit.service", () => ({
  createLog: jest.fn()
}));

jest.mock("../../src/middleware/auth.middleware", () => {
  const middleware = jest.fn();
  middleware._name = "requireAuth";
  return middleware;
});

jest.mock("../../src/middleware/rbac.middleware", () => {
  return jest.fn((...allowedRoles) => {
    const middleware = jest.fn();
    middleware.allowedRoles = allowedRoles;
    return middleware;
  });
});

jest.mock("../../src/middleware/validate.middleware", () => {
  return jest.fn((schema, validationProperty) => {
    const middleware = jest.fn();
    middleware.schema = schema;
    middleware.validationProperty = validationProperty;
    return middleware;
  });
});

const service = require("../../src/modules/teacher-subjects/teacher-subjects.service");
const controller = require("../../src/modules/teacher-subjects/teacher-subjects.controller");
const router = require("../../src/modules/teacher-subjects/teacher-subjects.routes");
const {
  createAssignmentSchema,
  idParamsSchema,
  employeeParamsSchema
} = require("../../src/modules/teacher-subjects/teacher-subjects.validation");

const admin = { id: "admin-1", role: "ADMIN" };
const manager = { id: "manager-1", role: "MANAGER" };
const teacher = { id: "teacher-user-1", role: "TEACHER" };
const educator = { id: "educator-1", role: "EDUCATOR" };

const assignment = {
  id: "assignment-1",
  employeeId: "employee-1",
  subjectId: "subject-1",
  employee: { id: "employee-1", role: "TEACHER" },
  subject: { id: "subject-1", name: "Mathematics" }
};

function createTransaction() {
  const tx = {
    employee: { findUnique: jest.fn() },
    subject: { findUnique: jest.fn() },
    teacherSubject: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn()
    }
  };
  prisma.$transaction.mockImplementation((callback) => callback(tx));
  return tx;
}

function expectAppError(promise, statusCode, code) {
  return expect(promise).rejects.toMatchObject({
    statusCode,
    code
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("teacher-subjects service", () => {
  describe("getAll", () => {
    it("returns all assignments for an administrator", async () => {
      prisma.teacherSubject.findMany.mockResolvedValue([assignment]);

      await expect(service.getAll(admin)).resolves.toEqual([assignment]);
      expect(prisma.teacherSubject.findMany).toHaveBeenCalledWith({
        where: {},
        include: { employee: true, subject: true },
        orderBy: { subject: { name: "asc" } }
      });
    });

    it("limits a teacher to their own assignments", async () => {
      prisma.teacherSubject.findMany.mockResolvedValue([assignment]);

      await service.getAll(teacher);

      expect(prisma.teacherSubject.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { employee: { userId: teacher.id } }
        })
      );
    });

    it("allows managers to read all assignments", async () => {
      prisma.teacherSubject.findMany.mockResolvedValue([]);

      await service.getAll(manager);

      expect(prisma.teacherSubject.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} })
      );
    });

    it("rejects unauthenticated users", async () => {
      await expectAppError(
        service.getAll(null),
        HTTP_STATUS.UNAUTHORIZED,
        "UNAUTHORIZED"
      );
    });

    it("rejects users with unsupported roles", async () => {
      await expectAppError(
        service.getAll(educator),
        HTTP_STATUS.FORBIDDEN,
        "FORBIDDEN"
      );
    });
  });

  describe("create", () => {
    it("creates an assignment and writes an audit log", async () => {
      const tx = createTransaction();
      tx.employee.findUnique.mockResolvedValue({
        id: "employee-1",
        status: "ACTIVE",
        role: "TEACHER"
      });
      tx.subject.findUnique.mockResolvedValue({
        id: "subject-1",
        status: "ACTIVE"
      });
      tx.teacherSubject.findUnique.mockResolvedValue(null);
      tx.teacherSubject.create.mockResolvedValue(assignment);
      auditService.createLog.mockResolvedValue({});

      await expect(
        service.create(
          { employeeId: "employee-1", subjectId: "subject-1" },
          admin
        )
      ).resolves.toEqual(assignment);

      expect(tx.teacherSubject.create).toHaveBeenCalledWith({
        data: { employeeId: "employee-1", subjectId: "subject-1" },
        include: { employee: true, subject: true }
      });
      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: admin.id,
          action: "CREATE",
          entityType: "TeacherSubject",
          entityId: assignment.id,
          after: assignment
        }),
        tx
      );
    });

    it("allows managers to create assignments", async () => {
      const tx = createTransaction();
      tx.employee.findUnique.mockResolvedValue({ status: "ACTIVE", role: "TEACHER" });
      tx.subject.findUnique.mockResolvedValue({ status: "ACTIVE" });
      tx.teacherSubject.findUnique.mockResolvedValue(null);
      tx.teacherSubject.create.mockResolvedValue(assignment);

      await service.create(
        { employeeId: "employee-1", subjectId: "subject-1" },
        manager
      );

      expect(tx.teacherSubject.create).toHaveBeenCalled();
    });

    it("rejects users without management permissions", async () => {
      await expectAppError(
        service.create({ employeeId: "e1", subjectId: "s1" }, teacher),
        HTTP_STATUS.FORBIDDEN,
        "FORBIDDEN"
      );
    });

    it("rejects a missing or inactive employee", async () => {
      const tx = createTransaction();
      tx.employee.findUnique.mockResolvedValue({
        id: "employee-1",
        status: "INACTIVE",
        role: "TEACHER"
      });

      await expectAppError(
        service.create({ employeeId: "employee-1", subjectId: "subject-1" }, admin),
        HTTP_STATUS.NOT_FOUND,
        "EMPLOYEE_NOT_FOUND"
      );
      expect(tx.subject.findUnique).not.toHaveBeenCalled();
    });

    it("rejects an employee who is not a teacher", async () => {
      const tx = createTransaction();
      tx.employee.findUnique.mockResolvedValue({
        id: "employee-1",
        status: "ACTIVE",
        role: "EDUCATOR"
      });

      await expectAppError(
        service.create({ employeeId: "employee-1", subjectId: "subject-1" }, admin),
        HTTP_STATUS.CONFLICT,
        "INVALID_EMPLOYEE_ROLE"
      );
    });

    it("rejects a missing or inactive subject", async () => {
      const tx = createTransaction();
      tx.employee.findUnique.mockResolvedValue({
        status: "ACTIVE",
        role: "TEACHER"
      });
      tx.subject.findUnique.mockResolvedValue({
        status: "INACTIVE"
      });

      await expectAppError(
        service.create({ employeeId: "employee-1", subjectId: "subject-1" }, admin),
        HTTP_STATUS.NOT_FOUND,
        "SUBJECT_NOT_FOUND"
      );
    });

    it("rejects duplicate assignments", async () => {
      const tx = createTransaction();
      tx.employee.findUnique.mockResolvedValue({
        status: "ACTIVE",
        role: "TEACHER"
      });
      tx.subject.findUnique.mockResolvedValue({ status: "ACTIVE" });
      tx.teacherSubject.findUnique.mockResolvedValue(assignment);

      await expectAppError(
        service.create({ employeeId: "employee-1", subjectId: "subject-1" }, admin),
        HTTP_STATUS.CONFLICT,
        "TEACHER_SUBJECT_EXISTS"
      );
      expect(tx.teacherSubject.create).not.toHaveBeenCalled();
    });

    it("maps Prisma unique constraint errors", async () => {
      const tx = createTransaction();
      tx.employee.findUnique.mockResolvedValue({
        status: "ACTIVE",
        role: "TEACHER"
      });
      tx.subject.findUnique.mockResolvedValue({ status: "ACTIVE" });
      tx.teacherSubject.findUnique.mockResolvedValue(null);
      tx.teacherSubject.create.mockRejectedValue({ code: "P2002" });

      await expectAppError(
        service.create({ employeeId: "employee-1", subjectId: "subject-1" }, admin),
        HTTP_STATUS.CONFLICT,
        "TEACHER_SUBJECT_EXISTS"
      );
    });

    it("maps missing related record Prisma errors", async () => {
      const tx = createTransaction();
      tx.employee.findUnique.mockResolvedValue({
        status: "ACTIVE",
        role: "TEACHER"
      });
      tx.subject.findUnique.mockResolvedValue({ status: "ACTIVE" });
      tx.teacherSubject.findUnique.mockResolvedValue(null);
      tx.teacherSubject.create.mockRejectedValue({ code: "P2003" });

      await expectAppError(
        service.create({ employeeId: "employee-1", subjectId: "subject-1" }, admin),
        HTTP_STATUS.NOT_FOUND,
        "RELATED_RECORD_NOT_FOUND"
      );
    });
  });

  describe("getTeacherSubjects", () => {
    it("returns subjects for a teacher", async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: "employee-1",
        role: "TEACHER",
        userId: teacher.id
      });
      prisma.teacherSubject.findMany.mockResolvedValue([assignment]);

      await expect(
        service.getTeacherSubjects("employee-1", teacher)
      ).resolves.toEqual([assignment]);

      expect(prisma.teacherSubject.findMany).toHaveBeenCalledWith({
        where: { employeeId: "employee-1" },
        include: { subject: true },
        orderBy: { subject: { name: "asc" } }
      });
    });

    it("allows an administrator to view any teacher's subjects", async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: "employee-1",
        role: "TEACHER",
        userId: "another-user"
      });
      prisma.teacherSubject.findMany.mockResolvedValue([]);

      await service.getTeacherSubjects("employee-1", admin);

      expect(prisma.teacherSubject.findMany).toHaveBeenCalled();
    });

    it("rejects a missing employee", async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expectAppError(
        service.getTeacherSubjects("employee-1", admin),
        HTTP_STATUS.NOT_FOUND,
        "EMPLOYEE_NOT_FOUND"
      );
    });

    it("rejects an employee who is not a teacher", async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: "employee-1",
        role: "EDUCATOR"
      });

      await expectAppError(
        service.getTeacherSubjects("employee-1", admin),
        HTTP_STATUS.CONFLICT,
        "INVALID_EMPLOYEE_ROLE"
      );
    });

    it("prevents a teacher from viewing another teacher's subjects", async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: "employee-2",
        role: "TEACHER",
        userId: "another-user"
      });

      await expectAppError(
        service.getTeacherSubjects("employee-2", teacher),
        HTTP_STATUS.FORBIDDEN,
        "FORBIDDEN"
      );
      expect(prisma.teacherSubject.findMany).not.toHaveBeenCalled();
    });

    it("rejects unsupported roles", async () => {
      await expectAppError(
        service.getTeacherSubjects("employee-1", educator),
        HTTP_STATUS.FORBIDDEN,
        "FORBIDDEN"
      );
    });
  });

  describe("remove", () => {
    it("deletes an assignment and writes an audit log", async () => {
      const tx = createTransaction();
      tx.teacherSubject.findUnique.mockResolvedValue(assignment);
      tx.teacherSubject.delete.mockResolvedValue(assignment);
      auditService.createLog.mockResolvedValue({});

      await expect(service.remove(assignment.id, admin)).resolves.toEqual(assignment);

      expect(tx.teacherSubject.findUnique).toHaveBeenCalledWith({
        where: { id: assignment.id },
        include: { employee: true, subject: true }
      });
      expect(tx.teacherSubject.delete).toHaveBeenCalledWith({
        where: { id: assignment.id },
        include: { employee: true, subject: true }
      });
      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: admin.id,
          action: "DELETE",
          entityType: "TeacherSubject",
          entityId: assignment.id,
          before: assignment,
          after: assignment
        }),
        tx
      );
    });

    it("rejects users without management permissions", async () => {
      await expectAppError(
        service.remove(assignment.id, teacher),
        HTTP_STATUS.FORBIDDEN,
        "FORBIDDEN"
      );
    });

    it("returns not found when the assignment does not exist", async () => {
      const tx = createTransaction();
      tx.teacherSubject.findUnique.mockResolvedValue(null);

      await expectAppError(
        service.remove("missing-id", admin),
        HTTP_STATUS.NOT_FOUND,
        "ASSIGNMENT_NOT_FOUND"
      );
      expect(tx.teacherSubject.delete).not.toHaveBeenCalled();
    });

    it("maps Prisma record-not-found errors", async () => {
      const tx = createTransaction();
      tx.teacherSubject.findUnique.mockResolvedValue(assignment);
      tx.teacherSubject.delete.mockRejectedValue({ code: "P2025" });

      await expectAppError(
        service.remove(assignment.id, admin),
        HTTP_STATUS.NOT_FOUND,
        "RELATED_RECORD_NOT_FOUND"
      );
    });
  });
});

describe("teacher-subjects controller", () => {
  function createResponse() {
    const res = {
      locals: { validated: { body: {}, params: {} } },
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
    return res;
  }

  it("getAll returns assignments", async () => {
    const data = [assignment];
    const res = createResponse();
    service.getAll = jest.fn().mockResolvedValue(data);

    await controller.getAll({ user: teacher }, res);

    expect(service.getAll).toHaveBeenCalledWith(teacher);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({ success: true, data });
  });

  it("create returns the created assignment", async () => {
    const data = assignment;
    const body = { employeeId: "employee-1", subjectId: "subject-1" };
    const res = createResponse();
    res.locals.validated.body = body;
    service.create = jest.fn().mockResolvedValue(data);

    await controller.create({ user: admin }, res);

    expect(service.create).toHaveBeenCalledWith(body, admin);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
    expect(res.json).toHaveBeenCalledWith({ success: true, data });
  });

  it("getTeacherSubjects returns the teacher's assignments", async () => {
    const data = [assignment];
    const res = createResponse();
    res.locals.validated.params.employeeId = "employee-1";
    service.getTeacherSubjects = jest.fn().mockResolvedValue(data);

    await controller.getTeacherSubjects({ user: teacher }, res);

    expect(service.getTeacherSubjects).toHaveBeenCalledWith("employee-1", teacher);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({ success: true, data });
  });

  it("remove returns no content", async () => {
    const res = createResponse();
    res.locals.validated.params.id = assignment.id;
    service.remove = jest.fn().mockResolvedValue(assignment);

    await controller.remove({ user: admin }, res);

    expect(service.remove).toHaveBeenCalledWith(assignment.id, admin);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.NO_CONTENT);
    expect(res.send).toHaveBeenCalled();
  });
});

describe("teacher-subjects validation", () => {
  it("accepts valid assignment data", () => {
    const result = createAssignmentSchema.validate({
      employeeId: "123456789012123456789012",
      subjectId: "abcdefabcdefabcdefabcdef"
    });

    expect(result.error).toBeUndefined();
  });

  it("rejects missing employeeId", () => {
    const result = createAssignmentSchema.validate({
      subjectId: "abcdefabcdefabcdefabcdef"
    });

    expect(result.error).toBeDefined();
  });

  it("rejects invalid employeeId format", () => {
    const result = createAssignmentSchema.validate({
      employeeId: "not-an-object-id",
      subjectId: "abcdefabcdefabcdefabcdef"
    });

    expect(result.error).toBeDefined();
  });

  it("rejects missing subjectId", () => {
    const result = createAssignmentSchema.validate({
      employeeId: "123456789012123456789012"
    });

    expect(result.error).toBeDefined();
  });

  it("accepts a valid id parameter", () => {
    expect(
      idParamsSchema.validate({ id: "123456789012123456789012" }).error
    ).toBeUndefined();
  });

  it("rejects an invalid id parameter", () => {
    expect(idParamsSchema.validate({ id: "123" }).error).toBeDefined();
  });

  it("accepts a valid employeeId parameter", () => {
    expect(
      employeeParamsSchema.validate({
        employeeId: "123456789012123456789012"
      }).error
    ).toBeUndefined();
  });

  it("rejects an invalid employeeId parameter", () => {
    expect(employeeParamsSchema.validate({ employeeId: "invalid" }).error).toBeDefined();
  });
});

describe("teacher-subjects routes", () => {
  function getRoute(path, method) {
    return router.stack.find(
      (layer) => layer.route && layer.route.path === path && layer.route.methods[method]
    );
  }

  it("registers authentication middleware for all routes", () => {
    const authMiddleware = require("../../src/middleware/auth.middleware");
    expect(router.stack[0].handle).toBe(authMiddleware);
  });

  it("registers GET / with read roles", () => {
    const route = getRoute("/", "get");
    expect(route).toBeDefined();
    expect(route.route.stack[0].handle.allowedRoles).toEqual([
      "ADMIN",
      "MANAGER",
      "TEACHER"
    ]);
  });

  it("registers POST / with management roles and body validation", () => {
    const route = getRoute("/", "post");
    expect(route).toBeDefined();
    expect(route.route.stack[0].handle.allowedRoles).toEqual(["ADMIN", "MANAGER"]);
    expect(route.route.stack[1].handle.validationProperty).toBe("body");
    expect(route.route.stack[1].handle.schema).toBe(createAssignmentSchema);
  });

  it("registers GET /employee/:employeeId with read roles and params validation", () => {
    const route = getRoute("/employee/:employeeId", "get");
    expect(route).toBeDefined();
    expect(route.route.stack[0].handle.allowedRoles).toEqual([
      "ADMIN",
      "MANAGER",
      "TEACHER"
    ]);
    expect(route.route.stack[1].handle.validationProperty).toBe("params");
    expect(route.route.stack[1].handle.schema).toBe(employeeParamsSchema);
  });

  it("registers DELETE /:id with management roles and params validation", () => {
    const route = getRoute("/:id", "delete");
    expect(route).toBeDefined();
    expect(route.route.stack[0].handle.allowedRoles).toEqual(["ADMIN", "MANAGER"]);
    expect(route.route.stack[1].handle.validationProperty).toBe("params");
    expect(route.route.stack[1].handle.schema).toBe(idParamsSchema);
  });
});
