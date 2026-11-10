
jest.mock("../../src/config/prisma", () => ({
  auditLog: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
}));

jest.mock("../../src/middleware/validate.middleware", () =>
  jest.fn(() => (req, res, next) => next()),
);

jest.mock("../../src/middleware/auth.middleware", () =>
  jest.fn((req, res, next) => next()),
);

jest.mock("../../src/middleware/rbac.middleware", () =>
  jest.fn(() => (req, res, next) => next()),
);

const prisma = require("../../src/config/prisma");
const service = require("../../src/modules/audit/audit.service");
const controller = require("../../src/modules/audit/audit.controller");

const {
  auditActionSchema,
  auditFiltersSchema,
  auditIdSchema,
} = require("../../src/modules/audit/audit.validation");

const HTTP_STATUS = require("../../src/utils/http-status");

const actorId = "507f1f77bcf86cd799439011";
const auditId = "507f1f77bcf86cd799439012";
const entityId = "507f1f77bcf86cd799439013";

const validAuditData = {
  actorId,
  action: "CREATE",
  entityType: "Child",
  entityId,
  before: null,
  after: {
    firstName: "Іван",
    lastName: "Іваненко",
  },
};

function createAuditLog(overrides = {}) {
  return {
    id: auditId,
    actorId,
    action: "CREATE",
    entityType: "Child",
    entityId,
    before: null,
    after: {
      firstName: "Іван",
      lastName: "Іваненко",
    },
    createdAt: new Date("2026-10-10T10:00:00.000Z"),
    ...overrides,
  };
}

