jest.mock("../../src/config/prisma", () => ({
  subject: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  teacherSubject: {
    count: jest.fn()
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
  jest.fn((schema, property) => {
    const middleware = jest.fn();
    middleware.schema = schema;
    middleware.validationProperty = property;
    return middleware;
  })
);

const prisma = require("../../src/config/prisma");
const auditService = require("../../src/modules/audit/audit.service");
const service = require("../../src/modules/subjects/subjects.service");
const controller = require("../../src/modules/subjects/subjects.controller");
const routes = require("../../src/modules/subjects/subjects.routes");
const validation = require("../../src/modules/subjects/subjects.validation");
const HTTP_STATUS = require("../../src/utils/http-status");
const requireAuth = require("../../src/middleware/auth.middleware");

const SUBJECT_ID = "507f1f77bcf86cd799439011";
const OTHER_SUBJECT_ID = "507f1f77bcf86cd799439012";
const USER_ID = "507f1f77bcf86cd799439013";

const admin = { id: USER_ID, role: "ADMIN" };
const manager = { id: USER_ID, role: "MANAGER" };
const teacher = { id: USER_ID, role: "TEACHER" };
const educator = { id: USER_ID, role: "EDUCATOR" };
const assistant = { id: USER_ID, role: "ASSISTANT" };

const subject = {
  id: SUBJECT_ID,
  name: "Mathematics",
  description: "Basic mathematics",
  status: "ACTIVE",
  archivedAt: null
};

const createData = {
  name: "Mathematics",
  description: "Basic mathematics"
};

function expectAppError(promise, statusCode, code) {
  return expect(promise).rejects.toMatchObject({ statusCode, code });
}

function setupTransaction() {
  prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
}

function setupDefaults() {
  setupTransaction();
  prisma.subject.findMany.mockResolvedValue([subject]);
  prisma.subject.findFirst.mockResolvedValue(subject);
  prisma.subject.findUnique.mockResolvedValue(subject);
  prisma.subject.create.mockResolvedValue(subject);
  prisma.subject.update.mockResolvedValue(subject);
  prisma.teacherSubject.count.mockResolvedValue(0);
  auditService.createLog.mockResolvedValue({});
}

function createResponse() {
  return {
    locals: {
      validated: {
        query: {},
        params: { id: SUBJECT_ID },
        body: createData
      }
    },
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis()
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  setupDefaults();
});

describe("Subjects validation", () => {
  describe("createSubjectSchema", () => {
    test("accepts valid subject data", () => {
      const result = validation.createSubjectSchema.validate(createData);
      expect(result.error).toBeUndefined();
    });

    test("trims name and description", () => {
      const result = validation.createSubjectSchema.validate({
        name: " Mathematics ",
        description: " Basic mathematics "
      });
      expect(result.error).toBeUndefined();
      expect(result.value.name).toBe("Mathematics");
      expect(result.value.description).toBe("Basic mathematics");
    });

    test.each([null, ""])("accepts description value %p", (description) => {
      const result = validation.createSubjectSchema.validate({ name: "Mathematics", description });
      expect(result.error).toBeUndefined();
    });

    test("allows omitted description", () => {
      const result = validation.createSubjectSchema.validate({ name: "Mathematics" });
      expect(result.error).toBeUndefined();
    });

    test.each([
      {},
      { description: "Description without name" },
      { name: "" },
      { name: "   " },
      { name: "a".repeat(101) },
      { name: "Mathematics", description: "a".repeat(1001) }
    ])("rejects invalid create data %p", (data) => {
      expect(validation.createSubjectSchema.validate(data).error).toBeDefined();
    });
  });

  describe("updateSubjectSchema", () => {
    test("accepts a valid name update", () => {
      expect(validation.updateSubjectSchema.validate({ name: "Physics" }).error).toBeUndefined();
    });

    test("accepts all supported update fields", () => {
      expect(
        validation.updateSubjectSchema.validate({
          name: "Physics",
          description: "Mechanics and energy",
          status: "INACTIVE"
        }).error
      ).toBeUndefined();
    });

    test("accepts null and empty description", () => {
      expect(validation.updateSubjectSchema.validate({ description: null }).error).toBeUndefined();
      expect(validation.updateSubjectSchema.validate({ description: "" }).error).toBeUndefined();
    });

    test.each([
      {},
      { status: "ARCHIVED" },
      { name: "" },
      { name: "a".repeat(101) },
      { extra: true }
    ])("rejects invalid update data %p", (data) => {
      expect(validation.updateSubjectSchema.validate(data).error).toBeDefined();
    });
  });

  describe("querySubjectsSchema", () => {
    test("accepts supported query filters", () => {
      expect(
        validation.querySubjectsSchema.validate({ search: " math ", status: "ACTIVE" }).error
      ).toBeUndefined();
    });

    test("trims search query", () => {
      const result = validation.querySubjectsSchema.validate({ search: " math " });
      expect(result.error).toBeUndefined();
      expect(result.value.search).toBe("math");
    });

    test.each([{ status: "DELETED" }, { search: "a".repeat(101) }])(
      "rejects invalid query %p",
      (query) => {
        expect(validation.querySubjectsSchema.validate(query).error).toBeDefined();
      }
    );
  });

  describe("idParamsSchema", () => {
    test("accepts a valid ObjectId", () => {
      expect(validation.idParamsSchema.validate({ id: SUBJECT_ID }).error).toBeUndefined();
    });

    test.each([{}, { id: "invalid" }, { id: "z".repeat(24) }, { id: "a".repeat(23) }])(
      "rejects invalid id params %p",
      (params) => {
        expect(validation.idParamsSchema.validate(params).error).toBeDefined();
      }
    );
  });
});

describe("Subjects service", () => {
  describe("getAll", () => {
    test("returns subjects for management users and excludes archived by default", async () => {
      await expect(service.getAll({}, admin)).resolves.toEqual([subject]);
      expect(prisma.subject.findMany).toHaveBeenCalledWith({
        where: { status: { not: "ARCHIVED" } },
        orderBy: { name: "asc" }
      });
    });

    test("applies status filter for management users", async () => {
      await service.getAll({ status: "INACTIVE" }, manager);
      expect(prisma.subject.findMany).toHaveBeenCalledWith({
        where: { status: "INACTIVE" },
        orderBy: { name: "asc" }
      });
    });

    test("applies case-insensitive search", async () => {
      await service.getAll({ search: " math " }, admin);
      expect(prisma.subject.findMany).toHaveBeenCalledWith({
        where: {
          status: { not: "ARCHIVED" },
          name: { contains: "math", mode: "insensitive" }
        },
        orderBy: { name: "asc" }
      });
    });

    test.each([teacher, educator, assistant])(
      "returns only active subjects for %s role",
      async (user) => {
        await service.getAll({}, user);
        expect(prisma.subject.findMany).toHaveBeenCalledWith({
          where: { status: "ACTIVE" },
          orderBy: { name: "asc" }
        });
      }
    );

    test("rejects unauthenticated user", async () => {
      await expectAppError(service.getAll({}, null), HTTP_STATUS.UNAUTHORIZED, "UNAUTHORIZED");
      expect(prisma.subject.findMany).not.toHaveBeenCalled();
    });

    test("rejects unsupported role", async () => {
      await expectAppError(
        service.getAll({}, { id: USER_ID, role: "PARENT" }),
        HTTP_STATUS.FORBIDDEN,
        "FORBIDDEN"
      );
    });
  });

  describe("getById", () => {
    test("returns active subject for management user", async () => {
      await expect(service.getById(SUBJECT_ID, admin)).resolves.toEqual(subject);
      expect(prisma.subject.findFirst).toHaveBeenCalledWith({
        where: { id: SUBJECT_ID, status: { not: "ARCHIVED" } }
      });
    });

    test("returns active subject for employee user", async () => {
      await service.getById(SUBJECT_ID, teacher);
      expect(prisma.subject.findFirst).toHaveBeenCalledWith({
        where: { id: SUBJECT_ID, status: "ACTIVE" }
      });
    });

    test("rejects archived or missing subject", async () => {
      prisma.subject.findFirst.mockResolvedValue(null);
      await expectAppError(
        service.getById(SUBJECT_ID, admin),
        HTTP_STATUS.NOT_FOUND,
        "SUBJECT_NOT_FOUND"
      );
    });

    test("rejects unauthenticated user", async () => {
      await expectAppError(
        service.getById(SUBJECT_ID, null),
        HTTP_STATUS.UNAUTHORIZED,
        "UNAUTHORIZED"
      );
    });

    test("rejects unsupported role", async () => {
      await expectAppError(
        service.getById(SUBJECT_ID, { id: USER_ID, role: "PARENT" }),
        HTTP_STATUS.FORBIDDEN,
        "FORBIDDEN"
      );
    });
  });

  describe("create", () => {
    test("creates subject and writes audit log", async () => {
      await expect(service.create(createData, admin)).resolves.toEqual(subject);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.subject.findFirst).toHaveBeenCalledWith({
        where: { name: { equals: "Mathematics", mode: "insensitive" } }
      });
      expect(prisma.subject.create).toHaveBeenCalledWith({
        data: { name: "Mathematics", description: "Basic mathematics", status: "ACTIVE" }
      });
      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: USER_ID,
          action: "CREATE",
          entityType: "Subject",
          entityId: SUBJECT_ID,
          after: subject
        }),
        prisma
      );
    });

    test("stores null when description is omitted", async () => {
      await service.create({ name: "Physics" }, manager);
      expect(prisma.subject.create).toHaveBeenCalledWith({
        data: { name: "Physics", description: null, status: "ACTIVE" }
      });
    });

    test("allows manager to create subject", async () => {
      await expect(service.create(createData, manager)).resolves.toEqual(subject);
    });

    test("rejects employee role from creating subject", async () => {
      await expectAppError(service.create(createData, teacher), HTTP_STATUS.FORBIDDEN, "FORBIDDEN");
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test("rejects missing user", async () => {
      await expectAppError(service.create(createData, null), HTTP_STATUS.FORBIDDEN, "FORBIDDEN");
    });

    test("rejects duplicate subject name", async () => {
      prisma.subject.findFirst.mockResolvedValue(subject);
      await expectAppError(
        service.create(createData, admin),
        HTTP_STATUS.CONFLICT,
        "SUBJECT_NAME_EXISTS"
      );
      expect(prisma.subject.create).not.toHaveBeenCalled();
    });

    test("maps Prisma unique constraint error", async () => {
      prisma.subject.create.mockRejectedValue({ code: "P2002" });
      await expectAppError(
        service.create(createData, admin),
        HTTP_STATUS.CONFLICT,
        "SUBJECT_NAME_EXISTS"
      );
    });

    test.each(["P2025", "P2003"])("maps Prisma related-record error %s", async (code) => {
      prisma.subject.create.mockRejectedValue({ code });
      await expectAppError(
        service.create(createData, admin),
        HTTP_STATUS.NOT_FOUND,
        "RELATED_RECORD_NOT_FOUND"
      );
    });

    test("rethrows unknown Prisma errors", async () => {
      const error = new Error("Database unavailable");
      prisma.subject.create.mockRejectedValue(error);
      await expect(service.create(createData, admin)).rejects.toBe(error);
    });
  });

  describe("update", () => {
    test("updates subject and writes audit log", async () => {
      const updated = { ...subject, name: "Physics" };
      prisma.subject.update.mockResolvedValue(updated);
      await expect(service.update(SUBJECT_ID, { name: " Physics " }, admin)).resolves.toEqual(
        updated
      );
      expect(prisma.subject.findUnique).toHaveBeenCalledWith({ where: { id: SUBJECT_ID } });
      expect(prisma.subject.findFirst).toHaveBeenCalledWith({
        where: { name: { equals: "Physics", mode: "insensitive" }, id: { not: SUBJECT_ID } }
      });
      expect(prisma.subject.update).toHaveBeenCalledWith({
        where: { id: SUBJECT_ID },
        data: { name: "Physics" }
      });
      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: USER_ID,
          action: "UPDATE",
          entityType: "Subject",
          entityId: SUBJECT_ID,
          before: subject,
          after: updated
        }),
        prisma
      );
    });

    test("updates only supplied description and status", async () => {
      await service.update(
        SUBJECT_ID,
        { description: "New description", status: "INACTIVE" },
        manager
      );
      expect(prisma.subject.update).toHaveBeenCalledWith({
        where: { id: SUBJECT_ID },
        data: { description: "New description", status: "INACTIVE" }
      });
    });

    test("does not check name uniqueness when name is not updated", async () => {
      await service.update(SUBJECT_ID, { description: "Updated" }, admin);
      expect(prisma.subject.findFirst).not.toHaveBeenCalled();
    });

    test("rejects missing subject", async () => {
      prisma.subject.findUnique.mockResolvedValue(null);
      await expectAppError(
        service.update(SUBJECT_ID, { name: "Physics" }, admin),
        HTTP_STATUS.NOT_FOUND,
        "SUBJECT_NOT_FOUND"
      );
      expect(prisma.subject.update).not.toHaveBeenCalled();
    });

    test("rejects archived subject", async () => {
      prisma.subject.findUnique.mockResolvedValue({ ...subject, status: "ARCHIVED" });
      await expectAppError(
        service.update(SUBJECT_ID, { name: "Physics" }, admin),
        HTTP_STATUS.NOT_FOUND,
        "SUBJECT_NOT_FOUND"
      );
    });

    test("rejects duplicate name on update", async () => {
      prisma.subject.findFirst.mockResolvedValue({ ...subject, id: OTHER_SUBJECT_ID });
      await expectAppError(
        service.update(SUBJECT_ID, { name: "Mathematics" }, admin),
        HTTP_STATUS.CONFLICT,
        "SUBJECT_NAME_EXISTS"
      );
      expect(prisma.subject.update).not.toHaveBeenCalled();
    });

    test("rejects employee role from updating subject", async () => {
      await expectAppError(
        service.update(SUBJECT_ID, { name: "Physics" }, teacher),
        HTTP_STATUS.FORBIDDEN,
        "FORBIDDEN"
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test("maps Prisma unique constraint error", async () => {
      prisma.subject.update.mockRejectedValue({ code: "P2002" });
      await expectAppError(
        service.update(SUBJECT_ID, { description: "Updated" }, admin),
        HTTP_STATUS.CONFLICT,
        "SUBJECT_NAME_EXISTS"
      );
    });

    test.each(["P2025", "P2003"])("maps Prisma related-record error %s", async (code) => {
      prisma.subject.update.mockRejectedValue({ code });
      await expectAppError(
        service.update(SUBJECT_ID, { description: "Updated" }, admin),
        HTTP_STATUS.NOT_FOUND,
        "RELATED_RECORD_NOT_FOUND"
      );
    });

    test("rethrows unknown Prisma errors", async () => {
      const error = new Error("Database unavailable");
      prisma.subject.update.mockRejectedValue(error);
      await expect(service.update(SUBJECT_ID, { description: "Updated" }, admin)).rejects.toBe(
        error
      );
    });
  });

  describe("remove", () => {
    test("archives subject and writes audit log", async () => {
      const archived = { ...subject, status: "ARCHIVED", archivedAt: new Date() };
      prisma.subject.update.mockResolvedValue(archived);
      await expect(service.remove(SUBJECT_ID, admin)).resolves.toEqual(archived);
      expect(prisma.teacherSubject.count).toHaveBeenCalledWith({
        where: { subjectId: SUBJECT_ID, employee: { status: "ACTIVE" } }
      });
      expect(prisma.subject.update).toHaveBeenCalledWith({
        where: { id: SUBJECT_ID },
        data: { status: "ARCHIVED", archivedAt: expect.any(Date) }
      });
      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: USER_ID,
          action: "ARCHIVE",
          entityType: "Subject",
          entityId: SUBJECT_ID,
          before: subject,
          after: archived
        }),
        prisma
      );
    });

    test("allows manager to archive subject", async () => {
      await expect(service.remove(SUBJECT_ID, manager)).resolves.toEqual(subject);
    });

    test("rejects when subject does not exist", async () => {
      prisma.subject.findUnique.mockResolvedValue(null);
      await expectAppError(
        service.remove(SUBJECT_ID, admin),
        HTTP_STATUS.NOT_FOUND,
        "SUBJECT_NOT_FOUND"
      );
      expect(prisma.teacherSubject.count).not.toHaveBeenCalled();
    });

    test("rejects archived subject", async () => {
      prisma.subject.findUnique.mockResolvedValue({ ...subject, status: "ARCHIVED" });
      await expectAppError(
        service.remove(SUBJECT_ID, admin),
        HTTP_STATUS.NOT_FOUND,
        "SUBJECT_NOT_FOUND"
      );
    });

    test("rejects subject with active teacher assignments", async () => {
      prisma.teacherSubject.count.mockResolvedValue(1);
      await expectAppError(
        service.remove(SUBJECT_ID, admin),
        HTTP_STATUS.CONFLICT,
        "SUBJECT_HAS_TEACHERS"
      );
      expect(prisma.subject.update).not.toHaveBeenCalled();
      expect(auditService.createLog).not.toHaveBeenCalled();
    });

    test("allows archiving when there are no active teacher assignments", async () => {
      prisma.teacherSubject.count.mockResolvedValue(0);
      await expect(service.remove(SUBJECT_ID, admin)).resolves.toEqual(subject);
      expect(prisma.subject.update).toHaveBeenCalled();
    });

    test("rejects employee role from archiving subject", async () => {
      await expectAppError(service.remove(SUBJECT_ID, teacher), HTTP_STATUS.FORBIDDEN, "FORBIDDEN");
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test("rejects missing user", async () => {
      await expectAppError(service.remove(SUBJECT_ID, null), HTTP_STATUS.FORBIDDEN, "FORBIDDEN");
    });
  });
});

