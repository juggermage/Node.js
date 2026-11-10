
jest.mock("../../src/config/prisma", () => {
  const prisma = {
    parent: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    childParent: {
      findMany: jest.fn()
    },
    $transaction: jest.fn()
  };

  prisma.$transaction.mockImplementation((operation) => {
    if (typeof operation === "function") {
      return operation(prisma);
    }

    return Promise.all(operation);
  });

  return prisma;
});

jest.mock("../../src/modules/audit/audit.service", () => ({
  createLog: jest.fn().mockResolvedValue(undefined)
}));

jest.mock("../../src/middleware/auth.middleware", () =>
  jest.fn((req, res, next) => next())
);

jest.mock("../../src/middleware/rbac.middleware", () =>
  jest.fn((...roles) => {
    const middleware = (req, res, next) => next();
    middleware.allowedRoles = roles;
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
const service = require("../../src/modules/parents/parents.service");
const controller = require("../../src/modules/parents/parents.controller");

const {
  idParamsSchema,
  createParentSchema,
  updateParentSchema,
  queryParentsSchema
} = require("../../src/modules/parents/parents.validation");

const router = require("../../src/modules/parents/parents.routes");

const PARENT_ID = "507f1f77bcf86cd799439011";
const USER_ID = "507f1f77bcf86cd799439012";
const OTHER_USER_ID = "507f1f77bcf86cd799439014";
const CHILD_ID = "507f1f77bcf86cd799439013";

const ADMIN = {
  id: USER_ID,
  role: "ADMIN"
};

const MANAGER = {
  id: OTHER_USER_ID,
  role: "MANAGER"
};

const PARENT_USER = {
  id: USER_ID,
  role: "PARENT"
};

const TEACHER = {
  id: OTHER_USER_ID,
  role: "TEACHER"
};

const parent = {
  id: PARENT_ID,
  firstName: "Іван",
  lastName: "Іваненко",
  phone: "+380501234567",
  email: "ivan@example.com",
  status: "ACTIVE",
  archivedAt: null
};

const validParentData = {
  firstName: "Іван",
  lastName: "Іваненко",
  phone: "+380501234567",
  email: "ivan@example.com"
};

function resetDatabase() {
  prisma.parent.findFirst.mockReset();
  prisma.parent.findMany.mockReset();
  prisma.parent.count.mockReset();
  prisma.parent.create.mockReset();
  prisma.parent.update.mockReset();
  prisma.childParent.findMany.mockReset();
  prisma.$transaction.mockReset();

  prisma.$transaction.mockImplementation((operation) => {
    if (typeof operation === "function") {
      return operation(prisma);
    }

    return Promise.all(operation);
  });

  prisma.parent.findFirst.mockImplementation(({ where } = {}) => {
    if (where?.email) {
      return Promise.resolve(null);
    }

    if (where?.id === PARENT_ID || where?.userId === USER_ID) {
      return Promise.resolve(parent);
    }

    return Promise.resolve(null);
  });

  prisma.parent.findMany.mockResolvedValue([parent]);
  prisma.parent.count.mockResolvedValue(1);
  prisma.parent.create.mockResolvedValue(parent);
  prisma.parent.update.mockResolvedValue(parent);
  prisma.childParent.findMany.mockResolvedValue([]);

  auditService.createLog.mockReset();
  auditService.createLog.mockResolvedValue(undefined);
}

beforeEach(() => {
  jest.clearAllMocks();
  resetDatabase();
});

describe("Parents Validation", () => {
  describe("idParamsSchema", () => {
    test("accepts a valid ObjectId", () => {
      const result = idParamsSchema.validate({ id: PARENT_ID });

      expect(result.error).toBeUndefined();
    });

    test("rejects an invalid ObjectId", () => {
      const result = idParamsSchema.validate({ id: "invalid-id" });

      expect(result.error).toBeDefined();
    });

    test("rejects an ObjectId with incorrect length", () => {
      const result = idParamsSchema.validate({
        id: "507f1f77bcf86cd79943901"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects a missing id", () => {
      const result = idParamsSchema.validate({});

      expect(result.error).toBeDefined();
    });
  });

  describe("createParentSchema", () => {
    test("accepts valid parent data", () => {
      const result = createParentSchema.validate(validParentData);

      expect(result.error).toBeUndefined();
    });

    test("requires firstName", () => {
      const result = createParentSchema.validate({
        ...validParentData,
        firstName: undefined
      });

      expect(result.error).toBeDefined();
    });

    test("requires lastName", () => {
      const result = createParentSchema.validate({
        ...validParentData,
        lastName: undefined
      });

      expect(result.error).toBeDefined();
    });

    test("requires phone", () => {
      const result = createParentSchema.validate({
        ...validParentData,
        phone: undefined
      });

      expect(result.error).toBeDefined();
    });

    test("rejects an empty firstName", () => {
      const result = createParentSchema.validate({
        ...validParentData,
        firstName: "   "
      });

      expect(result.error).toBeDefined();
    });

    test("rejects an empty lastName", () => {
      const result = createParentSchema.validate({
        ...validParentData,
        lastName: "   "
      });

      expect(result.error).toBeDefined();
    });

    test("rejects firstName longer than 100 characters", () => {
      const result = createParentSchema.validate({
        ...validParentData,
        firstName: "A".repeat(101)
      });

      expect(result.error).toBeDefined();
    });

    test("rejects lastName longer than 100 characters", () => {
      const result = createParentSchema.validate({
        ...validParentData,
        lastName: "A".repeat(101)
      });

      expect(result.error).toBeDefined();
    });

    test("rejects an invalid phone number", () => {
      const result = createParentSchema.validate({
        ...validParentData,
        phone: "0501234567"
      });

      expect(result.error).toBeDefined();
    });

    test("accepts a missing email", () => {
      const data = { ...validParentData };
      delete data.email;

      const result = createParentSchema.validate(data);

      expect(result.error).toBeUndefined();
    });

    test("accepts an empty email", () => {
      const result = createParentSchema.validate({
        ...validParentData,
        email: ""
      });

      expect(result.error).toBeUndefined();
    });

    test("accepts a null email", () => {
      const result = createParentSchema.validate({
        ...validParentData,
        email: null
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects an invalid email", () => {
      const result = createParentSchema.validate({
        ...validParentData,
        email: "invalid-email"
      });

      expect(result.error).toBeDefined();
    });

    test("trims firstName and lastName", () => {
      const result = createParentSchema.validate({
        ...validParentData,
        firstName: "  Іван  ",
        lastName: "  Іваненко  "
      });

      expect(result.error).toBeUndefined();
      expect(result.value.firstName).toBe("Іван");
      expect(result.value.lastName).toBe("Іваненко");
    });

    test("converts email to lowercase", () => {
      const result = createParentSchema.validate({
        ...validParentData,
        email: "IVAN@EXAMPLE.COM"
      });

      expect(result.error).toBeUndefined();
      expect(result.value.email).toBe("ivan@example.com");
    });
  });

  describe("updateParentSchema", () => {
    test("accepts valid update data", () => {
      const result = updateParentSchema.validate({
        firstName: "Петро"
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects an empty update object", () => {
      const result = updateParentSchema.validate({});

      expect(result.error).toBeDefined();
    });

    test.each(["ACTIVE", "INACTIVE"])(
      "accepts status %s",
      (status) => {
        const result = updateParentSchema.validate({ status });

        expect(result.error).toBeUndefined();
      }
    );

    test("rejects ARCHIVED status", () => {
      const result = updateParentSchema.validate({
        status: "ARCHIVED"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects an unknown status", () => {
      const result = updateParentSchema.validate({
        status: "UNKNOWN"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects an invalid phone", () => {
      const result = updateParentSchema.validate({
        phone: "12345"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects an invalid email", () => {
      const result = updateParentSchema.validate({
        email: "wrong-email"
      });

      expect(result.error).toBeDefined();
    });

    test("accepts a null email", () => {
      const result = updateParentSchema.validate({
        email: null
      });

      expect(result.error).toBeUndefined();
    });
  });

  describe("queryParentsSchema", () => {
    test("accepts valid query parameters", () => {
      const result = queryParentsSchema.validate({
        search: "Іван",
        status: "ACTIVE",
        page: 2,
        limit: 10
      });

      expect(result.error).toBeUndefined();
    });

    test("sets default pagination values", () => {
      const result = queryParentsSchema.validate({});

      expect(result.error).toBeUndefined();
      expect(result.value.page).toBe(1);
      expect(result.value.limit).toBe(20);
    });

    test.each(["ACTIVE", "INACTIVE", "ARCHIVED"])(
      "accepts status %s",
      (status) => {
        const result = queryParentsSchema.validate({ status });

        expect(result.error).toBeUndefined();
      }
    );

    test("rejects an invalid status", () => {
      const result = queryParentsSchema.validate({
        status: "UNKNOWN"
      });

      expect(result.error).toBeDefined();
    });

    test.each([0, -1, 1.5])(
      "rejects invalid page value %s",
      (page) => {
        const result = queryParentsSchema.validate({ page });

        expect(result.error).toBeDefined();
      }
    );

    test.each([0, 101, 10.5])(
      "rejects invalid limit value %s",
      (limit) => {
        const result = queryParentsSchema.validate({ limit });

        expect(result.error).toBeDefined();
      }
    );

    test("rejects search longer than 100 characters", () => {
      const result = queryParentsSchema.validate({
        search: "A".repeat(101)
      });

      expect(result.error).toBeDefined();
    });

    test("accepts an empty search", () => {
      const result = queryParentsSchema.validate({
        search: ""
      });

      expect(result.error).toBeUndefined();
    });
  });
});

describe("Parents Controller", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function createResponse() {
    return {
      locals: {
        validated: {
          query: {},
          params: {},
          body: {}
        }
      },
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  }

  test("getAll returns parents and pagination", async () => {
    const result = {
      items: [parent],
      pagination: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1
      }
    };

    jest.spyOn(service, "getAll").mockResolvedValue(result);

    const req = { user: ADMIN };
    const res = createResponse();

    res.locals.validated.query = {
      page: 1,
      limit: 20
    };

    await controller.getAll(req, res);

    expect(service.getAll).toHaveBeenCalledWith(
      { page: 1, limit: 20 },
      ADMIN
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: result.items,
      pagination: result.pagination
    });
  });

  test("getById returns a parent", async () => {
    jest.spyOn(service, "getById").mockResolvedValue(parent);

    const req = { user: ADMIN };
    const res = createResponse();

    res.locals.validated.params.id = PARENT_ID;

    await controller.getById(req, res);

    expect(service.getById).toHaveBeenCalledWith(PARENT_ID, ADMIN);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: parent
    });
  });

  test("create returns status 201", async () => {
    jest.spyOn(service, "create").mockResolvedValue(parent);

    const req = { user: ADMIN };
    const res = createResponse();

    res.locals.validated.body = validParentData;

    await controller.create(req, res);

    expect(service.create).toHaveBeenCalledWith(
      validParentData,
      ADMIN
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: parent
    });
  });

  test("update returns updated parent", async () => {
    jest.spyOn(service, "update").mockResolvedValue(parent);

    const req = { user: ADMIN };
    const res = createResponse();

    res.locals.validated.params.id = PARENT_ID;
    res.locals.validated.body = { firstName: "Петро" };

    await controller.update(req, res);

    expect(service.update).toHaveBeenCalledWith(
      PARENT_ID,
      { firstName: "Петро" },
      ADMIN
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: parent
    });
  });

  test("remove returns status 204", async () => {
    jest.spyOn(service, "remove").mockResolvedValue(undefined);

    const req = { user: ADMIN };
    const res = createResponse();

    res.locals.validated.params.id = PARENT_ID;

    await controller.remove(req, res);

    expect(service.remove).toHaveBeenCalledWith(PARENT_ID, ADMIN);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalled();
  });

  test("getChildren returns children", async () => {
    const children = [
      {
        childId: CHILD_ID,
        child: {
          id: CHILD_ID,
          firstName: "Олена"
        }
      }
    ];

    jest.spyOn(service, "getChildren").mockResolvedValue(children);

    const req = { user: ADMIN };
    const res = createResponse();

    res.locals.validated.params.id = PARENT_ID;

    await controller.getChildren(req, res);

    expect(service.getChildren).toHaveBeenCalledWith(
      PARENT_ID,
      ADMIN
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: children
    });
  });
});

describe("Parents Routes", () => {
  function getRoute(method, path) {
    return router.stack.find(
      (layer) =>
        layer.route &&
        layer.route.path === path &&
        layer.route.methods[method]
    );
  }

  function getValidation(route, property) {
    return route.route.stack.find(
      (layer) =>
        layer.handle.validationProperty === property
    );
  }

  test("uses authentication middleware", () => {
    const requireAuth = require("../../src/middleware/auth.middleware");

    expect(
      router.stack.some((layer) => layer.handle === requireAuth)
    ).toBe(true);
  });

  test.each([
    ["get", "/"],
    ["post", "/"],
    ["get", "/:id"],
    ["get", "/:id/children"],
    ["patch", "/:id"],
    ["delete", "/:id"]
  ])("registers %s %s", (method, path) => {
    const route = getRoute(method, path);

    expect(route).toBeDefined();
  });

  test("GET / uses query validation", () => {
    const route = getRoute("get", "/");

    expect(getValidation(route, "query")).toBeDefined();
  });

  test("POST / uses body validation", () => {
    const route = getRoute("post", "/");

    expect(getValidation(route, "body")).toBeDefined();
  });

  test("GET /:id uses params validation", () => {
    const route = getRoute("get", "/:id");

    expect(getValidation(route, "params")).toBeDefined();
  });

  test("GET /:id/children uses params validation", () => {
    expect(
      getValidation(getRoute("get", "/:id/children"), "params")
    ).toBeDefined();
  });

  test("PATCH /:id uses params and body validation", () => {
    const route = getRoute("patch", "/:id");

    expect(getValidation(route, "params")).toBeDefined();
    expect(getValidation(route, "body")).toBeDefined();
  });

  test("DELETE /:id uses params validation", () => {
    const route = getRoute("delete", "/:id");

    expect(getValidation(route, "params")).toBeDefined();
  });

  test("GET routes allow ADMIN, MANAGER and PARENT", () => {
    const routes = [
      getRoute("get", "/"),
      getRoute("get", "/:id"),
      getRoute("get", "/:id/children")
    ];

    for (const route of routes) {
      const accessMiddleware = route.route.stack.find(
        (layer) =>
          Array.isArray(layer.handle.allowedRoles)
      );

      expect(accessMiddleware).toBeDefined();
      expect(accessMiddleware.handle.allowedRoles).toEqual([
        "ADMIN",
        "MANAGER",
        "PARENT"
      ]);
    }
  });

  test("POST, PATCH and DELETE routes allow ADMIN and MANAGER", () => {
    const routes = [
      getRoute("post", "/"),
      getRoute("patch", "/:id"),
      getRoute("delete", "/:id")
    ];

    for (const route of routes) {
      const accessMiddleware = route.route.stack.find(
        (layer) =>
          Array.isArray(layer.handle.allowedRoles)
      );

      expect(accessMiddleware).toBeDefined();
      expect(accessMiddleware.handle.allowedRoles).toEqual([
        "ADMIN",
        "MANAGER"
      ]);
    }
  });
});

describe("Parents Service", () => {
  describe("getAll", () => {
    test("returns parents for ADMIN", async () => {
      const result = await service.getAll({}, ADMIN);

      expect(result.items).toEqual([parent]);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1
      });
    });

    test("returns parents for MANAGER", async () => {
      const result = await service.getAll({}, MANAGER);

      expect(result.items).toEqual([parent]);
    });

    test("rejects unauthorized users", async () => {
      await expect(
        service.getAll({}, TEACHER)
      ).rejects.toMatchObject({
        code: "FORBIDDEN"
      });
    });

    test("rejects a missing user", async () => {
      await expect(
        service.getAll({}, null)
      ).rejects.toMatchObject({
        code: "FORBIDDEN"
      });
    });

    test("uses default pagination", async () => {
      await service.getAll({}, ADMIN);

      expect(prisma.parent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20
        })
      );
    });

    test("calculates pagination offset", async () => {
      await service.getAll(
        { page: 3, limit: 10 },
        ADMIN
      );

      expect(prisma.parent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10
        })
      );
    });

    test("calculates total pages", async () => {
      prisma.parent.count.mockResolvedValue(45);

      const result = await service.getAll(
        { page: 1, limit: 20 },
        ADMIN
      );

      expect(result.pagination.totalPages).toBe(3);
    });

    test("filters by status", async () => {
      await service.getAll(
        { status: "INACTIVE" },
        ADMIN
      );

      expect(prisma.parent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: "INACTIVE"
          }
        })
      );
    });

    test("excludes archived parents by default", async () => {
      await service.getAll({}, ADMIN);

      expect(prisma.parent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: { not: "ARCHIVED" }
          }
        })
      );
    });

    test("searches by firstName, lastName, email and phone", async () => {
      await service.getAll(
        { search: "Іван" },
        ADMIN
      );

      const query = prisma.parent.findMany.mock.calls[0][0];

      expect(query.where.OR).toHaveLength(4);
      expect(query.where.OR[0]).toHaveProperty("firstName");
      expect(query.where.OR[1]).toHaveProperty("lastName");
      expect(query.where.OR[2]).toHaveProperty("email");
      expect(query.where.OR[3]).toHaveProperty("phone");
    });

    test("trims the search value", async () => {
      await service.getAll(
        { search: "  Іван  " },
        ADMIN
      );

      const query = prisma.parent.findMany.mock.calls[0][0];

      expect(query.where.OR[0].firstName.contains).toBe("Іван");
    });

    test("sorts parents by lastName and firstName", async () => {
      await service.getAll({}, ADMIN);

      expect(prisma.parent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [
            { lastName: "asc" },
            { firstName: "asc" }
          ]
        })
      );
    });

    test("returns own profile for PARENT", async () => {
      const result = await service.getAll({}, PARENT_USER);

      expect(result.items).toEqual([parent]);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 1,
        total: 1,
        totalPages: 1
      });

      expect(prisma.childParent.findMany).toHaveBeenCalledWith({
        where: {
          parentId: PARENT_ID,
          endDate: null
        },
        include: {
          child: true
        }
      });
    });

    test("includes own children for PARENT", async () => {
      const child = {
        id: CHILD_ID,
        firstName: "Олена"
      };

      prisma.childParent.findMany.mockResolvedValue([
        { child }
      ]);

      const result = await service.getAll({}, PARENT_USER);

      expect(result.children).toEqual([child]);
    });

    test("rejects PARENT without a parent profile", async () => {
      prisma.parent.findFirst.mockResolvedValue(null);

      await expect(
        service.getAll({}, PARENT_USER)
      ).rejects.toMatchObject({
        code: "PARENT_NOT_FOUND"
      });
    });
  });

  describe("getById", () => {
    test("returns a parent for ADMIN", async () => {
      const result = await service.getById(PARENT_ID, ADMIN);

      expect(result).toEqual(parent);
    });

    test("returns a parent for MANAGER", async () => {
      const result = await service.getById(PARENT_ID, MANAGER);

      expect(result).toEqual(parent);
    });

    test("allows PARENT to access own profile", async () => {
      const result = await service.getById(PARENT_ID, PARENT_USER);

      expect(result).toEqual(parent);
    });

    test("rejects PARENT accessing another profile", async () => {
      await expect(
        service.getById(CHILD_ID, PARENT_USER)
      ).rejects.toMatchObject({
        code: "FORBIDDEN"
      });
    });

    test("rejects unauthorized roles", async () => {
      await expect(
        service.getById(PARENT_ID, TEACHER)
      ).rejects.toMatchObject({
        code: "FORBIDDEN"
      });
    });

    test("rejects a missing parent", async () => {
      prisma.parent.findFirst.mockResolvedValue(null);

      await expect(
        service.getById(PARENT_ID, ADMIN)
      ).rejects.toMatchObject({
        code: "PARENT_NOT_FOUND"
      });
    });

    test("searches only non-archived parents", async () => {
      await service.getById(PARENT_ID, ADMIN);

      expect(prisma.parent.findFirst).toHaveBeenCalledWith({
        where: {
          id: PARENT_ID,
          status: { not: "ARCHIVED" }
        }
      });
    });

    test("rejects PARENT without own profile", async () => {
      prisma.parent.findFirst.mockResolvedValue(null);

      await expect(
        service.getById(PARENT_ID, PARENT_USER)
      ).rejects.toMatchObject({
        code: "PARENT_NOT_FOUND"
      });
    });
  });

  describe("create", () => {
    test("creates a parent", async () => {
      const result = await service.create(validParentData, ADMIN);

      expect(result).toEqual(parent);
      expect(prisma.parent.create).toHaveBeenCalled();
    });

    test("allows MANAGER to create a parent", async () => {
      await service.create(validParentData, MANAGER);

      expect(prisma.parent.create).toHaveBeenCalled();
    });

    test("rejects PARENT creating a profile", async () => {
      await expect(
        service.create(validParentData, PARENT_USER)
      ).rejects.toMatchObject({
        code: "FORBIDDEN"
      });
    });

    test("rejects unauthorized roles", async () => {
      await expect(
        service.create(validParentData, TEACHER)
      ).rejects.toMatchObject({
        code: "FORBIDDEN"
      });
    });

    test("trims firstName and lastName", async () => {
      await service.create(
        {
          ...validParentData,
          firstName: "  Іван  ",
          lastName: "  Іваненко  "
        },
        ADMIN
      );

      expect(prisma.parent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          firstName: "Іван",
          lastName: "Іваненко"
        })
      });
    });

    test("normalizes email to lowercase", async () => {
      await service.create(
        {
          ...validParentData,
          email: "  IVAN@EXAMPLE.COM  "
        },
        ADMIN
      );

      expect(prisma.parent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: "ivan@example.com"
        })
      });
    });

    test("converts empty email to null", async () => {
      await service.create(
        {
          ...validParentData,
          email: ""
        },
        ADMIN
      );

      expect(prisma.parent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: null
        })
      });
    });

    test("creates parent with ACTIVE status", async () => {
      await service.create(validParentData, ADMIN);

      expect(prisma.parent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: "ACTIVE"
        })
      });
    });

    test("checks email uniqueness", async () => {
      await service.create(validParentData, ADMIN);

      expect(prisma.parent.findFirst).toHaveBeenCalledWith({
        where: {
          email: {
            equals: "ivan@example.com",
            mode: "insensitive"
          },
          status: { not: "ARCHIVED" }
        }
      });
    });

    test("rejects an already registered email", async () => {
      prisma.parent.findFirst.mockImplementation(({ where } = {}) => {
        if (where?.email) {
          return Promise.resolve(parent);
        }

        return Promise.resolve(parent);
      });

      await expect(
        service.create(validParentData, ADMIN)
      ).rejects.toMatchObject({
        code: "PARENT_EMAIL_EXISTS"
      });

      expect(prisma.parent.create).not.toHaveBeenCalled();
    });

    test("writes an audit log after creation", async () => {
      await service.create(validParentData, ADMIN);

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: USER_ID,
          action: "CREATE",
          entityType: "Parent",
          entityId: PARENT_ID,
          after: parent
        }),
        prisma
      );
    });

    test("maps Prisma P2002 error", async () => {
      prisma.parent.create.mockRejectedValue({
        code: "P2002"
      });

      await expect(
        service.create(validParentData, ADMIN)
      ).rejects.toMatchObject({
        code: "DUPLICATE_RECORD"
      });
    });
  });

  describe("update", () => {
    test("updates a parent", async () => {
      const result = await service.update(
        PARENT_ID,
        { firstName: "Петро" },
        ADMIN
      );

      expect(result).toEqual(parent);

      expect(prisma.parent.update).toHaveBeenCalledWith({
        where: { id: PARENT_ID },
        data: { firstName: "Петро" }
      });
    });

    test("allows MANAGER to update a parent", async () => {
      await service.update(
        PARENT_ID,
        { firstName: "Петро" },
        MANAGER
      );

      expect(prisma.parent.update).toHaveBeenCalled();
    });

    test("rejects PARENT updating a profile", async () => {
      await expect(
        service.update(
          PARENT_ID,
          { firstName: "Петро" },
          PARENT_USER
        )
      ).rejects.toMatchObject({
        code: "FORBIDDEN"
      });
    });

    test("rejects unauthorized roles", async () => {
      await expect(
        service.update(
          PARENT_ID,
          { firstName: "Петро" },
          TEACHER
        )
      ).rejects.toMatchObject({
        code: "FORBIDDEN"
      });
    });

    test("normalizes updated firstName and lastName", async () => {
      await service.update(
        PARENT_ID,
        {
          firstName: "  Петро  ",
          lastName: "  Петренко  "
        },
        ADMIN
      );

      expect(prisma.parent.update).toHaveBeenCalledWith({
        where: { id: PARENT_ID },
        data: {
          firstName: "Петро",
          lastName: "Петренко"
        }
      });
    });

    test("normalizes updated email", async () => {
      await service.update(
        PARENT_ID,
        { email: "  NEW@EXAMPLE.COM  " },
        ADMIN
      );

      expect(prisma.parent.update).toHaveBeenCalledWith({
        where: { id: PARENT_ID },
        data: {
          email: "new@example.com"
        }
      });
    });

    test("checks email uniqueness excluding current parent", async () => {
      await service.update(
        PARENT_ID,
        { email: "new@example.com" },
        ADMIN
      );

      expect(prisma.parent.findFirst).toHaveBeenCalledWith({
        where: {
          email: {
            equals: "new@example.com",
            mode: "insensitive"
          },
          id: { not: PARENT_ID },
          status: { not: "ARCHIVED" }
        }
      });
    });

    test("rejects an email used by another parent", async () => {
      prisma.parent.findFirst.mockImplementation(({ where } = {}) => {
        if (where?.email) {
          return Promise.resolve({
            ...parent,
            id: CHILD_ID
          });
        }

        return Promise.resolve(parent);
      });

      await expect(
        service.update(
          PARENT_ID,
          { email: "ivan@example.com" },
          ADMIN
        )
      ).rejects.toMatchObject({
        code: "PARENT_EMAIL_EXISTS"
      });

      expect(prisma.parent.update).not.toHaveBeenCalled();
    });

    test("does not check email uniqueness when email is not updated", async () => {
      await service.update(
        PARENT_ID,
        { firstName: "Петро" },
        ADMIN
      );

      const emailQueries = prisma.parent.findFirst.mock.calls.filter(
        ([args]) => args?.where?.email
      );

      expect(emailQueries).toHaveLength(0);
    });

    test("rejects updating a missing parent", async () => {
      prisma.parent.findFirst.mockResolvedValue(null);

      await expect(
        service.update(
          PARENT_ID,
          { firstName: "Петро" },
          ADMIN
        )
      ).rejects.toMatchObject({
        code: "PARENT_NOT_FOUND"
      });
    });

    test("writes an audit log after update", async () => {
      await service.update(
        PARENT_ID,
        { firstName: "Петро" },
        ADMIN
      );

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: USER_ID,
          action: "UPDATE",
          entityType: "Parent",
          entityId: PARENT_ID,
          before: parent,
          after: parent
        }),
        prisma
      );
    });

    test("maps Prisma P2002 error", async () => {
      prisma.parent.update.mockRejectedValue({
        code: "P2002"
      });

      await expect(
        service.update(
          PARENT_ID,
          { firstName: "Петро" },
          ADMIN
        )
      ).rejects.toMatchObject({
        code: "DUPLICATE_RECORD"
      });
    });

    test("maps Prisma P2025 error", async () => {
      prisma.parent.update.mockRejectedValue({
        code: "P2025"
      });

      await expect(
        service.update(
          PARENT_ID,
          { firstName: "Петро" },
          ADMIN
        )
      ).rejects.toMatchObject({
        code: "PARENT_NOT_FOUND"
      });
    });
  });

  describe("remove", () => {
    test("archives a parent", async () => {
      const result = await service.remove(PARENT_ID, ADMIN);

      expect(result).toEqual(parent);

      expect(prisma.parent.update).toHaveBeenCalledWith({
        where: { id: PARENT_ID },
        data: expect.objectContaining({
          status: "ARCHIVED",
          archivedAt: expect.any(Date)
        })
      });
    });

    test("allows MANAGER to archive a parent", async () => {
      await service.remove(PARENT_ID, MANAGER);

      expect(prisma.parent.update).toHaveBeenCalled();
    });

    test("rejects PARENT archiving a profile", async () => {
      await expect(
        service.remove(PARENT_ID, PARENT_USER)
      ).rejects.toMatchObject({
        code: "FORBIDDEN"
      });
    });

    test("rejects unauthorized roles", async () => {
      await expect(
        service.remove(PARENT_ID, TEACHER)
      ).rejects.toMatchObject({
        code: "FORBIDDEN"
      });
    });

    test("rejects archiving a missing parent", async () => {
      prisma.parent.findFirst.mockResolvedValue(null);

      await expect(
        service.remove(PARENT_ID, ADMIN)
      ).rejects.toMatchObject({
        code: "PARENT_NOT_FOUND"
      });

      expect(prisma.parent.update).not.toHaveBeenCalled();
    });

    test("writes an audit log after archiving", async () => {
      await service.remove(PARENT_ID, ADMIN);

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: USER_ID,
          action: "ARCHIVE",
          entityType: "Parent",
          entityId: PARENT_ID,
          before: parent,
          after: parent
        }),
        prisma
      );
    });
  });

  describe("getChildren", () => {
    test("returns children of a parent", async () => {
      const childRelation = {
        parentId: PARENT_ID,
        childId: CHILD_ID,
        child: {
          id: CHILD_ID,
          firstName: "Олена"
        }
      };

      prisma.childParent.findMany.mockResolvedValue([
        childRelation
      ]);

      const result = await service.getChildren(PARENT_ID, ADMIN);

      expect(result).toEqual([childRelation]);
    });

    test("allows MANAGER to get children", async () => {
      await service.getChildren(PARENT_ID, MANAGER);

      expect(prisma.childParent.findMany).toHaveBeenCalled();
    });

    test("allows PARENT to get children of own profile", async () => {
      await service.getChildren(PARENT_ID, PARENT_USER);

      expect(prisma.childParent.findMany).toHaveBeenCalled();
    });

    test("rejects PARENT accessing another parent's children", async () => {
      await expect(
        service.getChildren(CHILD_ID, PARENT_USER)
      ).rejects.toMatchObject({
        code: "FORBIDDEN"
      });
    });

    test("rejects unauthorized roles", async () => {
      await expect(
        service.getChildren(PARENT_ID, TEACHER)
      ).rejects.toMatchObject({
        code: "FORBIDDEN"
      });
    });

    test("rejects a missing parent", async () => {
      prisma.parent.findFirst.mockResolvedValue(null);

      await expect(
        service.getChildren(PARENT_ID, ADMIN)
      ).rejects.toMatchObject({
        code: "PARENT_NOT_FOUND"
      });
    });

    test("returns only active child relationships", async () => {
      await service.getChildren(PARENT_ID, ADMIN);

      expect(prisma.childParent.findMany).toHaveBeenCalledWith({
        where: {
          parentId: PARENT_ID,
          endDate: null,
          child: {
            status: { not: "ARCHIVED" }
          }
        },
        include: {
          child: true
        },
        orderBy: {
          startDate: "desc"
        }
      });
    });
  });
});