describe("Audit validation", () => {
  describe("auditActionSchema", () => {
    test.each([
      "CREATE",
      "UPDATE",
      "DELETE",
      "ARCHIVE",
      "RESTORE",
      "PAYMENT",
      "CANCEL",
    ])("accepts action %s", (action) => {
      const result = auditActionSchema.validate(action);

      expect(result.error).toBeUndefined();
    });

    test("rejects an unsupported action", () => {
      const result = auditActionSchema.validate("LOGIN");

      expect(result.error).toBeDefined();
    });

    test("rejects an empty action", () => {
      const result = auditActionSchema.validate("");

      expect(result.error).toBeDefined();
    });
  });

  describe("auditFiltersSchema", () => {
    test("accepts empty filters and applies defaults", () => {
      const result = auditFiltersSchema.validate({});

      expect(result.error).toBeUndefined();
      expect(result.value.page).toBe(1);
      expect(result.value.limit).toBe(20);
    });

    test("accepts all valid filters", () => {
      const result = auditFiltersSchema.validate({
        from: "2026-10-01T00:00:00.000Z",
        to: "2026-10-31T23:59:59.000Z",
        actorId,
        entityType: "Child",
        action: "CREATE",
        page: 2,
        limit: 50,
      });

      expect(result.error).toBeUndefined();
    });

    test("accepts every valid audit action", () => {
      const actions = [
        "CREATE",
        "UPDATE",
        "DELETE",
        "ARCHIVE",
        "RESTORE",
        "PAYMENT",
        "CANCEL",
      ];

      actions.forEach((action) => {
        const result = auditFiltersSchema.validate({ action });

        expect(result.error).toBeUndefined();
      });
    });

    test("rejects an invalid action", () => {
      const result = auditFiltersSchema.validate({
        action: "LOGIN",
      });

      expect(result.error).toBeDefined();
    });

    test("rejects an invalid actor ID", () => {
      const result = auditFiltersSchema.validate({
        actorId: "invalid-id",
      });

      expect(result.error).toBeDefined();
    });

    test("rejects an invalid date", () => {
      const result = auditFiltersSchema.validate({
        from: "not-a-date",
      });

      expect(result.error).toBeDefined();
    });

    test("rejects a reversed date range", () => {
      const result = auditFiltersSchema.validate({
        from: "2026-10-31T00:00:00.000Z",
        to: "2026-10-01T00:00:00.000Z",
      });

      expect(result.error).toBeDefined();
      expect(result.error.message).toContain(
        '"from" must be earlier than or equal to "to"',
      );
    });

    test("accepts equal from and to dates", () => {
      const result = auditFiltersSchema.validate({
        from: "2026-10-10T10:00:00.000Z",
        to: "2026-10-10T10:00:00.000Z",
      });

      expect(result.error).toBeUndefined();
    });

    test("trims entityType", () => {
      const result = auditFiltersSchema.validate({
        entityType: "  Child  ",
      });

      expect(result.error).toBeUndefined();
      expect(result.value.entityType).toBe("Child");
    });

    test("rejects an empty entityType", () => {
      const result = auditFiltersSchema.validate({
        entityType: "   ",
      });

      expect(result.error).toBeDefined();
    });

    test("rejects entityType longer than 100 characters", () => {
      const result = auditFiltersSchema.validate({
        entityType: "a".repeat(101),
      });

      expect(result.error).toBeDefined();
    });

    test("rejects page less than 1", () => {
      const result = auditFiltersSchema.validate({
        page: 0,
      });

      expect(result.error).toBeDefined();
    });

    test("rejects a non-integer page", () => {
      const result = auditFiltersSchema.validate({
        page: 1.5,
      });

      expect(result.error).toBeDefined();
    });

    test("rejects limit less than 1", () => {
      const result = auditFiltersSchema.validate({
        limit: 0,
      });

      expect(result.error).toBeDefined();
    });

    test("rejects limit greater than 100", () => {
      const result = auditFiltersSchema.validate({
        limit: 101,
      });

      expect(result.error).toBeDefined();
    });

    test("rejects a non-integer limit", () => {
      const result = auditFiltersSchema.validate({
        limit: 10.5,
      });

      expect(result.error).toBeDefined();
    });

    test("accepts the maximum limit", () => {
      const result = auditFiltersSchema.validate({
        limit: 100,
      });

      expect(result.error).toBeUndefined();
    });
  });

  describe("auditIdSchema", () => {
    test("accepts a valid MongoDB ObjectId", () => {
      const result = auditIdSchema.validate({
        id: auditId,
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects an invalid ID", () => {
      const result = auditIdSchema.validate({
        id: "invalid",
      });

      expect(result.error).toBeDefined();
    });

    test("rejects a missing ID", () => {
      const result = auditIdSchema.validate({});

      expect(result.error).toBeDefined();
    });

    test("accepts an uppercase hexadecimal ID", () => {
      const result = auditIdSchema.validate({
        id: "507F1F77BCF86CD799439012",
      });

      expect(result.error).toBeUndefined();
    });
  });
});

describe("Audit service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("prepareSnapshot", () => {
    test("returns null for null", () => {
      expect(service.prepareSnapshot(null)).toBeNull();
    });

    test("returns null for undefined", () => {
      expect(service.prepareSnapshot(undefined)).toBeNull();
    });

    test("converts Date to ISO string", () => {
      const date = new Date("2026-10-10T10:00:00.000Z");

      expect(service.prepareSnapshot(date)).toBe(
        "2026-10-10T10:00:00.000Z",
      );
    });

    test("converts BigInt to string", () => {
      expect(service.prepareSnapshot(123456789n)).toBe("123456789");
    });

    test("returns string values unchanged", () => {
      expect(service.prepareSnapshot("test")).toBe("test");
    });

    test("returns number values unchanged", () => {
      expect(service.prepareSnapshot(123)).toBe(123);
    });

    test("returns boolean values unchanged", () => {
      expect(service.prepareSnapshot(true)).toBe(true);
    });

    test("converts array values recursively", () => {
      const result = service.prepareSnapshot([
        123n,
        new Date("2026-10-10T10:00:00.000Z"),
        null,
        {
          name: "Іван",
          password: "secret",
        },
      ]);

      expect(result).toEqual([
        "123",
        "2026-10-10T10:00:00.000Z",
        null,
        {
          name: "Іван",
        },
      ]);
    });

    test("removes password fields", () => {
      const result = service.prepareSnapshot({
        username: "admin",
        password: "secret",
      });

      expect(result).toEqual({
        username: "admin",
      });
    });

    test("removes token fields", () => {
      const result = service.prepareSnapshot({
        accessToken: "access",
        refreshToken: "refresh",
        name: "Іван",
      });

      expect(result).toEqual({
        name: "Іван",
      });
    });

    test("removes secret fields", () => {
      const result = service.prepareSnapshot({
        secretKey: "secret",
        name: "Іван",
      });

      expect(result).toEqual({
        name: "Іван",
      });
    });

    test("removes authorization fields", () => {
      const result = service.prepareSnapshot({
        authorization: "Bearer token",
        name: "Іван",
      });

      expect(result).toEqual({
        name: "Іван",
      });
    });

    test("removes cookie fields", () => {
      const result = service.prepareSnapshot({
        cookie: "session",
        name: "Іван",
      });

      expect(result).toEqual({
        name: "Іван",
      });
    });

    test("removes API key fields", () => {
      const result = service.prepareSnapshot({
        apiKey: "secret",
        api_key: "secret",
        name: "Іван",
      });

      expect(result).toEqual({
        name: "Іван",
      });
    });

    test("removes credential fields", () => {
      const result = service.prepareSnapshot({
        credentials: "secret",
        name: "Іван",
      });

      expect(result).toEqual({
        name: "Іван",
      });
    });

    test("removes secret fields recursively", () => {
      const result = service.prepareSnapshot({
        user: {
          name: "Іван",
          password: "secret",
          profile: {
            accessToken: "token",
            age: 20,
          },
        },
      });

      expect(result).toEqual({
        user: {
          name: "Іван",
          profile: {
            age: 20,
          },
        },
      });
    });

    test("does not include undefined object properties", () => {
      const result = service.prepareSnapshot({
        name: "Іван",
        surname: undefined,
      });

      expect(result).toEqual({
        name: "Іван",
      });
    });

    test("handles nested arrays and objects", () => {
      const result = service.prepareSnapshot({
        items: [
          {
            id: 1,
            password: "secret",
          },
          {
            id: 2,
            token: "secret",
          },
        ],
      });

      expect(result).toEqual({
        items: [
          { id: 1 },
          { id: 2 },
        ],
      });
    });
  });

  describe("createLog", () => {
    test("creates an audit log", async () => {
      const log = createAuditLog();

      prisma.auditLog.create.mockResolvedValue(log);

      const result = await service.createLog(validAuditData);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId,
          action: "CREATE",
          entityType: "Child",
          entityId,
          before: null,
          after: {
            firstName: "Іван",
            lastName: "Іваненко",
          },
        },
      });

      expect(result).toBe(log);
    });

    test("creates an audit log with default values", async () => {
      prisma.auditLog.create.mockResolvedValue(createAuditLog());

      await service.createLog({
        action: "DELETE",
        entityType: "Child",
        entityId,
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: null,
          action: "DELETE",
          entityType: "Child",
          entityId,
          before: null,
          after: null,
        },
      });
    });

    test("trims entityType and entityId", async () => {
      prisma.auditLog.create.mockResolvedValue(createAuditLog());

      await service.createLog({
        action: "CREATE",
        entityType: "  Child  ",
        entityId: `  ${entityId}  `,
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entityType: "Child",
          entityId,
        }),
      });
    });

    test("converts BigInt and Date values in snapshots", async () => {
      prisma.auditLog.create.mockResolvedValue(createAuditLog());

      const date = new Date("2026-10-10T10:00:00.000Z");

      await service.createLog({
        action: "UPDATE",
        entityType: "Invoice",
        entityId,
        before: {
          amount: 1000n,
          createdAt: date,
          password: "secret",
        },
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          before: {
            amount: "1000",
            createdAt: "2026-10-10T10:00:00.000Z",
          },
        }),
      });
    });

    test("uses the supplied transaction", async () => {
      const tx = {
        auditLog: {
          create: jest.fn().mockResolvedValue(createAuditLog()),
        },
      };

      await service.createLog(validAuditData, tx);

      expect(tx.auditLog.create).toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    test("rejects an invalid action", async () => {
      await expect(
        service.createLog({
          ...validAuditData,
          action: "LOGIN",
        }),
      ).rejects.toMatchObject({
        message: "Invalid audit action",
        code: "INVALID_AUDIT_ACTION",
        statusCode: HTTP_STATUS.UNPROCESSABLE_ENTITY,
      });

      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    test("rejects a missing action", async () => {
      await expect(
        service.createLog({
          entityType: "Child",
          entityId,
        }),
      ).rejects.toThrow("Invalid audit action");
    });

    test("rejects a missing entityType", async () => {
      await expect(
        service.createLog({
          action: "CREATE",
          entityId,
        }),
      ).rejects.toMatchObject({
        message: "Entity type and entity ID are required",
        code: "INVALID_AUDIT_ENTITY",
      });
    });

    test("rejects an empty entityType", async () => {
      await expect(
        service.createLog({
          action: "CREATE",
          entityType: "   ",
          entityId,
        }),
      ).rejects.toThrow("Entity type and entity ID are required");
    });

    test("rejects a missing entityId", async () => {
      await expect(
        service.createLog({
          action: "CREATE",
          entityType: "Child",
        }),
      ).rejects.toThrow("Entity type and entity ID are required");
    });

    test("rejects an empty entityId", async () => {
      await expect(
        service.createLog({
          action: "CREATE",
          entityType: "Child",
          entityId: "   ",
        }),
      ).rejects.toThrow("Entity type and entity ID are required");
    });

    test("rejects an invalid actor ID", async () => {
      await expect(
        service.createLog({
          ...validAuditData,
          actorId: "invalid-id",
        }),
      ).rejects.toMatchObject({
        message: "Invalid audit actor ID",
        code: "INVALID_AUDIT_ACTOR",
      });

      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    test("rejects a non-string actor ID", async () => {
      await expect(
        service.createLog({
          ...validAuditData,
          actorId: 123,
        }),
      ).rejects.toThrow("Invalid audit actor ID");
    });

    test("accepts a null actor ID", async () => {
      prisma.auditLog.create.mockResolvedValue(createAuditLog());

      await service.createLog({
        ...validAuditData,
        actorId: null,
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: null,
        }),
      });
    });

    test("accepts an uppercase hexadecimal actor ID", async () => {
      prisma.auditLog.create.mockResolvedValue(createAuditLog());

      await service.createLog({
        ...validAuditData,
        actorId: "507F1F77BCF86CD799439011",
      });

      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe("getAll", () => {
    test("returns audit logs with pagination", async () => {
      const items = [createAuditLog()];

      prisma.auditLog.findMany.mockResolvedValue(items);
      prisma.auditLog.count.mockResolvedValue(45);
      prisma.$transaction.mockResolvedValue([items, 45]);

      const result = await service.getAll({});

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: {
          createdAt: "desc",
        },
        skip: 0,
        take: 20,
      });

      expect(prisma.auditLog.count).toHaveBeenCalledWith({
        where: {},
      });

      expect(result).toEqual({
        items,
        pagination: {
          page: 1,
          limit: 20,
          total: 45,
          totalPages: 3,
        },
      });
    });

    test("applies custom page and limit", async () => {
      prisma.$transaction.mockResolvedValue([[], 100]);

      const result = await service.getAll({
        page: 3,
        limit: 10,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );

      expect(result.pagination).toEqual({
        page: 3,
        limit: 10,
        total: 100,
        totalPages: 10,
      });
    });

    test("filters by from date", async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.getAll({
        from: "2026-10-01T00:00:00.000Z",
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            createdAt: {
              gte: "2026-10-01T00:00:00.000Z",
            },
          },
        }),
      );
    });

    test("filters by to date", async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.getAll({
        to: "2026-10-31T23:59:59.000Z",
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            createdAt: {
              lte: "2026-10-31T23:59:59.000Z",
            },
          },
        }),
      );
    });

    test("filters by date range", async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.getAll({
        from: "2026-10-01T00:00:00.000Z",
        to: "2026-10-31T23:59:59.000Z",
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            createdAt: {
              gte: "2026-10-01T00:00:00.000Z",
              lte: "2026-10-31T23:59:59.000Z",
            },
          },
        }),
      );
    });

    test("filters by actorId", async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.getAll({ actorId });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { actorId },
        }),
      );
    });

    test("filters by entityType", async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.getAll({ entityType: "Child" });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entityType: "Child" },
        }),
      );
    });

    test("filters by action", async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.getAll({ action: "UPDATE" });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { action: "UPDATE" },
        }),
      );
    });

    test("combines multiple filters", async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.getAll({
        from: "2026-10-01T00:00:00.000Z",
        to: "2026-10-31T23:59:59.000Z",
        actorId,
        entityType: "Child",
        action: "UPDATE",
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            createdAt: {
              gte: "2026-10-01T00:00:00.000Z",
              lte: "2026-10-31T23:59:59.000Z",
            },
            actorId,
            entityType: "Child",
            action: "UPDATE",
          },
        }),
      );
    });

    test("returns zero total pages when there are no records", async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      const result = await service.getAll({});

      expect(result.pagination.totalPages).toBe(0);
    });

    test("returns an empty items array when there are no records", async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      const result = await service.getAll({});

      expect(result.items).toEqual([]);
    });

    test("executes findMany and count in a transaction", async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.getAll({});

      expect(prisma.$transaction).toHaveBeenCalledWith([
        expect.any(Promise),
        expect.any(Promise),
      ]);
    });
  });

  describe("getById", () => {
    test("returns an audit log by ID", async () => {
      const log = createAuditLog();

      prisma.auditLog.findUnique.mockResolvedValue(log);

      const result = await service.getById(auditId);

      expect(prisma.auditLog.findUnique).toHaveBeenCalledWith({
        where: { id: auditId },
      });

      expect(result).toBe(log);
    });

    test("throws when the audit log does not exist", async () => {
      prisma.auditLog.findUnique.mockResolvedValue(null);

      await expect(service.getById(auditId)).rejects.toMatchObject({
        message: "Audit log not found",
        code: "AUDIT_LOG_NOT_FOUND",
        statusCode: HTTP_STATUS.NOT_FOUND,
      });
    });
  });
});