describe("Subjects controller", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("getAll returns subjects", async () => {
    jest.spyOn(service, "getAll").mockResolvedValue([subject]);
    const req = { user: admin };
    const res = createResponse();
    res.locals.validated.query = { search: "math" };
    await controller.getAll(req, res);
    expect(service.getAll).toHaveBeenCalledWith({ search: "math" }, admin);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [subject] });
  });

  test("getById returns a subject", async () => {
    jest.spyOn(service, "getById").mockResolvedValue(subject);
    const req = { user: admin };
    const res = createResponse();
    await controller.getById(req, res);
    expect(service.getById).toHaveBeenCalledWith(SUBJECT_ID, admin);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: subject });
  });

  test("create returns created subject", async () => {
    jest.spyOn(service, "create").mockResolvedValue(subject);
    const req = { user: admin };
    const res = createResponse();
    await controller.create(req, res);
    expect(service.create).toHaveBeenCalledWith(createData, admin);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: subject });
  });

  test("update returns updated subject", async () => {
    const updated = { ...subject, name: "Physics" };
    jest.spyOn(service, "update").mockResolvedValue(updated);
    const req = { user: manager };
    const res = createResponse();
    res.locals.validated.body = { name: "Physics" };
    await controller.update(req, res);
    expect(service.update).toHaveBeenCalledWith(SUBJECT_ID, { name: "Physics" }, manager);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: updated });
  });

  test("remove returns no content", async () => {
    jest.spyOn(service, "remove").mockResolvedValue(undefined);
    const req = { user: admin };
    const res = createResponse();
    await controller.remove(req, res);
    expect(service.remove).toHaveBeenCalledWith(SUBJECT_ID, admin);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.NO_CONTENT);
    expect(res.send).toHaveBeenCalledTimes(1);
  });
});

