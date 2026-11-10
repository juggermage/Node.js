
jest.mock("../../src/config/prisma", () => ({
  $transaction: jest.fn(),
  group: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  room: {
    findUnique: jest.fn()
  },
  child: {
    findUnique: jest.fn(),
    findFirst: jest.fn()
  },
  groupEnrollment: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  }
}));

jest.mock("../../src/modules/audit/audit.service", () => ({
  createLog: jest.fn()
}));

jest.mock("../../src/modules/groups/groups.service", () => ({
  getAllGroups: jest.fn(),
  getGroupById: jest.fn(),
  createGroup: jest.fn(),
  updateGroup: jest.fn(),
  softDeleteGroup: jest.fn(),
  enrollChild: jest.fn(),
  completeEnrollment: jest.fn(),
  getGroupHistory: jest.fn(),
  getChildHistory: jest.fn()
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
const service = require("../../src/modules/groups/groups.service");
const controller = require("../../src/modules/groups/groups.controller");
const HTTP_STATUS = require("../../src/utils/http-status");

const authMiddleware = require("../../src/middleware/auth.middleware");

const {
  idParamsSchema,
  enrollmentParamsSchema,
  childParamsSchema,
  createGroupSchema,
  updateGroupSchema,
  queryGroupsSchema,
  enrollChildSchema
} = require("../../src/modules/groups/groups.validation");

const groupRouter = require("../../src/modules/groups/groups.routes");

const realService = jest.requireActual(
  "../../src/modules/groups/groups.service"
);

const ADMIN = {
  id: "111111111111111111111111",
  role: "ADMIN"
};

const MANAGER = {
  id: "222222222222222222222222",
  role: "MANAGER"
};

const PARENT = {
  id: "333333333333333333333333",
  role: "PARENT"
};

const TEACHER = {
  id: "444444444444444444444444",
  role: "TEACHER"
};

const GROUP_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";
const CHILD_ID = "bbbbbbbbbbbbbbbbbbbbbbbb";
const ROOM_ID = "cccccccccccccccccccccccc";
const ENROLLMENT_ID = "dddddddddddddddddddddddd";

const group = {
  id: GROUP_ID,
  name: "Group A",
  ageFromMonths: 24,
  ageToMonths: 71,
  capacity: 20,
  mealCategory: "A3",
  mainRoomId: null,
  status: "ACTIVE"
};

const child = {
  id: CHILD_ID,
  firstName: "Ivan",
  lastName: "Petrenko",
  birthDate: new Date(Date.now() - 36 * 30 * 24 * 60 * 60 * 1000),
  status: "ACTIVE"
};

const enrollment = {
  id: ENROLLMENT_ID,
  childId: CHILD_ID,
  groupId: GROUP_ID,
  startDate: new Date(),
  endDate: null,
  child,
  group
};

const validGroup = {
  name: "Group A",
  ageFromMonths: 24,
  ageToMonths: 71,
  capacity: 20,
  mealCategory: "A3",
  mainRoomId: null,
  status: "ACTIVE"
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

describe("Groups Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("getAll should return groups", async () => {
    const req = { user: ADMIN };
    const res = createResponse();
    const groups = [group];

    res.locals.validated.query = { search: "Group" };
    service.getAllGroups.mockResolvedValue(groups);

    await controller.getAll(req, res);

    expect(service.getAllGroups).toHaveBeenCalledWith(
      { search: "Group" },
      ADMIN
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: groups
    });
  });

  test("getById should return group", async () => {
    const req = { user: ADMIN };
    const res = createResponse();

    res.locals.validated.params.id = GROUP_ID;
    service.getGroupById.mockResolvedValue(group);

    await controller.getById(req, res);

    expect(service.getGroupById).toHaveBeenCalledWith(
      GROUP_ID,
      ADMIN
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: group
    });
  });

  test("create should create group", async () => {
    const req = { user: ADMIN };
    const res = createResponse();

    res.locals.validated.body = validGroup;
    service.createGroup.mockResolvedValue(group);

    await controller.create(req, res);

    expect(service.createGroup).toHaveBeenCalledWith(
      validGroup,
      ADMIN
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: group
    });
  });

  test("update should update group", async () => {
    const req = { user: ADMIN };
    const res = createResponse();
    const updateData = { name: "Group B" };

    res.locals.validated.params.id = GROUP_ID;
    res.locals.validated.body = updateData;

    service.updateGroup.mockResolvedValue({
      ...group,
      name: "Group B"
    });

    await controller.update(req, res);

    expect(service.updateGroup).toHaveBeenCalledWith(
      GROUP_ID,
      updateData,
      ADMIN
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
  });

  test("remove should delete group", async () => {
    const req = { user: ADMIN };
    const res = createResponse();

    res.locals.validated.params.id = GROUP_ID;
    service.softDeleteGroup.mockResolvedValue(group);

    await controller.remove(req, res);

    expect(service.softDeleteGroup).toHaveBeenCalledWith(
      GROUP_ID,
      ADMIN
    );

    expect(res.status).toHaveBeenCalledWith(
      HTTP_STATUS.NO_CONTENT
    );

    expect(res.send).toHaveBeenCalled();
  });

  test("enrollChild should enroll child", async () => {
    const req = { user: ADMIN };
    const res = createResponse();
    const body = { childId: CHILD_ID };

    res.locals.validated.params.id = GROUP_ID;
    res.locals.validated.body = body;

    service.enrollChild.mockResolvedValue(enrollment);

    await controller.enrollChild(req, res);

    expect(service.enrollChild).toHaveBeenCalledWith(
      GROUP_ID,
      body,
      ADMIN
    );

    expect(res.status).toHaveBeenCalledWith(
      HTTP_STATUS.CREATED
    );

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: enrollment
    });
  });

  test("completeEnrollment should complete enrollment", async () => {
    const req = { user: ADMIN };
    const res = createResponse();

    res.locals.validated.params.enrollmentId = ENROLLMENT_ID;
    service.completeEnrollment.mockResolvedValue({
      ...enrollment,
      endDate: new Date()
    });

    await controller.completeEnrollment(req, res);

    expect(service.completeEnrollment).toHaveBeenCalledWith(
      ENROLLMENT_ID,
      ADMIN
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
  });

  test("getGroupHistory should return group history", async () => {
    const req = { user: ADMIN };
    const res = createResponse();

    res.locals.validated.params.id = GROUP_ID;
    service.getGroupHistory.mockResolvedValue([enrollment]);

    await controller.getGroupHistory(req, res);

    expect(service.getGroupHistory).toHaveBeenCalledWith(
      GROUP_ID,
      ADMIN
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [enrollment]
    });
  });

  test("getChildHistory should return child history", async () => {
    const req = { user: ADMIN };
    const res = createResponse();

    res.locals.validated.params.childId = CHILD_ID;
    service.getChildHistory.mockResolvedValue([enrollment]);

    await controller.getChildHistory(req, res);

    expect(service.getChildHistory).toHaveBeenCalledWith(
      CHILD_ID,
      ADMIN
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [enrollment]
    });
  });
});

