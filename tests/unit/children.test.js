
jest.mock("../../src/config/prisma", () => ({
  $transaction: jest.fn(),
  child: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn()
  }
}));

jest.mock("../../src/modules/audit/audit.service", () => ({
  createLog: jest.fn()
}));

jest.mock("../../src/modules/children/children.service", () => ({
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
  jest.fn(() => (req, res, next) => next())
);

const prisma = require("../../src/config/prisma");
const auditService = require("../../src/modules/audit/audit.service");
const childrenService = require("../../src/modules/children/children.service");

const realService = jest.requireActual(
  "../../src/modules/children/children.service"
);

const controller = require("../../src/modules/children/children.controller");
const router = require("../../src/modules/children/children.routes");
const validation = require("../../src/modules/children/children.validation");
const HTTP_STATUS = require("../../src/utils/http-status");

describe("Children Controller", () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      user: {
        id: "user-123",
        role: "ADMIN"
      }
    };

    res = {
      locals: {
        validated: {
          body: {},
          params: {},
          query: {}
        }
      },
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  test("getAll returns children and pagination", async () => {
    const result = {
      items: [{ id: "child-1" }],
      pagination: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1
      }
    };

    const filters = {
      page: 1,
      limit: 20,
      search: "John"
    };

    res.locals.validated.query = filters;
    childrenService.getAll.mockResolvedValue(result);

    await controller.getAll(req, res);

    expect(childrenService.getAll).toHaveBeenCalledWith(filters, req.user);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: result.items,
      pagination: result.pagination
    });
  });

  test("getById returns a child", async () => {
    const child = { id: "child-1" };

    res.locals.validated.params.id = "child-1";
    childrenService.getById.mockResolvedValue(child);

    await controller.getById(req, res);

    expect(childrenService.getById).toHaveBeenCalledWith("child-1", req.user);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: child
    });
  });

  test("create creates a child", async () => {
    const body = {
      firstName: "John",
      lastName: "Smith",
      birthDate: "2023-01-01"
    };

    const child = { id: "child-1", ...body };

    res.locals.validated.body = body;
    childrenService.create.mockResolvedValue(child);

    await controller.create(req, res);

    expect(childrenService.create).toHaveBeenCalledWith(body, req.user);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: child
    });
  });

  test("update updates a child", async () => {
    const body = {
      firstName: "Jane"
    };

    const child = {
      id: "child-1",
      firstName: "Jane"
    };

    res.locals.validated.params.id = "child-1";
    res.locals.validated.body = body;
    childrenService.update.mockResolvedValue(child);

    await controller.update(req, res);

    expect(childrenService.update).toHaveBeenCalledWith(
      "child-1",
      body,
      req.user
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: child
    });
  });

  test("remove removes a child", async () => {
    res.locals.validated.params.id = "child-1";
    childrenService.remove.mockResolvedValue(undefined);

    await controller.remove(req, res);

    expect(childrenService.remove).toHaveBeenCalledWith("child-1", req.user);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.NO_CONTENT);
    expect(res.send).toHaveBeenCalled();
  });
});

describe("Children Routes", () => {
  test("registers authentication middleware", () => {
    const authMiddleware = require("../../src/middleware/auth.middleware");

    expect(
      router.stack.some((layer) => layer.handle === authMiddleware)
    ).toBe(true);
  });

  test("registers role authorization middleware", () => {
    const registeredRoles = router.stack
      .filter((layer) => layer.route)
      .flatMap((layer) => layer.route.stack)
      .map((layer) => layer.handle.allowedRoles)
      .filter(Boolean);

    expect(registeredRoles).toContainEqual([
      "ADMIN",
      "MANAGER",
      "PARENT",
      "TEACHER",
      "EDUCATOR",
      "ASSISTANT"
    ]);

    expect(registeredRoles).toContainEqual(["ADMIN", "MANAGER"]);
  });

  test("registers all routes", () => {
    const routes = router.stack
      .filter((layer) => layer.route)
      .map((layer) => ({
        path: layer.route.path,
        methods: layer.route.methods
      }));

    expect(routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/",
          methods: expect.objectContaining({ get: true })
        }),
        expect.objectContaining({
          path: "/:id",
          methods: expect.objectContaining({ get: true })
        }),
        expect.objectContaining({
          path: "/",
          methods: expect.objectContaining({ post: true })
        }),
        expect.objectContaining({
          path: "/:id",
          methods: expect.objectContaining({ patch: true })
        }),
        expect.objectContaining({
          path: "/:id",
          methods: expect.objectContaining({ delete: true })
        })
      ])
    );
  });
});

