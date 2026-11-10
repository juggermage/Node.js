jest.mock("../../src/config/prisma", () => ({
  $transaction: jest.fn(),
  child: {
    findUnique: jest.fn(),
    findFirst: jest.fn()
  },
  parent: {
    findUnique: jest.fn(),
    findFirst: jest.fn()
  },
  childParent: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  }
}));

jest.mock("../../src/modules/audit/audit.service", () => ({
  createLog: jest.fn()
}));

jest.mock("../../src/modules/child-parent/child-parent.service", () => ({
  createOrRestore: jest.fn(),
  getById: jest.fn(),
  getForChild: jest.fn(),
  getForParent: jest.fn(),
  complete: jest.fn()
}));

jest.mock("../../src/middleware/auth.middleware", () => jest.fn((req, res, next) => next()));

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
const service = require("../../src/modules/child-parent/child-parent.service");
const realService = jest.requireActual("../../src/modules/child-parent/child-parent.service");

const controller = require("../../src/modules/child-parent/child-parent.controller");
const router = require("../../src/modules/child-parent/child-parent.routes");
const validation = require("../../src/modules/child-parent/child-parent.validation");
const HTTP_STATUS = require("../../src/utils/http-status");

describe("Child-Parent Controller", () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      user: {
        id: "user-123",
        role: "ADMIN"
      },
      body: {},
      params: {},
      query: {}
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
      json: jest.fn().mockReturnThis()
    };
  });

  test("create creates relationship", async () => {
    const body = {
      childId: "507f1f77bcf86cd799439011",
      parentId: "507f1f77bcf86cd799439012",
      relation: "MOTHER"
    };

    const data = { id: "link-1" };

    res.locals.validated.body = body;
    service.createOrRestore.mockResolvedValue(data);

    await controller.create(req, res);

    expect(service.createOrRestore).toHaveBeenCalledWith(body, req.user);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data
    });
  });

  test("getById returns relationship", async () => {
    const data = { id: "link-1" };

    res.locals.validated.params.id = "link-1";
    service.getById.mockResolvedValue(data);

    await controller.getById(req, res);

    expect(service.getById).toHaveBeenCalledWith("link-1", req.user);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data
    });
  });

  test("getForChild returns child relationships", async () => {
    const data = [{ id: "link-1" }];

    res.locals.validated.params.childId = "child-1";
    res.locals.validated.query.includeEnded = true;
    service.getForChild.mockResolvedValue(data);

    await controller.getForChild(req, res);

    expect(service.getForChild).toHaveBeenCalledWith("child-1", true, req.user);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data
    });
  });

  test("getForParent returns parent relationships", async () => {
    const data = [{ id: "link-1" }];

    res.locals.validated.params.parentId = "parent-1";
    res.locals.validated.query.includeEnded = false;
    service.getForParent.mockResolvedValue(data);

    await controller.getForParent(req, res);

    expect(service.getForParent).toHaveBeenCalledWith("parent-1", false, req.user);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data
    });
  });

  test("complete ends relationship", async () => {
    const data = { id: "link-1", endDate: new Date() };

    res.locals.validated.params.id = "link-1";
    service.complete.mockResolvedValue(data);

    await controller.complete(req, res);

    expect(service.complete).toHaveBeenCalledWith("link-1", req.user);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data
    });
  });
});