describe("Groups Routes", () => {
  test("should register authentication middleware", () => {
    const registered = groupRouter.stack.some(
      (layer) => layer.handle === authMiddleware
    );

    expect(registered).toBe(true);
  });

  test("should register all group routes", () => {
    const routes = groupRouter.stack
      .filter((layer) => layer.route)
      .map((layer) => ({
        path: layer.route.path,
        method: Object.keys(layer.route.methods)[0]
      }));

    expect(routes).toEqual([
      { path: "/", method: "get" },
      { path: "/", method: "post" },
      { path: "/children/:childId/enrollments", method: "get" },
      { path: "/enrollments/:enrollmentId/complete", method: "patch" },
      { path: "/:id", method: "get" },
      { path: "/:id", method: "patch" },
      { path: "/:id", method: "delete" },
      { path: "/:id/enrollments", method: "post" },
      { path: "/:id/enrollments", method: "get" }
    ]);
  });

  test("should register correct access roles", () => {
    const registeredRoles = groupRouter.stack
      .filter((layer) => layer.route)
      .flatMap((layer) => layer.route.stack)
      .map((layer) => layer.handle.allowedRoles)
      .filter(Boolean);

    expect(registeredRoles).toEqual([
      ["ADMIN", "MANAGER", "PARENT", "TEACHER", "EDUCATOR", "ASSISTANT"],
      ["ADMIN", "MANAGER"],
      ["ADMIN", "MANAGER", "PARENT", "TEACHER", "EDUCATOR", "ASSISTANT"],
      ["ADMIN", "MANAGER"],
      ["ADMIN", "MANAGER", "PARENT", "TEACHER", "EDUCATOR", "ASSISTANT"],
      ["ADMIN", "MANAGER"],
      ["ADMIN", "MANAGER"],
      ["ADMIN", "MANAGER"],
      ["ADMIN", "MANAGER", "PARENT", "TEACHER", "EDUCATOR", "ASSISTANT"]
    ]);
  });

  test("should register validation middleware", () => {
    const registeredValidations = groupRouter.stack
      .filter((layer) => layer.route)
      .flatMap((layer) => layer.route.stack)
      .map((layer) => ({
        schema: layer.handle.validationSchema,
        property: layer.handle.validationProperty
      }))
      .filter((validation) => validation.schema);

    expect(registeredValidations).toEqual(
      expect.arrayContaining([
        { schema: queryGroupsSchema, property: "query" },
        { schema: idParamsSchema, property: "params" },
        { schema: enrollmentParamsSchema, property: "params" },
        { schema: childParamsSchema, property: "params" },
        { schema: createGroupSchema, property: "body" },
        { schema: updateGroupSchema, property: "body" },
        { schema: enrollChildSchema, property: "body" }
      ])
    );
  });
});