describe("Subjects routes", () => {
  function getRoute(method, path) {
    return routes.stack.find(
      (layer) => layer.route && layer.route.path === path && layer.route.methods[method]
    );
  }

  function getHandlers(method, path) {
    const route = getRoute(method, path);
    expect(route).toBeDefined();
    return route.route.stack.map((layer) => layer.handle);
  }

  test("uses authentication middleware for all routes", () => {
    expect(routes.stack[0].handle).toBe(requireAuth);
  });

  test("GET / allows read roles and validates query", () => {
    const handlers = getHandlers("get", "/");
    expect(handlers[0].allowedRoles).toEqual([
      "ADMIN",
      "MANAGER",
      "TEACHER",
      "EDUCATOR",
      "ASSISTANT"
    ]);
    expect(handlers[1].schema).toBe(validation.querySubjectsSchema);
    expect(handlers[1].validationProperty).toBe("query");
    expect(handlers[2]).toBe(controller.getAll);
  });

  test("GET /:id allows read roles and validates params", () => {
    const handlers = getHandlers("get", "/:id");
    expect(handlers[0].allowedRoles).toEqual([
      "ADMIN",
      "MANAGER",
      "TEACHER",
      "EDUCATOR",
      "ASSISTANT"
    ]);
    expect(handlers[1].schema).toBe(validation.idParamsSchema);
    expect(handlers[1].validationProperty).toBe("params");
    expect(handlers[2]).toBe(controller.getById);
  });

  test("POST / allows management roles and validates body", () => {
    const handlers = getHandlers("post", "/");
    expect(handlers[0].allowedRoles).toEqual(["ADMIN", "MANAGER"]);
    expect(handlers[1].schema).toBe(validation.createSubjectSchema);
    expect(handlers[1].validationProperty).toBe("body");
    expect(handlers[2]).toBe(controller.create);
  });

  test("PATCH /:id validates params and body for management roles", () => {
    const handlers = getHandlers("patch", "/:id");
    expect(handlers[0].allowedRoles).toEqual(["ADMIN", "MANAGER"]);
    expect(handlers[1].schema).toBe(validation.idParamsSchema);
    expect(handlers[1].validationProperty).toBe("params");
    expect(handlers[2].schema).toBe(validation.updateSubjectSchema);
    expect(handlers[2].validationProperty).toBe("body");
    expect(handlers[3]).toBe(controller.update);
  });

  test("DELETE /:id allows management roles and validates params", () => {
    const handlers = getHandlers("delete", "/:id");
    expect(handlers[0].allowedRoles).toEqual(["ADMIN", "MANAGER"]);
    expect(handlers[1].schema).toBe(validation.idParamsSchema);
    expect(handlers[1].validationProperty).toBe("params");
    expect(handlers[2]).toBe(controller.remove);
  });
});