describe("Audit controller", () => {
  let res;

  beforeEach(() => {
    jest.clearAllMocks();

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      locals: {
        validated: {
          query: {
            page: 2,
            limit: 10,
          },
          params: {
            id: auditId,
          },
        },
      },
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("getAll returns audit logs and pagination", async () => {
    const result = {
      items: [createAuditLog()],
      pagination: {
        page: 2,
        limit: 10,
        total: 25,
        totalPages: 3,
      },
    };

    const spy = jest
      .spyOn(service, "getAll")
      .mockResolvedValue(result);

    await controller.getAll({}, res);

    expect(spy).toHaveBeenCalledWith({
      page: 2,
      limit: 10,
    });

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  });

  test("getById returns an audit log", async () => {
    const log = createAuditLog();

    const spy = jest
      .spyOn(service, "getById")
      .mockResolvedValue(log);

    await controller.getById({}, res);

    expect(spy).toHaveBeenCalledWith(auditId);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: log,
    });
  });

  test("getAll propagates service errors", async () => {
    jest
      .spyOn(service, "getAll")
      .mockRejectedValue(new Error("Database error"));

    await expect(controller.getAll({}, res)).rejects.toThrow(
      "Database error",
    );
  });

  test("getById propagates service errors", async () => {
    jest
      .spyOn(service, "getById")
      .mockRejectedValue(new Error("Audit log not found"));

    await expect(controller.getById({}, res)).rejects.toThrow(
      "Audit log not found",
    );
  });
});

describe("Audit routes", () => {
  test("registers all audit endpoints", () => {
    const router = require("../../src/modules/audit/audit.routes");

    const routes = router.stack
      .filter((layer) => layer.route)
      .map((layer) => ({
        path: layer.route.path,
        method: Object.keys(layer.route.methods)[0],
      }));

    expect(routes).toEqual([
      { path: "/", method: "get" },
      { path: "/:id", method: "get" },
    ]);
  });

  test("registers authentication and authorization middleware", () => {
    const router = require("../../src/modules/audit/audit.routes");

    const middlewareLayers = router.stack.filter(
      (layer) => !layer.route,
    );

    expect(middlewareLayers.length).toBeGreaterThan(0);
  });
});