describe("Groups Validation", () => {
  test("should accept valid group data", () => {
    const { error } = createGroupSchema.validate(validGroup);

    expect(error).toBeUndefined();
  });

  test("should reject group without required fields", () => {
    const { error } = createGroupSchema.validate({});

    expect(error).toBeDefined();
  });

  test("should reject group with empty name", () => {
    const { error } = createGroupSchema.validate({
      ...validGroup,
      name: " "
    });

    expect(error).toBeDefined();
  });

  test("should reject group name longer than 50 characters", () => {
    const { error } = createGroupSchema.validate({
      ...validGroup,
      name: "A".repeat(51)
    });

    expect(error).toBeDefined();
  });

  test("should reject age below 24 months", () => {
    const { error } = createGroupSchema.validate({
      ...validGroup,
      ageFromMonths: 23
    });

    expect(error).toBeDefined();
  });

  test("should reject age above 71 months", () => {
    const { error } = createGroupSchema.validate({
      ...validGroup,
      ageToMonths: 72
    });

    expect(error).toBeDefined();
  });

  test("should reject non-integer age", () => {
    const { error } = createGroupSchema.validate({
      ...validGroup,
      ageFromMonths: 24.5
    });

    expect(error).toBeDefined();
  });

  test("should reject age range where minimum is greater than maximum", () => {
    const { error } = createGroupSchema.validate({
      ...validGroup,
      ageFromMonths: 60,
      ageToMonths: 30
    });

    expect(error).toBeDefined();
  });

  test("should reject capacity below 1", () => {
    const { error } = createGroupSchema.validate({
      ...validGroup,
      capacity: 0
    });

    expect(error).toBeDefined();
  });

  test("should reject capacity above 20", () => {
    const { error } = createGroupSchema.validate({
      ...validGroup,
      capacity: 21
    });

    expect(error).toBeDefined();
  });

  test("should reject invalid meal category", () => {
    const { error } = createGroupSchema.validate({
      ...validGroup,
      mealCategory: "A1"
    });

    expect(error).toBeDefined();
  });

  test("should accept null meal category", () => {
    const { error } = createGroupSchema.validate({
      ...validGroup,
      mealCategory: null
    });

    expect(error).toBeUndefined();
  });

  test("should reject invalid main room ID", () => {
    const { error } = createGroupSchema.validate({
      ...validGroup,
      mainRoomId: "invalid-id"
    });

    expect(error).toBeDefined();
  });

  test("should accept null main room ID", () => {
    const { error } = createGroupSchema.validate({
      ...validGroup,
      mainRoomId: null
    });

    expect(error).toBeUndefined();
  });

  test("should reject invalid group status", () => {
    const { error } = createGroupSchema.validate({
      ...validGroup,
      status: "ARCHIVED"
    });

    expect(error).toBeDefined();
  });

  test("should apply default capacity", () => {
    const { value } = createGroupSchema.validate({
      name: "Group A",
      ageFromMonths: 24,
      ageToMonths: 71
    });

    expect(value.capacity).toBe(20);
  });

  test("should apply default status", () => {
    const { value } = createGroupSchema.validate({
      name: "Group A",
      ageFromMonths: 24,
      ageToMonths: 71
    });

    expect(value.status).toBe("ACTIVE");
  });

  test("should accept valid update data", () => {
    const { error } = updateGroupSchema.validate({
      name: "New group name",
      capacity: 15
    });

    expect(error).toBeUndefined();
  });

  test("should reject empty update data", () => {
    const { error } = updateGroupSchema.validate({});

    expect(error).toBeDefined();
  });

  test("should reject invalid update age range", () => {
    const { error } = updateGroupSchema.validate({
      ageFromMonths: 60,
      ageToMonths: 30
    });

    expect(error).toBeDefined();
  });

  test("should accept valid query parameters", () => {
    const { error } = queryGroupsSchema.validate({
      search: "Group",
      status: "ACTIVE"
    });

    expect(error).toBeUndefined();
  });

  test("should reject invalid query status", () => {
    const { error } = queryGroupsSchema.validate({
      status: "DELETED"
    });

    expect(error).toBeDefined();
  });

  test("should accept empty search query", () => {
    const { error } = queryGroupsSchema.validate({
      search: ""
    });

    expect(error).toBeUndefined();
  });

  test("should reject search longer than 100 characters", () => {
    const { error } = queryGroupsSchema.validate({
      search: "A".repeat(101)
    });

    expect(error).toBeDefined();
  });

  test("should accept valid group ID", () => {
    const { error } = idParamsSchema.validate({
      id: GROUP_ID
    });

    expect(error).toBeUndefined();
  });

  test("should reject invalid group ID", () => {
    const { error } = idParamsSchema.validate({
      id: "invalid-id"
    });

    expect(error).toBeDefined();
  });

  test("should accept valid enrollment ID", () => {
    const { error } = enrollmentParamsSchema.validate({
      enrollmentId: ENROLLMENT_ID
    });

    expect(error).toBeUndefined();
  });

  test("should reject invalid enrollment ID", () => {
    const { error } = enrollmentParamsSchema.validate({
      enrollmentId: "invalid-id"
    });

    expect(error).toBeDefined();
  });

  test("should accept valid child ID", () => {
    const { error } = childParamsSchema.validate({
      childId: CHILD_ID
    });

    expect(error).toBeUndefined();
  });

  test("should reject invalid child ID", () => {
    const { error } = childParamsSchema.validate({
      childId: "invalid-id"
    });

    expect(error).toBeDefined();
  });

  test("should accept valid child enrollment data", () => {
    const { error } = enrollChildSchema.validate({
      childId: CHILD_ID
    });

    expect(error).toBeUndefined();
  });

  test("should reject enrollment without child ID", () => {
    const { error } = enrollChildSchema.validate({});

    expect(error).toBeDefined();
  });
});