describe("Children Validation", () => {
  const validChild = {
    firstName: "John",
    lastName: "Smith",
    birthDate: "2023-01-01"
  };

  describe("createChildSchema", () => {
    test("accepts valid child data", () => {
      const result = validation.createChildSchema.validate(validChild);

      expect(result.error).toBeUndefined();
    });

    test("accepts optional dietaryNotes and notes", () => {
      const result = validation.createChildSchema.validate({
        ...validChild,
        dietaryNotes: "No nuts",
        notes: "Additional information"
      });

      expect(result.error).toBeUndefined();
    });

    test("accepts empty dietaryNotes and notes", () => {
      const result = validation.createChildSchema.validate({
        ...validChild,
        dietaryNotes: "",
        notes: ""
      });

      expect(result.error).toBeUndefined();
    });

    test("accepts null dietaryNotes and notes", () => {
      const result = validation.createChildSchema.validate({
        ...validChild,
        dietaryNotes: null,
        notes: null
      });

      expect(result.error).toBeUndefined();
    });

    test("trims firstName and lastName", () => {
      const result = validation.createChildSchema.validate({
        ...validChild,
        firstName: "  John  ",
        lastName: "  Smith  "
      });

      expect(result.error).toBeUndefined();
      expect(result.value.firstName).toBe("John");
      expect(result.value.lastName).toBe("Smith");
    });

    test("rejects missing firstName", () => {
      const data = {
        lastName: validChild.lastName,
        birthDate: validChild.birthDate
      };

      const result = validation.createChildSchema.validate(data);

      expect(result.error).toBeDefined();
    });

    test("rejects missing lastName", () => {
      const data = {
        firstName: validChild.firstName,
        birthDate: validChild.birthDate
      };

      const result = validation.createChildSchema.validate(data);

      expect(result.error).toBeDefined();
    });

    test("rejects missing birthDate", () => {
      const data = {
        firstName: validChild.firstName,
        lastName: validChild.lastName
      };

      const result = validation.createChildSchema.validate(data);

      expect(result.error).toBeDefined();
    });

    test("rejects empty firstName", () => {
      const result = validation.createChildSchema.validate({
        ...validChild,
        firstName: " "
      });

      expect(result.error).toBeDefined();
    });

    test("rejects empty lastName", () => {
      const result = validation.createChildSchema.validate({
        ...validChild,
        lastName: ""
      });

      expect(result.error).toBeDefined();
    });

    test("rejects firstName longer than 100 characters", () => {
      const result = validation.createChildSchema.validate({
        ...validChild,
        firstName: "A".repeat(101)
      });

      expect(result.error).toBeDefined();
    });

    test("rejects lastName longer than 100 characters", () => {
      const result = validation.createChildSchema.validate({
        ...validChild,
        lastName: "A".repeat(101)
      });

      expect(result.error).toBeDefined();
    });

    test("rejects invalid birthDate format", () => {
      const result = validation.createChildSchema.validate({
        ...validChild,
        birthDate: "01-01-2023"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects impossible birthDate", () => {
      const result = validation.createChildSchema.validate({
        ...validChild,
        birthDate: "2023-02-30"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects future birthDate", () => {
      const result = validation.createChildSchema.validate({
        ...validChild,
        birthDate: "2030-01-01"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects child younger than 2 years", () => {
      const today = new Date();
      const birthDate = new Date(
        Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth(), today.getUTCDate())
      );

      const date = birthDate.toISOString().slice(0, 10);

      const result = validation.createChildSchema.validate({
        ...validChild,
        birthDate: date
      });

      expect(result.error).toBeDefined();
    });

    test("rejects child older than 5 years", () => {
      const today = new Date();
      const birthDate = new Date(
        Date.UTC(today.getUTCFullYear() - 6, today.getUTCMonth(), today.getUTCDate())
      );

      const date = birthDate.toISOString().slice(0, 10);

      const result = validation.createChildSchema.validate({
        ...validChild,
        birthDate: date
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("updateChildSchema", () => {
    test("accepts valid firstName update", () => {
      const result = validation.updateChildSchema.validate({
        firstName: "Jane"
      });

      expect(result.error).toBeUndefined();
    });

    test("accepts valid lastName update", () => {
      const result = validation.updateChildSchema.validate({
        lastName: "Brown"
      });

      expect(result.error).toBeUndefined();
    });

    test("accepts valid birthDate update", () => {
      const result = validation.updateChildSchema.validate({
        birthDate: "2023-01-01"
      });

      expect(result.error).toBeUndefined();
    });

    test("accepts valid dietaryNotes update", () => {
      const result = validation.updateChildSchema.validate({
        dietaryNotes: "No nuts"
      });

      expect(result.error).toBeUndefined();
    });

    test("accepts valid notes update", () => {
      const result = validation.updateChildSchema.validate({
        notes: "Additional information"
      });

      expect(result.error).toBeUndefined();
    });

    test.each(["ACTIVE", "INACTIVE"])(
      "accepts status %s",
      (status) => {
        const result = validation.updateChildSchema.validate({
          status
        });

        expect(result.error).toBeUndefined();
      }
    );

    test("accepts multiple fields", () => {
      const result = validation.updateChildSchema.validate({
        firstName: "Jane",
        lastName: "Brown",
        status: "INACTIVE"
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects empty update", () => {
      const result = validation.updateChildSchema.validate({});

      expect(result.error).toBeDefined();
    });

    test("rejects invalid status", () => {
      const result = validation.updateChildSchema.validate({
        status: "ARCHIVED"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects invalid birthDate", () => {
      const result = validation.updateChildSchema.validate({
        birthDate: "invalid"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects firstName longer than 100 characters", () => {
      const result = validation.updateChildSchema.validate({
        firstName: "A".repeat(101)
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("childIdSchema", () => {
    test("accepts valid id", () => {
      const result = validation.childIdSchema.validate({
        id: "507f1f77bcf86cd799439011"
      });

      expect(result.error).toBeUndefined();
    });

    test("accepts uppercase hexadecimal id", () => {
      const result = validation.childIdSchema.validate({
        id: "507F1F77BCF86CD799439011"
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects invalid id", () => {
      const result = validation.childIdSchema.validate({
        id: "invalid"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects id with incorrect length", () => {
      const result = validation.childIdSchema.validate({
        id: "507f1f77bcf86cd79943901"
      });

      expect(result.error).toBeDefined();
    });

    test("requires id", () => {
      const result = validation.childIdSchema.validate({});

      expect(result.error).toBeDefined();
    });
  });

  describe("searchChildSchema", () => {
    test("accepts valid search filters", () => {
      const result = validation.searchChildSchema.validate({
        search: "John Smith",
        status: "ACTIVE",
        page: 2,
        limit: 10
      });

      expect(result.error).toBeUndefined();
      expect(result.value).toMatchObject({
        search: "John Smith",
        status: "ACTIVE",
        page: 2,
        limit: 10
      });
    });

    test("accepts all valid statuses", () => {
      for (const status of ["ACTIVE", "INACTIVE", "ARCHIVED"]) {
        const result = validation.searchChildSchema.validate({
          status
        });

        expect(result.error).toBeUndefined();
      }
    });

    test("rejects invalid status", () => {
      const result = validation.searchChildSchema.validate({
        status: "DELETED"
      });

      expect(result.error).toBeDefined();
    });

    test("uses default page and limit", () => {
      const result = validation.searchChildSchema.validate({});

      expect(result.error).toBeUndefined();
      expect(result.value.page).toBe(1);
      expect(result.value.limit).toBe(20);
    });

    test("accepts empty search", () => {
      const result = validation.searchChildSchema.validate({
        search: ""
      });

      expect(result.error).toBeUndefined();
    });

    test("trims search", () => {
      const result = validation.searchChildSchema.validate({
        search: "  John Smith  "
      });

      expect(result.error).toBeUndefined();
      expect(result.value.search).toBe("John Smith");
    });

    test("rejects search longer than 100 characters", () => {
      const result = validation.searchChildSchema.validate({
        search: "A".repeat(101)
      });

      expect(result.error).toBeDefined();
    });

    test("rejects page less than 1", () => {
      const result = validation.searchChildSchema.validate({
        page: 0
      });

      expect(result.error).toBeDefined();
    });

    test("rejects non-integer page", () => {
      const result = validation.searchChildSchema.validate({
        page: 1.5
      });

      expect(result.error).toBeDefined();
    });

    test("rejects limit less than 1", () => {
      const result = validation.searchChildSchema.validate({
        limit: 0
      });

      expect(result.error).toBeDefined();
    });

    test("rejects limit greater than 100", () => {
      const result = validation.searchChildSchema.validate({
        limit: 101
      });

      expect(result.error).toBeDefined();
    });

    test("rejects non-integer limit", () => {
      const result = validation.searchChildSchema.validate({
        limit: 10.5
      });

      expect(result.error).toBeDefined();
    });
  });
});

describe("Children Service", () => {
  const childId = "507f1f77bcf86cd799439011";

  const admin = {
    id: "admin-1",
    role: "ADMIN"
  };

  const manager = {
    id: "manager-1",
    role: "MANAGER"
  };

  const parent = {
    id: "parent-user-1",
    role: "PARENT"
  };

  const teacher = {
    id: "teacher-user-1",
    role: "TEACHER"
  };

  const activeChild = {
    id: childId,
    firstName: "John",
    lastName: "Smith",
    birthDate: new Date("2023-01-01"),
    status: "ACTIVE"
  };

  let tx;

  beforeEach(() => {
    jest.clearAllMocks();

    tx = {
      child: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn()
      }
    };

    prisma.$transaction.mockImplementation((operation) => {
      if (Array.isArray(operation)) {
        return Promise.all(operation);
      }

      return operation(tx);
    });

    prisma.child.findMany.mockResolvedValue([activeChild]);
    prisma.child.count.mockResolvedValue(1);
    prisma.child.findFirst.mockResolvedValue(activeChild);

    tx.child.create.mockResolvedValue(activeChild);
    tx.child.findFirst.mockResolvedValue(activeChild);
    tx.child.update.mockResolvedValue(activeChild);
  });

  describe("getAccessFilter", () => {
    test("returns empty filter for admin", () => {
      expect(realService.getAccessFilter(admin)).toEqual({});
    });

    test("returns empty filter for manager", () => {
      expect(realService.getAccessFilter(manager)).toEqual({});
    });

    test("returns parent access filter", () => {
      expect(realService.getAccessFilter(parent)).toEqual({
        parents: {
          some: {
            parent: {
              userId: parent.id,
              status: "ACTIVE"
            },
            endDate: null
          }
        }
      });
    });

    test("returns teacher access filter", () => {
      expect(realService.getAccessFilter(teacher)).toEqual({
        enrollments: {
          some: {
            endDate: null,
            group: {
              status: "ACTIVE",
              staffAssignments: {
                some: {
                  endDate: null,
                  employee: {
                    userId: teacher.id,
                    status: "ACTIVE",
                    role: "TEACHER"
                  }
                }
              }
            }
          }
        }
      });
    });

    test("returns employee access filter for educator", () => {
      expect(
        realService.getAccessFilter({
          id: "educator-1",
          role: "EDUCATOR"
        }).enrollments.some.group.staffAssignments.some.employee.role
      ).toBe("EDUCATOR");
    });

    test("returns employee access filter for assistant", () => {
      expect(
        realService.getAccessFilter({
          id: "assistant-1",
          role: "ASSISTANT"
        }).enrollments.some.group.staffAssignments.some.employee.role
      ).toBe("ASSISTANT");
    });

    test("rejects missing user", () => {
      expect(() => realService.getAccessFilter(null)).toThrow(
        expect.objectContaining({
          code: "UNAUTHORIZED"
        })
      );
    });

    test("rejects unauthorized role", () => {
      expect(() =>
        realService.getAccessFilter({
          id: "user-1",
          role: "STUDENT"
        })
      ).toThrow(
        expect.objectContaining({
          code: "FORBIDDEN"
        })
      );
    });
  });

  describe("ensureManagementAccess", () => {
    test("allows admin", () => {
      expect(() => realService.ensureManagementAccess(admin)).not.toThrow();
    });

    test("allows manager", () => {
      expect(() => realService.ensureManagementAccess(manager)).not.toThrow();
    });

    test("rejects parent", () => {
      expect(() => realService.ensureManagementAccess(parent)).toThrow(
        expect.objectContaining({
          code: "FORBIDDEN"
        })
      );
    });

    test("rejects missing user", () => {
      expect(() => realService.ensureManagementAccess(null)).toThrow(
        expect.objectContaining({
          code: "FORBIDDEN"
        })
      );
    });
  });

  describe("buildSearchFilter", () => {
    test("returns empty filter when search is missing", () => {
      expect(realService.buildSearchFilter()).toEqual({});
    });

    test("returns empty filter when search is empty", () => {
      expect(realService.buildSearchFilter("   ")).toEqual({});
    });

    test("builds filter for one search word", () => {
      expect(realService.buildSearchFilter("John")).toEqual({
        OR: [
          {
            firstName: {
              contains: "John",
              mode: "insensitive"
            }
          },
          {
            lastName: {
              contains: "John",
              mode: "insensitive"
            }
          }
        ]
      });
    });

    test("builds filter for two search words", () => {
      expect(realService.buildSearchFilter("John Smith")).toEqual({
        OR: [
          {
            firstName: {
              contains: "John",
              mode: "insensitive"
            },
            lastName: {
              contains: "Smith",
              mode: "insensitive"
            }
          },
          {
            firstName: {
              contains: "Smith",
              mode: "insensitive"
            },
            lastName: {
              contains: "John",
              mode: "insensitive"
            }
          }
        ]
      });
    });

    test("trims search before building filter", () => {
      const result = realService.buildSearchFilter("  John  ");

      expect(result.OR[0].firstName.contains).toBe("John");
    });

    test("builds filter for more than two words", () => {
      const result = realService.buildSearchFilter("John Michael Smith");

      expect(result.OR).toHaveLength(2);
      expect(result.OR[0].firstName.contains).toBe("John Michael Smith");
      expect(result.OR[1].lastName.contains).toBe("John Michael Smith");
    });
  });

  describe("normalizeData", () => {
    test("converts birthDate string to Date", () => {
      const result = realService.normalizeData({
        firstName: "John",
        birthDate: "2023-01-01"
      });

      expect(result.birthDate).toEqual(
        new Date("2023-01-01T00:00:00.000Z")
      );
    });

    test("preserves other fields", () => {
      const data = {
        firstName: "John",
        lastName: "Smith",
        dietaryNotes: "No nuts"
      };

      expect(realService.normalizeData(data)).toEqual(data);
    });

    test("does not modify the original object", () => {
      const data = {
        firstName: "John",
        birthDate: "2023-01-01"
      };

      realService.normalizeData(data);

      expect(data.birthDate).toBe("2023-01-01");
    });

    test("does not change data without birthDate", () => {
      const data = {
        firstName: "John"
      };

      expect(realService.normalizeData(data)).toEqual(data);
    });
  });

  describe("getAll", () => {
    test("returns children and pagination for admin", async () => {
      const result = await realService.getAll(
        {
          page: 1,
          limit: 20
        },
        admin
      );

      expect(prisma.child.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              {},
              {
                status: {
                  not: "ARCHIVED"
                }
              },
              {}
            ]
          },
          orderBy: {
            createdAt: "desc"
          },
          skip: 0,
          take: 20
        })
      );

      expect(prisma.child.count).toHaveBeenCalledWith({
        where: {
          AND: [
            {},
            {
              status: {
                not: "ARCHIVED"
              }
            },
            {}
          ]
        }
      });

      expect(result).toEqual({
        items: [activeChild],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1
        }
      });
    });

    test("uses default pagination values", async () => {
      await realService.getAll({}, admin);

      expect(prisma.child.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20
        })
      );
    });

    test("calculates skip for requested page", async () => {
      await realService.getAll(
        {
          page: 3,
          limit: 10
        },
        admin
      );

      expect(prisma.child.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10
        })
      );
    });

    test("filters by status", async () => {
      await realService.getAll(
        {
          status: "ACTIVE"
        },
        admin
      );

      expect(prisma.child.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              {},
              {
                status: "ACTIVE"
              },
              {}
            ]
          }
        })
      );
    });

    test("filters by search", async () => {
      await realService.getAll(
        {
          search: "John Smith"
        },
        admin
      );

      expect(prisma.child.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              {},
              {
                status: {
                  not: "ARCHIVED"
                }
              },
              {
                OR: expect.any(Array)
              }
            ]
          }
        })
      );
    });

    test("applies parent access filter", async () => {
      await realService.getAll({}, parent);

      expect(prisma.child.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              realService.getAccessFilter(parent),
              {
                status: {
                  not: "ARCHIVED"
                }
              },
              {}
            ]
          }
        })
      );
    });

    test("includes active parents and enrollments", async () => {
      await realService.getAll({}, admin);

      expect(prisma.child.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            parents: {
              where: {
                endDate: null
              },
              include: {
                parent: true
              }
            },
            enrollments: {
              where: {
                endDate: null
              },
              include: {
                group: true
              }
            }
          }
        })
      );
    });

    test("calculates totalPages", async () => {
      prisma.child.count.mockResolvedValue(45);

      const result = await realService.getAll(
        {
          page: 1,
          limit: 20
        },
        admin
      );

      expect(result.pagination.totalPages).toBe(3);
    });

    test("returns zero totalPages when there are no children", async () => {
      prisma.child.findMany.mockResolvedValue([]);
      prisma.child.count.mockResolvedValue(0);

      const result = await realService.getAll({}, admin);

      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
      expect(result.items).toEqual([]);
    });

    test("rejects unauthorized user", async () => {
      await expect(
        realService.getAll({}, {
          id: "user-1",
          role: "STUDENT"
        })
      ).rejects.toMatchObject({
        code: "FORBIDDEN"
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("getById", () => {
    test("returns child for admin", async () => {
      const result = await realService.getById(childId, admin);

      expect(prisma.child.findFirst).toHaveBeenCalledWith({
        where: {
          AND: [
            { id: childId },
            {},
            {
              status: {
                not: "ARCHIVED"
              }
            }
          ]
        },
        include: {
          parents: {
            where: {
              endDate: null
            },
            include: {
              parent: true
            }
          },
          enrollments: {
            orderBy: {
              startDate: "desc"
            },
            include: {
              group: true
            }
          }
        }
      });

      expect(result).toEqual(activeChild);
    });

    test("applies parent access filter", async () => {
      await realService.getById(childId, parent);

      expect(prisma.child.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              { id: childId },
              realService.getAccessFilter(parent),
              {
                status: {
                  not: "ARCHIVED"
                }
              }
            ]
          }
        })
      );
    });

    test("applies teacher access filter", async () => {
      await realService.getById(childId, teacher);

      expect(prisma.child.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              { id: childId },
              realService.getAccessFilter(teacher),
              {
                status: {
                  not: "ARCHIVED"
                }
              }
            ]
          }
        })
      );
    });

    test("rejects missing child", async () => {
      prisma.child.findFirst.mockResolvedValue(null);

      await expect(
        realService.getById(childId, admin)
      ).rejects.toMatchObject({
        code: "CHILD_NOT_FOUND"
      });
    });

    test("rejects archived child", async () => {
      prisma.child.findFirst.mockResolvedValue(null);

      await expect(
        realService.getById(childId, admin)
      ).rejects.toMatchObject({
        code: "CHILD_NOT_FOUND"
      });
    });

    test("rejects missing user", async () => {
      await expect(
        realService.getById(childId, null)
      ).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
    });

    test("rejects unauthorized role", async () => {
      await expect(
        realService.getById(childId, {
          id: "user-1",
          role: "STUDENT"
        })
      ).rejects.toMatchObject({
        code: "FORBIDDEN"
      });
    });
  });

  describe("create", () => {
    test("creates a child", async () => {
      const data = {
        firstName: "John",
        lastName: "Smith",
        birthDate: "2023-01-01"
      };

      const result = await realService.create(data, admin);

      expect(tx.child.create).toHaveBeenCalledWith({
        data: {
          firstName: "John",
          lastName: "Smith",
          birthDate: new Date("2023-01-01T00:00:00.000Z"),
          childCode: expect.any(String)
        }
      });

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: admin.id,
          action: "CREATE",
          entityType: "Child",
          entityId: activeChild.id,
          after: activeChild
        }),
        tx
      );

      expect(result).toEqual(activeChild);
    });

    test("creates a unique childCode", async () => {
      await realService.create(
        {
          firstName: "John",
          lastName: "Smith",
          birthDate: "2023-01-01"
        },
        admin
      );

      const createData = tx.child.create.mock.calls[0][0].data;

      expect(createData.childCode).toEqual(expect.any(String));
      expect(createData.childCode.length).toBeGreaterThan(0);
    });

    test("converts birthDate before creating child", async () => {
      await realService.create(
        {
          firstName: "John",
          lastName: "Smith",
          birthDate: "2023-01-01"
        },
        admin
      );

      const createData = tx.child.create.mock.calls[0][0].data;

      expect(createData.birthDate).toEqual(
        new Date("2023-01-01T00:00:00.000Z")
      );
    });

    test("allows manager to create a child", async () => {
      await realService.create(
        {
          firstName: "John",
          lastName: "Smith",
          birthDate: "2023-01-01"
        },
        manager
      );

      expect(tx.child.create).toHaveBeenCalled();
    });

    test("rejects parent", async () => {
      await expect(
        realService.create(
          {
            firstName: "John",
            lastName: "Smith",
            birthDate: "2023-01-01"
          },
          parent
        )
      ).rejects.toMatchObject({
        code: "FORBIDDEN"
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test("rejects missing user", async () => {
      await expect(
        realService.create(
          {
            firstName: "John",
            lastName: "Smith",
            birthDate: "2023-01-01"
          },
          null
        )
      ).rejects.toMatchObject({
        code: "FORBIDDEN"
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    test("updates a child", async () => {
      const data = {
        firstName: "Jane"
      };

      const updatedChild = {
        ...activeChild,
        firstName: "Jane"
      };

      tx.child.update.mockResolvedValue(updatedChild);

      const result = await realService.update(childId, data, admin);

      expect(tx.child.findFirst).toHaveBeenCalledWith({
        where: {
          id: childId,
          status: {
            not: "ARCHIVED"
          }
        }
      });

      expect(tx.child.update).toHaveBeenCalledWith({
        where: {
          id: childId
        },
        data
      });

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: admin.id,
          action: "UPDATE",
          entityType: "Child",
          entityId: updatedChild.id,
          before: activeChild,
          after: updatedChild
        }),
        tx
      );

      expect(result).toEqual(updatedChild);
    });

    test("converts birthDate during update", async () => {
      await realService.update(
        childId,
        {
          birthDate: "2023-02-01"
        },
        admin
      );

      expect(tx.child.update).toHaveBeenCalledWith({
        where: {
          id: childId
        },
        data: {
          birthDate: new Date("2023-02-01T00:00:00.000Z")
        }
      });
    });

    test("allows manager to update a child", async () => {
      await realService.update(
        childId,
        {
          firstName: "Jane"
        },
        manager
      );

      expect(tx.child.update).toHaveBeenCalled();
    });

    test("rejects parent", async () => {
      await expect(
        realService.update(
          childId,
          {
            firstName: "Jane"
          },
          parent
        )
      ).rejects.toMatchObject({
        code: "FORBIDDEN"
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test("rejects missing child", async () => {
      tx.child.findFirst.mockResolvedValue(null);

      await expect(
        realService.update(
          childId,
          {
            firstName: "Jane"
          },
          admin
        )
      ).rejects.toMatchObject({
        code: "CHILD_NOT_FOUND"
      });

      expect(tx.child.update).not.toHaveBeenCalled();
    });

    test("does not update archived child", async () => {
      tx.child.findFirst.mockResolvedValue(null);

      await expect(
        realService.update(
          childId,
          {
            firstName: "Jane"
          },
          admin
        )
      ).rejects.toMatchObject({
        code: "CHILD_NOT_FOUND"
      });
    });
  });

  describe("remove", () => {
    test("archives a child", async () => {
      const archivedChild = {
        ...activeChild,
        status: "ARCHIVED",
        archivedAt: new Date()
      };

      tx.child.update.mockResolvedValue(archivedChild);

      await realService.remove(childId, admin);

      expect(tx.child.findFirst).toHaveBeenCalledWith({
        where: {
          id: childId,
          status: {
            not: "ARCHIVED"
          }
        }
      });

      expect(tx.child.update).toHaveBeenCalledWith({
        where: {
          id: childId
        },
        data: {
          status: "ARCHIVED",
          archivedAt: expect.any(Date)
        }
      });

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: admin.id,
          action: "ARCHIVE",
          entityType: "Child",
          entityId: archivedChild.id,
          before: activeChild,
          after: archivedChild
        }),
        tx
      );
    });

    test("allows manager to archive a child", async () => {
      await realService.remove(childId, manager);

      expect(tx.child.update).toHaveBeenCalled();
    });

    test("rejects parent", async () => {
      await expect(
        realService.remove(childId, parent)
      ).rejects.toMatchObject({
        code: "FORBIDDEN"
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test("rejects missing user", async () => {
      await expect(
        realService.remove(childId, null)
      ).rejects.toMatchObject({
        code: "FORBIDDEN"
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test("rejects missing child", async () => {
      tx.child.findFirst.mockResolvedValue(null);

      await expect(
        realService.remove(childId, admin)
      ).rejects.toMatchObject({
        code: "CHILD_NOT_FOUND"
      });

      expect(tx.child.update).not.toHaveBeenCalled();
      expect(auditService.createLog).not.toHaveBeenCalled();
    });

    test("does not archive already archived child", async () => {
      tx.child.findFirst.mockResolvedValue(null);

      await expect(
        realService.remove(childId, admin)
      ).rejects.toMatchObject({
        code: "CHILD_NOT_FOUND"
      });
    });
  });
});