describe("Child-Parent Routes", () => {
  test("registers authentication middleware", () => {
    const authMiddleware = require("../../src/middleware/auth.middleware");

    expect(router.stack.some((layer) => layer.handle === authMiddleware)).toBe(true);
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
          methods: expect.objectContaining({ post: true })
        }),
        expect.objectContaining({
          path: "/child/:childId",
          methods: expect.objectContaining({ get: true })
        }),
        expect.objectContaining({
          path: "/parent/:parentId",
          methods: expect.objectContaining({ get: true })
        }),
        expect.objectContaining({
          path: "/:id",
          methods: expect.objectContaining({ get: true })
        }),
        expect.objectContaining({
          path: "/:id/complete",
          methods: expect.objectContaining({ patch: true })
        })
      ])
    );
  });
});
describe("Child-Parent Validation", () => {
  const childId = "507f1f77bcf86cd799439011";
  const parentId = "507f1f77bcf86cd799439012";

  describe("createLinkSchema", () => {
    test("accepts valid relationship", () => {
      const result = validation.createLinkSchema.validate({
        childId,
        parentId,
        relation: "MOTHER"
      });

      expect(result.error).toBeUndefined();
    });

    test.each(["MOTHER", "FATHER", "GUARDIAN", "GRANDPARENT", "OTHER"])(
      "accepts relation %s",
      (relation) => {
        const result = validation.createLinkSchema.validate({
          childId,
          parentId,
          relation
        });

        expect(result.error).toBeUndefined();
      }
    );

    test("rejects invalid childId", () => {
      const result = validation.createLinkSchema.validate({
        childId: "invalid",
        parentId,
        relation: "MOTHER"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects invalid parentId", () => {
      const result = validation.createLinkSchema.validate({
        childId,
        parentId: "invalid",
        relation: "MOTHER"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects invalid relation", () => {
      const result = validation.createLinkSchema.validate({
        childId,
        parentId,
        relation: "BROTHER"
      });

      expect(result.error).toBeDefined();
    });

    test("requires all fields", () => {
      const result = validation.createLinkSchema.validate({});

      expect(result.error).toBeDefined();
    });
  });

  describe("idParamsSchema", () => {
    test("accepts valid id", () => {
      const result = validation.idParamsSchema.validate({
        id: childId
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects invalid id", () => {
      const result = validation.idParamsSchema.validate({
        id: "123"
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("childParamsSchema", () => {
    test("accepts valid childId", () => {
      const result = validation.childParamsSchema.validate({
        childId
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects invalid childId", () => {
      const result = validation.childParamsSchema.validate({
        childId: "invalid"
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("parentParamsSchema", () => {
    test("accepts valid parentId", () => {
      const result = validation.parentParamsSchema.validate({
        parentId
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects invalid parentId", () => {
      const result = validation.parentParamsSchema.validate({
        parentId: "invalid"
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("historyQuerySchema", () => {
    test("accepts includeEnded true", () => {
      const result = validation.historyQuerySchema.validate({
        includeEnded: true
      });

      expect(result.error).toBeUndefined();
      expect(result.value.includeEnded).toBe(true);
    });

    test("accepts includeEnded false", () => {
      const result = validation.historyQuerySchema.validate({
        includeEnded: false
      });

      expect(result.error).toBeUndefined();
      expect(result.value.includeEnded).toBe(false);
    });

    test("uses false as default", () => {
      const result = validation.historyQuerySchema.validate({});

      expect(result.error).toBeUndefined();
      expect(result.value.includeEnded).toBe(false);
    });

    test("rejects invalid includeEnded", () => {
      const result = validation.historyQuerySchema.validate({
        includeEnded: "yes"
      });

      expect(result.error).toBeDefined();
    });
  });
});

describe("Child-Parent Service", () => {
  const childId = "507f1f77bcf86cd799439011";
  const parentId = "507f1f77bcf86cd799439012";
  const linkId = "507f1f77bcf86cd799439013";

  const admin = {
    id: "admin-1",
    role: "ADMIN"
  };

  const manager = {
    id: "manager-1",
    role: "MANAGER"
  };

  const parentUser = {
    id: "parent-user-1",
    role: "PARENT"
  };

  const teacher = {
    id: "teacher-user-1",
    role: "TEACHER"
  };

  const activeChild = {
    id: childId,
    status: "ACTIVE"
  };

  const activeParent = {
    id: parentId,
    status: "ACTIVE"
  };

  const link = {
    id: linkId,
    childId,
    parentId,
    relation: "MOTHER",
    startDate: new Date("2026-01-01"),
    endDate: null,
    child: activeChild,
    parent: activeParent
  };

  let tx;

  beforeEach(() => {
    jest.clearAllMocks();

    tx = {
      child: {
        findUnique: jest.fn(),
        findFirst: jest.fn()
      },
      parent: {
        findUnique: jest.fn(),
        findFirst: jest.fn()
      },
      childParent: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      }
    };

    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    tx.child.findUnique.mockResolvedValue(activeChild);
    tx.parent.findUnique.mockResolvedValue(activeParent);
    tx.childParent.findUnique.mockResolvedValue(null);
    tx.childParent.findFirst.mockResolvedValue(link);
    tx.childParent.create.mockResolvedValue(link);
    tx.childParent.update.mockResolvedValue(link);

    prisma.child.findUnique.mockResolvedValue(activeChild);
    prisma.child.findFirst.mockResolvedValue(activeChild);
    prisma.parent.findUnique.mockResolvedValue(activeParent);
    prisma.parent.findFirst.mockResolvedValue(activeParent);
    prisma.childParent.findUnique.mockResolvedValue(link);
    prisma.childParent.findFirst.mockResolvedValue(link);
    prisma.childParent.findMany.mockResolvedValue([link]);
  });

  describe("createOrRestore", () => {
    test("creates a new relationship", async () => {
      const result = await realService.createOrRestore(
        {
          childId,
          parentId,
          relation: "MOTHER"
        },
        admin
      );

      expect(tx.child.findUnique).toHaveBeenCalledWith({
        where: { id: childId }
      });

      expect(tx.parent.findUnique).toHaveBeenCalledWith({
        where: { id: parentId }
      });

      expect(tx.childParent.create).toHaveBeenCalledWith({
        data: {
          childId,
          parentId,
          relation: "MOTHER"
        },
        include: {
          child: true,
          parent: true
        }
      });

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: admin.id,
          action: "CREATE",
          entityType: "ChildParent",
          entityId: linkId
        }),
        tx
      );

      expect(result).toEqual(link);
    });

    test("restores an ended relationship", async () => {
      const endedLink = {
        ...link,
        endDate: new Date("2026-02-01")
      };

      tx.childParent.findUnique.mockResolvedValue(endedLink);
      tx.childParent.update.mockResolvedValue(link);

      const result = await realService.createOrRestore(
        {
          childId,
          parentId,
          relation: "GUARDIAN"
        },
        admin
      );

      expect(tx.childParent.update).toHaveBeenCalledWith({
        where: { id: linkId },
        data: {
          relation: "GUARDIAN",
          startDate: expect.any(Date),
          endDate: null
        },
        include: {
          child: true,
          parent: true
        }
      });

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "RESTORE",
          before: endedLink
        }),
        tx
      );

      expect(result).toEqual(link);
    });

    test("rejects user without management access", async () => {
      await expect(
        realService.createOrRestore(
          {
            childId,
            parentId,
            relation: "MOTHER"
          },
          parentUser
        )
      ).rejects.toMatchObject({
        code: "FORBIDDEN"
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test("rejects missing child", async () => {
      tx.child.findUnique.mockResolvedValue(null);

      await expect(
        realService.createOrRestore(
          {
            childId,
            parentId,
            relation: "MOTHER"
          },
          admin
        )
      ).rejects.toMatchObject({
        code: "CHILD_NOT_FOUND"
      });
    });

    test("rejects archived child", async () => {
      tx.child.findUnique.mockResolvedValue({
        ...activeChild,
        status: "ARCHIVED"
      });

      await expect(
        realService.createOrRestore(
          {
            childId,
            parentId,
            relation: "MOTHER"
          },
          admin
        )
      ).rejects.toMatchObject({
        code: "CHILD_NOT_FOUND"
      });
    });

    test("rejects missing parent", async () => {
      tx.parent.findUnique.mockResolvedValue(null);

      await expect(
        realService.createOrRestore(
          {
            childId,
            parentId,
            relation: "MOTHER"
          },
          admin
        )
      ).rejects.toMatchObject({
        code: "PARENT_NOT_FOUND"
      });
    });

    test("rejects inactive parent", async () => {
      tx.parent.findUnique.mockResolvedValue({
        ...activeParent,
        status: "INACTIVE"
      });

      await expect(
        realService.createOrRestore(
          {
            childId,
            parentId,
            relation: "MOTHER"
          },
          admin
        )
      ).rejects.toMatchObject({
        code: "PARENT_NOT_FOUND"
      });
    });

    test("rejects already active relationship", async () => {
      tx.childParent.findUnique.mockResolvedValue(link);

      await expect(
        realService.createOrRestore(
          {
            childId,
            parentId,
            relation: "MOTHER"
          },
          admin
        )
      ).rejects.toMatchObject({
        code: "CHILD_PARENT_EXISTS"
      });
    });

    test("handles Prisma duplicate relationship error", async () => {
      tx.childParent.create.mockRejectedValue({
        code: "P2002"
      });

      await expect(
        realService.createOrRestore(
          {
            childId,
            parentId,
            relation: "MOTHER"
          },
          admin
        )
      ).rejects.toMatchObject({
        code: "CHILD_PARENT_EXISTS"
      });
    });

    test("handles Prisma foreign key error", async () => {
      tx.childParent.create.mockRejectedValue({
        code: "P2003"
      });

      await expect(
        realService.createOrRestore(
          {
            childId,
            parentId,
            relation: "MOTHER"
          },
          admin
        )
      ).rejects.toMatchObject({
        code: "RELATED_RECORD_NOT_FOUND"
      });
    });
  });

  describe("getById", () => {
    test("returns relationship for admin", async () => {
      const result = await realService.getById(linkId, admin);

      expect(prisma.childParent.findFirst).toHaveBeenCalledWith({
        where: {
          id: linkId
        },
        include: {
          child: true,
          parent: true
        }
      });

      expect(result).toEqual(link);
    });

    test("returns relationship for manager", async () => {
      const result = await realService.getById(linkId, manager);

      expect(result).toEqual(link);
    });

    test("filters parent access by user id", async () => {
      await realService.getById(linkId, parentUser);

      expect(prisma.childParent.findFirst).toHaveBeenCalledWith({
        where: {
          id: linkId,
          parent: {
            userId: parentUser.id
          }
        },
        include: {
          child: true,
          parent: true
        }
      });
    });

    test("filters teacher access by assigned group", async () => {
      await realService.getById(linkId, teacher);

      expect(prisma.childParent.findFirst).toHaveBeenCalledWith({
        where: {
          id: linkId,
          child: {
            enrollments: {
              some: {
                endDate: null,
                group: {
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
          }
        },
        include: {
          child: true,
          parent: true
        }
      });
    });

    test("rejects missing relationship", async () => {
      prisma.childParent.findFirst.mockResolvedValue(null);

      await expect(realService.getById(linkId, admin)).rejects.toMatchObject({
        code: "CHILD_PARENT_NOT_FOUND"
      });
    });

    test("rejects missing user", async () => {
      await expect(realService.getById(linkId, null)).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
    });

    test("rejects unauthorized role", async () => {
      await expect(
        realService.getById(linkId, {
          id: "user-1",
          role: "STUDENT"
        })
      ).rejects.toMatchObject({
        code: "FORBIDDEN"
      });
    });
  });

  describe("getForChild", () => {
    test("returns active relationships for admin by default", async () => {
      const result = await realService.getForChild(childId, false, admin);

      expect(prisma.child.findFirst).toHaveBeenCalledWith({
        where: {
          id: childId
        }
      });

      expect(prisma.childParent.findMany).toHaveBeenCalledWith({
        where: {
          childId,
          endDate: null
        },
        include: {
          parent: true
        },
        orderBy: {
          startDate: "desc"
        }
      });

      expect(result).toEqual([link]);
    });

    test("includes ended relationships when requested", async () => {
      await realService.getForChild(childId, true, admin);

      expect(prisma.childParent.findMany).toHaveBeenCalledWith({
        where: {
          childId
        },
        include: {
          parent: true
        },
        orderBy: {
          startDate: "desc"
        }
      });
    });

    test("checks parent access to child", async () => {
      await realService.getForChild(childId, false, parentUser);

      expect(prisma.child.findFirst).toHaveBeenCalledWith({
        where: {
          id: childId,
          parents: {
            some: {
              parent: {
                userId: parentUser.id
              },
              endDate: null
            }
          }
        }
      });

      expect(prisma.childParent.findMany).toHaveBeenCalledWith({
        where: {
          childId,
          endDate: null,
          parent: {
            userId: parentUser.id
          }
        },
        include: {
          parent: true
        },
        orderBy: {
          startDate: "desc"
        }
      });
    });

    test("rejects child not accessible to user", async () => {
      prisma.child.findFirst.mockResolvedValue(null);

      await expect(realService.getForChild(childId, false, admin)).rejects.toMatchObject({
        code: "CHILD_NOT_FOUND"
      });

      expect(prisma.childParent.findMany).not.toHaveBeenCalled();
    });
  });

  describe("getForParent", () => {
    test("returns active relationships for admin", async () => {
      const result = await realService.getForParent(parentId, false, admin);

      expect(prisma.childParent.findMany).toHaveBeenCalledWith({
        where: {
          parentId,
          endDate: null
        },
        include: {
          child: true
        },
        orderBy: {
          startDate: "desc"
        }
      });

      expect(result).toEqual([link]);
    });

    test("includes ended relationships when requested", async () => {
      await realService.getForParent(parentId, true, admin);

      expect(prisma.childParent.findMany).toHaveBeenCalledWith({
        where: {
          parentId
        },
        include: {
          child: true
        },
        orderBy: {
          startDate: "desc"
        }
      });
    });

    test("allows parent to access own relationships", async () => {
      await realService.getForParent(parentId, false, parentUser);

      expect(prisma.parent.findFirst).toHaveBeenCalledWith({
        where: {
          userId: parentUser.id,
          status: {
            not: "ARCHIVED"
          }
        }
      });

      expect(prisma.childParent.findMany).toHaveBeenCalledWith({
        where: {
          parentId,
          endDate: null
        },
        include: {
          child: true
        },
        orderBy: {
          startDate: "desc"
        }
      });
    });

    test("rejects parent accessing another parent", async () => {
      prisma.parent.findFirst.mockResolvedValue({
        id: "another-parent",
        status: "ACTIVE"
      });

      await expect(realService.getForParent(parentId, false, parentUser)).rejects.toMatchObject({
        code: "FORBIDDEN"
      });
    });

    test("rejects parent without parent record", async () => {
      prisma.parent.findFirst.mockResolvedValue(null);

      await expect(realService.getForParent(parentId, false, parentUser)).rejects.toMatchObject({
        code: "FORBIDDEN"
      });
    });

    test("returns employee accessible relationships", async () => {
      prisma.parent.findUnique.mockResolvedValue(activeParent);
      prisma.childParent.findMany
        .mockResolvedValueOnce([{ id: linkId }])
        .mockResolvedValueOnce([link]);

      const result = await realService.getForParent(parentId, false, teacher);

      expect(prisma.parent.findUnique).toHaveBeenCalledWith({
        where: {
          id: parentId
        }
      });

      expect(prisma.childParent.findMany).toHaveBeenNthCalledWith(1, {
        where: {
          parentId,
          child: {
            enrollments: {
              some: {
                endDate: null,
                group: {
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
          }
        },
        select: {
          id: true
        }
      });

      expect(prisma.childParent.findMany).toHaveBeenNthCalledWith(2, {
        where: {
          id: {
            in: [linkId]
          },
          endDate: null
        },
        include: {
          child: true
        },
        orderBy: {
          startDate: "desc"
        }
      });

      expect(result).toEqual([link]);
    });

    test("rejects employee when parent does not exist", async () => {
      prisma.parent.findUnique.mockResolvedValue(null);

      await expect(realService.getForParent(parentId, false, teacher)).rejects.toMatchObject({
        code: "PARENT_NOT_FOUND"
      });
    });

    test("returns empty list when employee has no accessible links", async () => {
      prisma.parent.findUnique.mockResolvedValue(activeParent);
      prisma.childParent.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await realService.getForParent(parentId, false, teacher);

      expect(result).toEqual([]);
    });
  });

  describe("complete", () => {
    test("completes active relationship", async () => {
      const completedLink = {
        ...link,
        endDate: new Date()
      };

      tx.childParent.findUnique.mockResolvedValue(link);
      tx.childParent.update.mockResolvedValue(completedLink);

      const result = await realService.complete(linkId, admin);

      expect(tx.childParent.findUnique).toHaveBeenCalledWith({
        where: {
          id: linkId
        },
        include: {
          child: true,
          parent: true
        }
      });

      expect(tx.childParent.update).toHaveBeenCalledWith({
        where: {
          id: linkId
        },
        data: {
          endDate: expect.any(Date)
        },
        include: {
          child: true,
          parent: true
        }
      });

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: admin.id,
          action: "CANCEL",
          entityType: "ChildParent",
          entityId: linkId,
          before: link,
          after: completedLink
        }),
        tx
      );

      expect(result).toEqual(completedLink);
    });

    test("rejects user without management access", async () => {
      await expect(realService.complete(linkId, parentUser)).rejects.toMatchObject({
        code: "FORBIDDEN"
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test("rejects missing relationship", async () => {
      tx.childParent.findUnique.mockResolvedValue(null);

      await expect(realService.complete(linkId, admin)).rejects.toMatchObject({
        code: "CHILD_PARENT_NOT_FOUND"
      });
    });

    test("rejects already ended relationship", async () => {
      tx.childParent.findUnique.mockResolvedValue({
        ...link,
        endDate: new Date("2026-02-01")
      });

      await expect(realService.complete(linkId, admin)).rejects.toMatchObject({
        code: "RELATIONSHIP_ALREADY_ENDED"
      });

      expect(tx.childParent.update).not.toHaveBeenCalled();
    });

    test("handles Prisma record not found error", async () => {
      tx.childParent.findUnique.mockRejectedValue({
        code: "P2025"
      });

      await expect(realService.complete(linkId, admin)).rejects.toMatchObject({
        code: "RELATED_RECORD_NOT_FOUND"
      });
    });
  });
});