describe("Groups Service", () => {
  let tx;

  beforeEach(() => {
    jest.clearAllMocks();

    tx = {
      group: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      },
      room: {
        findUnique: jest.fn()
      },
      child: {
        findUnique: jest.fn(),
        findFirst: jest.fn()
      },
      groupEnrollment: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      }
    };

    prisma.$transaction.mockImplementation((callback) => {
      return callback(tx);
    });

    tx.group.findUnique.mockResolvedValue(group);
    tx.group.findFirst.mockResolvedValue(null);
    tx.group.create.mockResolvedValue(group);
    tx.group.update.mockResolvedValue(group);

    tx.room.findUnique.mockResolvedValue({
      id: ROOM_ID,
      status: "ACTIVE"
    });

    tx.child.findUnique.mockResolvedValue(child);

    tx.groupEnrollment.findMany.mockResolvedValue([]);
    tx.groupEnrollment.findUnique.mockResolvedValue(enrollment);
    tx.groupEnrollment.findFirst.mockResolvedValue(null);
    tx.groupEnrollment.count.mockResolvedValue(0);
    tx.groupEnrollment.create.mockResolvedValue(enrollment);
    tx.groupEnrollment.update.mockResolvedValue({
      ...enrollment,
      endDate: new Date()
    });

    prisma.group.findMany.mockResolvedValue([group]);
    prisma.group.findFirst.mockResolvedValue(group);
    prisma.groupEnrollment.findMany.mockResolvedValue([enrollment]);
    prisma.child.findFirst.mockResolvedValue(child);
  });

  test("getAllGroups should return groups for administrator", async () => {
    const result = await realService.getAllGroups({}, ADMIN);

    expect(result).toEqual([group]);

    expect(prisma.group.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { not: "ARCHIVED" }
        },
        orderBy: { name: "asc" }
      })
    );
  });

  test("getAllGroups should filter by status", async () => {
    await realService.getAllGroups(
      { status: "INACTIVE" },
      ADMIN
    );

    expect(prisma.group.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "INACTIVE"
        }
      })
    );
  });

  test("getAllGroups should filter by search", async () => {
    await realService.getAllGroups(
      { search: " Group " },
      ADMIN
    );

    expect(prisma.group.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { not: "ARCHIVED" },
          name: {
            contains: "Group",
            mode: "insensitive"
          }
        }
      })
    );
  });

  test("getAllGroups should return only active groups for parent", async () => {
    await realService.getAllGroups({}, PARENT);

    expect(prisma.group.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          enrollments: {
            some: {
              endDate: null,
              child: {
                parents: {
                  some: {
                    endDate: null,
                    parent: {
                      userId: PARENT.id,
                      status: "ACTIVE"
                    }
                  }
                }
              }
            }
          },
          status: "ACTIVE"
        }
      })
    );
  });

  test("getAllGroups should return only assigned groups for teacher", async () => {
    await realService.getAllGroups({}, TEACHER);

    expect(prisma.group.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          staffAssignments: {
            some: {
              endDate: null,
              employee: {
                userId: TEACHER.id,
                status: "ACTIVE",
                role: TEACHER.role
              }
            }
          },
          status: "ACTIVE"
        }
      })
    );
  });

  test("getAllGroups should reject unauthenticated user", async () => {
    await expect(
      realService.getAllGroups({}, null)
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });
  });

  test("getAllGroups should reject unsupported role", async () => {
    await expect(
      realService.getAllGroups({}, {
        id: CHILD_ID,
        role: "UNKNOWN"
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
  });

  test("getGroupById should return group", async () => {
    const result = await realService.getGroupById(
      GROUP_ID,
      ADMIN
    );

    expect(result).toEqual(group);

    expect(prisma.group.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: GROUP_ID,
          status: { not: "ARCHIVED" }
        }
      })
    );
  });

  test("getGroupById should reject when group does not exist", async () => {
    prisma.group.findFirst.mockResolvedValue(null);

    await expect(
      realService.getGroupById(GROUP_ID, ADMIN)
    ).rejects.toMatchObject({
      code: "GROUP_NOT_FOUND"
    });
  });

  test("createGroup should create group", async () => {
    const result = await realService.createGroup(
      validGroup,
      ADMIN
    );

    expect(result).toEqual(group);

    expect(tx.group.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: "Group A",
          ageFromMonths: 24,
          ageToMonths: 71,
          capacity: 20,
          mealCategory: "A3",
          mainRoomId: null,
          status: "ACTIVE"
        },
        include: {
          mainRoom: true
        }
      })
    );

    expect(auditService.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ADMIN.id,
        action: "CREATE",
        entityType: "Group",
        entityId: GROUP_ID
      }),
      tx
    );
  });

  test("createGroup should trim group name", async () => {
    await realService.createGroup(
      {
        ...validGroup,
        name: " Group A "
      },
      ADMIN
    );

    expect(tx.group.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Group A"
        })
      })
    );
  });

  test("createGroup should use default values", async () => {
    await realService.createGroup(
      {
        name: "Group A",
        ageFromMonths: 24,
        ageToMonths: 71
      },
      ADMIN
    );

    expect(tx.group.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          capacity: 20,
          mealCategory: null,
          mainRoomId: null,
          status: "ACTIVE"
        })
      })
    );
  });

  test("createGroup should reject invalid age range", async () => {
    await expect(
      realService.createGroup(
        {
          ...validGroup,
          ageFromMonths: 60,
          ageToMonths: 30
        },
        ADMIN
      )
    ).rejects.toMatchObject({
      code: "INVALID_AGE_RANGE"
    });
  });

  test("createGroup should reject duplicate group name", async () => {
    tx.group.findFirst.mockResolvedValue(group);

    await expect(
      realService.createGroup(validGroup, ADMIN)
    ).rejects.toMatchObject({
      code: "GROUP_NAME_EXISTS"
    });
  });

  test("createGroup should reject when room does not exist", async () => {
    tx.room.findUnique.mockResolvedValue(null);

    await expect(
      realService.createGroup(
        {
          ...validGroup,
          mainRoomId: ROOM_ID
        },
        ADMIN
      )
    ).rejects.toMatchObject({
      code: "ROOM_NOT_FOUND"
    });
  });

  test("createGroup should reject inactive room", async () => {
    tx.room.findUnique.mockResolvedValue({
      id: ROOM_ID,
      status: "INACTIVE"
    });

    await expect(
      realService.createGroup(
        {
          ...validGroup,
          mainRoomId: ROOM_ID
        },
        ADMIN
      )
    ).rejects.toMatchObject({
      code: "ROOM_NOT_FOUND"
    });
  });

  test("createGroup should reject already assigned room", async () => {
    tx.group.findFirst.mockResolvedValueOnce(null);
    tx.group.findFirst.mockResolvedValueOnce(group);

    await expect(
      realService.createGroup(
        {
          ...validGroup,
          mainRoomId: ROOM_ID
        },
        ADMIN
      )
    ).rejects.toMatchObject({
      code: "ROOM_ALREADY_ASSIGNED"
    });
  });

  test("createGroup should reject user without management access", async () => {
    await expect(
      realService.createGroup(validGroup, PARENT)
    ).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
  });

  test("updateGroup should update group", async () => {
    const updatedGroup = {
      ...group,
      name: "Group B"
    };

    tx.group.update.mockResolvedValue(updatedGroup);

    const result = await realService.updateGroup(
      GROUP_ID,
      { name: "Group B" },
      ADMIN
    );

    expect(result).toEqual(updatedGroup);

    expect(tx.group.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: GROUP_ID },
        data: {
          name: "Group B"
        }
      })
    );

    expect(auditService.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ADMIN.id,
        action: "UPDATE",
        entityType: "Group",
        entityId: GROUP_ID
      }),
      tx
    );
  });

  test("updateGroup should reject when group does not exist", async () => {
    tx.group.findUnique.mockResolvedValue(null);

    await expect(
      realService.updateGroup(
        GROUP_ID,
        { name: "Group B" },
        ADMIN
      )
    ).rejects.toMatchObject({
      code: "GROUP_NOT_FOUND"
    });
  });

  test("updateGroup should reject archived group", async () => {
    tx.group.findUnique.mockResolvedValue({
      ...group,
      status: "ARCHIVED"
    });

    await expect(
      realService.updateGroup(
        GROUP_ID,
        { name: "Group B" },
        ADMIN
      )
    ).rejects.toMatchObject({
      code: "GROUP_NOT_FOUND"
    });
  });

  test("updateGroup should reject invalid age range", async () => {
    await expect(
      realService.updateGroup(
        GROUP_ID,
        {
          ageFromMonths: 60,
          ageToMonths: 30
        },
        ADMIN
      )
    ).rejects.toMatchObject({
      code: "INVALID_AGE_RANGE"
    });
  });

  test("updateGroup should reject duplicate group name", async () => {
    tx.group.findFirst.mockResolvedValue(group);

    await expect(
      realService.updateGroup(
        GROUP_ID,
        { name: "Another group" },
        ADMIN
      )
    ).rejects.toMatchObject({
      code: "GROUP_NAME_EXISTS"
    });
  });

  test("updateGroup should reject capacity below enrolled children count", async () => {
    tx.groupEnrollment.findMany.mockResolvedValue([
      enrollment,
      { ...enrollment, id: "eeeeeeeeeeeeeeeeeeeeeeee" }
    ]);

    await expect(
      realService.updateGroup(
        GROUP_ID,
        { capacity: 1 },
        ADMIN
      )
    ).rejects.toMatchObject({
      code: "CAPACITY_BELOW_ENROLLED"
    });
  });

  test("updateGroup should reject age range that excludes enrolled child", async () => {
    tx.groupEnrollment.findMany.mockResolvedValue([
      {
        ...enrollment,
        child: {
          ...child,
          birthDate: new Date(Date.now() - 60 * 30 * 24 * 60 * 60 * 1000)
        }
      }
    ]);

    await expect(
      realService.updateGroup(
        GROUP_ID,
        {
          ageFromMonths: 24,
          ageToMonths: 30
        },
        ADMIN
      )
    ).rejects.toMatchObject({
      code: "AGE_MISMATCH"
    });
  });

  test("updateGroup should reject deactivation when group has active children", async () => {
    tx.groupEnrollment.findMany.mockResolvedValue([enrollment]);

    await expect(
      realService.updateGroup(
        GROUP_ID,
        { status: "INACTIVE" },
        ADMIN
      )
    ).rejects.toMatchObject({
      code: "GROUP_HAS_ACTIVE_CHILDREN"
    });
  });

  test("updateGroup should reject user without management access", async () => {
    await expect(
      realService.updateGroup(
        GROUP_ID,
        { name: "Group B" },
        PARENT
      )
    ).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
  });

  test("softDeleteGroup should archive group", async () => {
    const archivedGroup = {
      ...group,
      status: "ARCHIVED",
      archivedAt: new Date(),
      mainRoomId: null
    };

    tx.group.update.mockResolvedValue(archivedGroup);

    const result = await realService.softDeleteGroup(
      GROUP_ID,
      ADMIN
    );

    expect(result).toEqual(archivedGroup);

    expect(tx.group.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: GROUP_ID },
        data: expect.objectContaining({
          status: "ARCHIVED",
          mainRoomId: null,
          archivedAt: expect.any(Date)
        })
      })
    );

    expect(auditService.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ADMIN.id,
        action: "ARCHIVE",
        entityType: "Group",
        entityId: GROUP_ID
      }),
      tx
    );
  });

  test("softDeleteGroup should reject group with active children", async () => {
    tx.groupEnrollment.count.mockResolvedValue(1);

    await expect(
      realService.softDeleteGroup(GROUP_ID, ADMIN)
    ).rejects.toMatchObject({
      code: "GROUP_HAS_ACTIVE_CHILDREN"
    });
  });

  test("softDeleteGroup should reject when group does not exist", async () => {
    tx.group.findUnique.mockResolvedValue(null);

    await expect(
      realService.softDeleteGroup(GROUP_ID, ADMIN)
    ).rejects.toMatchObject({
      code: "GROUP_NOT_FOUND"
    });
  });

  test("softDeleteGroup should reject user without management access", async () => {
    await expect(
      realService.softDeleteGroup(GROUP_ID, PARENT)
    ).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
  });

  test("enrollChild should enroll child", async () => {
    const result = await realService.enrollChild(
      GROUP_ID,
      { childId: CHILD_ID },
      ADMIN
    );

    expect(result).toEqual(enrollment);

    expect(tx.groupEnrollment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          childId: CHILD_ID,
          groupId: GROUP_ID,
          startDate: expect.any(Date)
        },
        include: {
          child: true,
          group: true
        }
      })
    );

    expect(auditService.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ADMIN.id,
        action: "CREATE",
        entityType: "GroupEnrollment",
        entityId: ENROLLMENT_ID
      }),
      tx
    );
  });

  test("enrollChild should reject when group does not exist", async () => {
    tx.group.findUnique.mockResolvedValue(null);

    await expect(
      realService.enrollChild(
        GROUP_ID,
        { childId: CHILD_ID },
        ADMIN
      )
    ).rejects.toMatchObject({
      code: "GROUP_NOT_FOUND"
    });
  });

  test("enrollChild should reject inactive group", async () => {
    tx.group.findUnique.mockResolvedValue({
      ...group,
      status: "INACTIVE"
    });

    await expect(
      realService.enrollChild(
        GROUP_ID,
        { childId: CHILD_ID },
        ADMIN
      )
    ).rejects.toMatchObject({
      code: "GROUP_NOT_ACTIVE"
    });
  });

  test("enrollChild should reject when child does not exist", async () => {
    tx.child.findUnique.mockResolvedValue(null);

    await expect(
      realService.enrollChild(
        GROUP_ID,
        { childId: CHILD_ID },
        ADMIN
      )
    ).rejects.toMatchObject({
      code: "CHILD_NOT_FOUND"
    });
  });

  test("enrollChild should reject inactive child", async () => {
    tx.child.findUnique.mockResolvedValue({
      ...child,
      status: "INACTIVE"
    });

    await expect(
      realService.enrollChild(
        GROUP_ID,
        { childId: CHILD_ID },
        ADMIN
      )
    ).rejects.toMatchObject({
      code: "CHILD_NOT_ACTIVE"
    });
  });

  test("enrollChild should reject child with age outside group range", async () => {
    tx.child.findUnique.mockResolvedValue({
      ...child,
      birthDate: new Date(Date.now() - 90 * 30 * 24 * 60 * 60 * 1000)
    });

    await expect(
      realService.enrollChild(
        GROUP_ID,
        { childId: CHILD_ID },
        ADMIN
      )
    ).rejects.toMatchObject({
      code: "AGE_MISMATCH"
    });
  });

  test("enrollChild should reject child already enrolled", async () => {
    tx.groupEnrollment.findFirst.mockResolvedValue(enrollment);

    await expect(
      realService.enrollChild(
        GROUP_ID,
        { childId: CHILD_ID },
        ADMIN
      )
    ).rejects.toMatchObject({
      code: "CHILD_ALREADY_ENROLLED"
    });
  });

  test("enrollChild should reject when group capacity is exceeded", async () => {
    tx.groupEnrollment.count.mockResolvedValue(group.capacity);

    await expect(
      realService.enrollChild(
        GROUP_ID,
        { childId: CHILD_ID },
        ADMIN
      )
    ).rejects.toMatchObject({
      code: "GROUP_CAPACITY_EXCEEDED"
    });
  });

  test("enrollChild should reject user without management access", async () => {
    await expect(
      realService.enrollChild(
        GROUP_ID,
        { childId: CHILD_ID },
        PARENT
      )
    ).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
  });

  test("completeEnrollment should complete enrollment", async () => {
    const completedEnrollment = {
      ...enrollment,
      endDate: new Date()
    };

    tx.groupEnrollment.update.mockResolvedValue(
      completedEnrollment
    );

    const result = await realService.completeEnrollment(
      ENROLLMENT_ID,
      ADMIN
    );

    expect(result).toEqual(completedEnrollment);

    expect(tx.groupEnrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ENROLLMENT_ID },
        data: {
          endDate: expect.any(Date)
        }
      })
    );

    expect(auditService.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ADMIN.id,
        action: "CANCEL",
        entityType: "GroupEnrollment",
        entityId: ENROLLMENT_ID
      }),
      tx
    );
  });

  test("completeEnrollment should reject when enrollment does not exist", async () => {
    tx.groupEnrollment.findUnique.mockResolvedValue(null);

    await expect(
      realService.completeEnrollment(ENROLLMENT_ID, ADMIN)
    ).rejects.toMatchObject({
      code: "ENROLLMENT_NOT_FOUND"
    });
  });

  test("completeEnrollment should reject already completed enrollment", async () => {
    tx.groupEnrollment.findUnique.mockResolvedValue({
      ...enrollment,
      endDate: new Date()
    });

    await expect(
      realService.completeEnrollment(ENROLLMENT_ID, ADMIN)
    ).rejects.toMatchObject({
      code: "ENROLLMENT_ALREADY_CLOSED"
    });
  });

  test("completeEnrollment should reject user without management access", async () => {
    await expect(
      realService.completeEnrollment(
        ENROLLMENT_ID,
        PARENT
      )
    ).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
  });

  test("getGroupHistory should return group enrollments", async () => {
    const result = await realService.getGroupHistory(
      GROUP_ID,
      ADMIN
    );

    expect(result).toEqual([enrollment]);

    expect(prisma.groupEnrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          groupId: GROUP_ID,
          child: {}
        },
        orderBy: { startDate: "desc" }
      })
    );
  });

  test("getGroupHistory should reject when group does not exist", async () => {
    prisma.group.findFirst.mockResolvedValue(null);

    await expect(
      realService.getGroupHistory(GROUP_ID, ADMIN)
    ).rejects.toMatchObject({
      code: "GROUP_NOT_FOUND"
    });
  });

  test("getGroupHistory should reject unauthenticated user", async () => {
    await expect(
      realService.getGroupHistory(GROUP_ID, null)
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });
  });

  test("getChildHistory should return child enrollments", async () => {
    const result = await realService.getChildHistory(
      CHILD_ID,
      ADMIN
    );

    expect(result).toEqual([enrollment]);

    expect(prisma.groupEnrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          childId: CHILD_ID
        },
        orderBy: { startDate: "desc" }
      })
    );
  });

  test("getChildHistory should reject when child does not exist", async () => {
    prisma.child.findFirst.mockResolvedValue(null);

    await expect(
      realService.getChildHistory(CHILD_ID, ADMIN)
    ).rejects.toMatchObject({
      code: "CHILD_NOT_FOUND"
    });
  });

  test("getChildHistory should reject unauthenticated user", async () => {
    await expect(
      realService.getChildHistory(CHILD_ID, null)
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });
  });
});
