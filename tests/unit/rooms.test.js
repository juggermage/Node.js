jest.mock("../../src/config/prisma", () => ({
  room: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  group: {
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
    middleware.validationProperty = property;
    middleware.schema = schema;
    return middleware;
  })
);

const prisma = require("../../src/config/prisma");
const auditService = require("../../src/modules/audit/audit.service");
const roomsService = require("../../src/modules/rooms/rooms.service");
const roomsController = require("../../src/modules/rooms/rooms.controller");
const roomsRoutes = require("../../src/modules/rooms/rooms.routes");
const validation = require("../../src/modules/rooms/rooms.validation");
const HTTP_STATUS = require("../../src/utils/http-status");

const requireAuth = require("../../src/middleware/auth.middleware");

const ROOM_ID = "507f1f77bcf86cd799439011";
const USER_ID = "507f1f77bcf86cd799439012";

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

const room = {
  id: ROOM_ID,
  name: "Room 101",
  purpose: "Learning",
  capacity: 25,
  status: "ACTIVE",
  createdAt: new Date()
};

const createRoomData = {
  name: "Room 101",
  purpose: "Learning",
  capacity: 25
};

function createResponse() {
  return {
    locals: {
      validated: {
        params: { id: ROOM_ID },
        query: {},
        body: createRoomData
      }
    },
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis()
  };
}

function expectErrorCode(promise, code) {
  return expect(promise).rejects.toMatchObject({ code });
}

describe("Rooms validation", () => {
  describe("createRoomSchema", () => {
    test("accepts valid room data", () => {
      const result = validation.createRoomSchema.validate(createRoomData);

      expect(result.error).toBeUndefined();
      expect(result.value.status).toBe("ACTIVE");
    });

    test("trims room name and purpose", () => {
      const result = validation.createRoomSchema.validate({
        name: " Room 101 ",
        purpose: " Learning ",
        capacity: 25
      });

      expect(result.error).toBeUndefined();
      expect(result.value.name).toBe("Room 101");
      expect(result.value.purpose).toBe("Learning");
    });

    test.each([
      [{ purpose: "Learning", capacity: 25 }],
      [{ name: "Room 101", capacity: 25 }],
      [{ name: "Room 101", purpose: "Learning" }]
    ])("rejects missing required fields", (data) => {
      const result = validation.createRoomSchema.validate(data);

      expect(result.error).toBeDefined();
    });

    test("rejects empty name", () => {
      const result = validation.createRoomSchema.validate({
        ...createRoomData,
        name: " "
      });

      expect(result.error).toBeDefined();
    });

    test("rejects empty purpose", () => {
      const result = validation.createRoomSchema.validate({
        ...createRoomData,
        purpose: " "
      });

      expect(result.error).toBeDefined();
    });

    test("rejects capacity less than 1", () => {
      const result = validation.createRoomSchema.validate({
        ...createRoomData,
        capacity: 0
      });

      expect(result.error).toBeDefined();
    });

    test("rejects non-integer capacity", () => {
      const result = validation.createRoomSchema.validate({
        ...createRoomData,
        capacity: 2.5
      });

      expect(result.error).toBeDefined();
    });

    test("rejects invalid status", () => {
      const result = validation.createRoomSchema.validate({
        ...createRoomData,
        status: "ARCHIVED"
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("updateRoomSchema", () => {
    test("accepts valid update data", () => {
      const result = validation.updateRoomSchema.validate({
        name: "New Room"
      });

      expect(result.error).toBeUndefined();
    });

    test("accepts all supported fields", () => {
      const result = validation.updateRoomSchema.validate({
        name: "New Room",
        purpose: "Activities",
        capacity: 30,
        status: "INACTIVE"
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects empty update object", () => {
      const result = validation.updateRoomSchema.validate({});

      expect(result.error).toBeDefined();
    });

    test("rejects invalid status", () => {
      const result = validation.updateRoomSchema.validate({
        status: "ARCHIVED"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects invalid capacity", () => {
      const result = validation.updateRoomSchema.validate({
        capacity: -1
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("roomIdSchema", () => {
    test("accepts valid MongoDB ObjectId", () => {
      const result = validation.roomIdSchema.validate({
        id: ROOM_ID
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects invalid id", () => {
      const result = validation.roomIdSchema.validate({
        id: "invalid-id"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects missing id", () => {
      const result = validation.roomIdSchema.validate({});

      expect(result.error).toBeDefined();
    });
  });

  describe("searchRoomSchema", () => {
    test("accepts valid search filters", () => {
      const result = validation.searchRoomSchema.validate({
        search: "Room",
        purpose: "Learning",
        status: "ACTIVE"
      });

      expect(result.error).toBeUndefined();
    });

    test("accepts empty search and purpose", () => {
      const result = validation.searchRoomSchema.validate({
        search: "",
        purpose: ""
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects invalid status", () => {
      const result = validation.searchRoomSchema.validate({
        status: "UNKNOWN"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects search longer than 100 characters", () => {
      const result = validation.searchRoomSchema.validate({
        search: "a".repeat(101)
      });

      expect(result.error).toBeDefined();
    });

    test("rejects purpose longer than 255 characters", () => {
      const result = validation.searchRoomSchema.validate({
        purpose: "a".repeat(256)
      });

      expect(result.error).toBeDefined();
    });
  });
});

describe("Rooms controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    jest.spyOn(roomsService, "getAll").mockResolvedValue([room]);
    jest.spyOn(roomsService, "getById").mockResolvedValue(room);
    jest.spyOn(roomsService, "create").mockResolvedValue(room);
    jest.spyOn(roomsService, "update").mockResolvedValue(room);
    jest.spyOn(roomsService, "remove").mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("getAll returns rooms", async () => {
    const req = { user: teacher };
    const res = createResponse();

    res.locals.validated.query = { search: "Room" };

    await roomsController.getAll(req, res);

    expect(roomsService.getAll).toHaveBeenCalledWith({ search: "Room" }, teacher);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [room]
    });
  });

  test("getById returns a room", async () => {
    const req = { user: teacher };
    const res = createResponse();

    await roomsController.getById(req, res);

    expect(roomsService.getById).toHaveBeenCalledWith(ROOM_ID, teacher);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: room
    });
  });

  test("create returns created room", async () => {
    const req = { user: admin };
    const res = createResponse();

    await roomsController.create(req, res);

    expect(roomsService.create).toHaveBeenCalledWith(createRoomData, admin);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: room
    });
  });

  test("update returns updated room", async () => {
    const req = { user: manager };
    const res = createResponse();

    const updatedRoom = {
      ...room,
      name: "Updated Room"
    };

    res.locals.validated.body = { name: "Updated Room" };

    roomsService.update.mockResolvedValue(updatedRoom);

    await roomsController.update(req, res);

    expect(roomsService.update).toHaveBeenCalledWith(ROOM_ID, { name: "Updated Room" }, manager);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: updatedRoom
    });
  });

  test("remove returns no content", async () => {
    const req = { user: admin };
    const res = createResponse();

    await roomsController.remove(req, res);

    expect(roomsService.remove).toHaveBeenCalledWith(ROOM_ID, admin);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.NO_CONTENT);
    expect(res.send).toHaveBeenCalled();
  });
});

describe("Rooms service", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    prisma.$transaction.mockImplementation(async (callback) => {
      return callback(prisma);
    });

    prisma.room.findFirst.mockResolvedValue(null);
    prisma.room.findMany.mockResolvedValue([]);
    prisma.room.create.mockResolvedValue(room);
    prisma.room.update.mockResolvedValue(room);
    prisma.group.count.mockResolvedValue(0);
    auditService.createLog.mockResolvedValue({});
  });

  describe("getAll", () => {
    test("returns all rooms for a teacher", async () => {
      prisma.room.findMany.mockResolvedValue([room]);

      const result = await roomsService.getAll({}, teacher);

      expect(result).toEqual([room]);

      expect(prisma.room.findMany).toHaveBeenCalledWith({
        where: {
          status: { not: "ARCHIVED" }
        },
        include: {
          mainGroups: {
            where: {
              status: "ACTIVE"
            },
            select: {
              id: true,
              name: true,
              capacity: true
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        }
      });
    });

    test("filters rooms by search", async () => {
      await roomsService.getAll({ search: " Room " }, admin);

      expect(prisma.room.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: {
              contains: "Room",
              mode: "insensitive"
            }
          })
        })
      );
    });

    test("filters rooms by purpose", async () => {
      await roomsService.getAll({ purpose: " Learning " }, admin);

      expect(prisma.room.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            purpose: {
              contains: "Learning",
              mode: "insensitive"
            }
          })
        })
      );
    });

    test("filters rooms by status", async () => {
      await roomsService.getAll({ status: "INACTIVE" }, admin);

      expect(prisma.room.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: "INACTIVE"
          }
        })
      );
    });

    test("rejects user without read permissions", async () => {
      await expectErrorCode(
        roomsService.getAll(
          {},
          {
            id: USER_ID,
            role: "PARENT"
          }
        ),
        "FORBIDDEN"
      );

      expect(prisma.room.findMany).not.toHaveBeenCalled();
    });

    test("rejects unauthenticated user", async () => {
      await expectErrorCode(roomsService.getAll({}, null), "UNAUTHORIZED");

      expect(prisma.room.findMany).not.toHaveBeenCalled();
    });
  });

  describe("getById", () => {
    test("returns room by id", async () => {
      prisma.room.findFirst.mockResolvedValue(room);

      const result = await roomsService.getById(ROOM_ID, teacher);

      expect(result).toEqual(room);

      expect(prisma.room.findFirst).toHaveBeenCalledWith({
        where: {
          id: ROOM_ID,
          status: { not: "ARCHIVED" }
        },
        include: {
          mainGroups: {
            where: {
              status: "ACTIVE"
            },
            select: {
              id: true,
              name: true,
              capacity: true
            }
          }
        }
      });
    });

    test("throws ROOM_NOT_FOUND when room does not exist", async () => {
      await expectErrorCode(roomsService.getById(ROOM_ID, admin), "ROOM_NOT_FOUND");
    });

    test("rejects user without read permissions", async () => {
      await expectErrorCode(
        roomsService.getById(ROOM_ID, {
          id: USER_ID,
          role: "PARENT"
        }),
        "FORBIDDEN"
      );

      expect(prisma.room.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("create", () => {
    test("creates a room and writes audit log", async () => {
      const result = await roomsService.create(
        {
          name: " Room 101 ",
          purpose: " Learning ",
          capacity: 25
        },
        admin
      );

      expect(result).toEqual(room);

      expect(prisma.room.findFirst).toHaveBeenCalledWith({
        where: {
          name: {
            equals: "Room 101",
            mode: "insensitive"
          }
        }
      });

      expect(prisma.room.create).toHaveBeenCalledWith({
        data: {
          name: "Room 101",
          purpose: "Learning",
          capacity: 25,
          status: "ACTIVE"
        }
      });

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: USER_ID,
          action: "CREATE",
          entityType: "Room",
          entityId: room.id,
          after: room
        }),
        prisma
      );
    });

    test("rejects duplicate room name", async () => {
      prisma.room.findFirst.mockResolvedValue(room);

      await expectErrorCode(roomsService.create(createRoomData, admin), "ROOM_NAME_EXISTS");

      expect(prisma.room.create).not.toHaveBeenCalled();
    });

    test("uses provided status", async () => {
      await roomsService.create(
        {
          ...createRoomData,
          status: "INACTIVE"
        },
        manager
      );

      expect(prisma.room.create).toHaveBeenCalledWith({
        data: {
          ...createRoomData,
          status: "INACTIVE"
        }
      });
    });

    test("rejects teacher access", async () => {
      await expectErrorCode(roomsService.create(createRoomData, teacher), "FORBIDDEN");

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test.each([
      ["P2002", "ROOM_NAME_EXISTS"],
      ["P2025", "RELATED_RECORD_NOT_FOUND"],
      ["P2003", "RELATED_RECORD_NOT_FOUND"]
    ])("maps Prisma error %s", async (prismaCode, expectedCode) => {
      prisma.room.create.mockRejectedValue({
        code: prismaCode
      });

      await expectErrorCode(roomsService.create(createRoomData, admin), expectedCode);
    });
  });

  describe("update", () => {
    test("updates room and writes audit log", async () => {
      const updatedRoom = {
        ...room,
        name: "Updated Room"
      };

      prisma.room.findFirst.mockResolvedValueOnce(room).mockResolvedValueOnce(null);

      prisma.room.update.mockResolvedValue(updatedRoom);

      const result = await roomsService.update(ROOM_ID, { name: " Updated Room " }, admin);

      expect(result).toEqual(updatedRoom);

      expect(prisma.room.update).toHaveBeenCalledWith({
        where: { id: ROOM_ID },
        data: {
          name: "Updated Room"
        }
      });

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: USER_ID,
          action: "UPDATE",
          entityType: "Room",
          entityId: ROOM_ID,
          before: room,
          after: updatedRoom
        }),
        prisma
      );
    });

    test("updates only provided fields", async () => {
      prisma.room.findFirst.mockResolvedValueOnce(room);

      await roomsService.update(ROOM_ID, { capacity: 30 }, manager);

      expect(prisma.room.update).toHaveBeenCalledWith({
        where: { id: ROOM_ID },
        data: {
          capacity: 30
        }
      });
    });

    test("does not check uniqueness when name is not provided", async () => {
      prisma.room.findFirst.mockResolvedValueOnce(room);

      await roomsService.update(ROOM_ID, { purpose: "New purpose" }, admin);

      expect(prisma.room.findFirst).toHaveBeenCalledTimes(1);
    });

    test("checks unique name excluding current room", async () => {
      prisma.room.findFirst.mockResolvedValueOnce(room).mockResolvedValueOnce(null);

      await roomsService.update(ROOM_ID, { name: "New Room" }, admin);

      expect(prisma.room.findFirst).toHaveBeenNthCalledWith(2, {
        where: {
          name: {
            equals: "New Room",
            mode: "insensitive"
          },
          id: {
            not: ROOM_ID
          }
        }
      });
    });

    test("rejects duplicate room name", async () => {
      prisma.room.findFirst.mockResolvedValueOnce(room).mockResolvedValueOnce({
        ...room,
        id: "507f1f77bcf86cd799439099"
      });

      await expectErrorCode(
        roomsService.update(ROOM_ID, { name: "Room 101" }, admin),
        "ROOM_NAME_EXISTS"
      );

      expect(prisma.room.update).not.toHaveBeenCalled();
    });

    test("throws ROOM_NOT_FOUND when room does not exist", async () => {
      await expectErrorCode(
        roomsService.update(ROOM_ID, { name: "New Room" }, admin),
        "ROOM_NOT_FOUND"
      );
    });

    test("rejects teacher access", async () => {
      await expectErrorCode(
        roomsService.update(ROOM_ID, { name: "New Room" }, teacher),
        "FORBIDDEN"
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test("maps Prisma P2002 error", async () => {
      prisma.room.findFirst.mockResolvedValueOnce(room);

      prisma.room.update.mockRejectedValue({
        code: "P2002"
      });

      await expectErrorCode(
        roomsService.update(ROOM_ID, { capacity: 30 }, admin),
        "ROOM_NAME_EXISTS"
      );
    });

    test("maps Prisma P2025 error", async () => {
      prisma.room.findFirst.mockResolvedValueOnce(room);

      prisma.room.update.mockRejectedValue({
        code: "P2025"
      });

      await expectErrorCode(
        roomsService.update(ROOM_ID, { capacity: 30 }, admin),
        "RELATED_RECORD_NOT_FOUND"
      );
    });
  });

  describe("remove", () => {
    test("archives room and writes audit log", async () => {
      const archivedRoom = {
        ...room,
        status: "ARCHIVED",
        archivedAt: new Date()
      };

      prisma.room.findFirst.mockResolvedValue(room);
      prisma.room.update.mockResolvedValue(archivedRoom);

      await roomsService.remove(ROOM_ID, admin);

      expect(prisma.group.count).toHaveBeenCalledWith({
        where: {
          mainRoomId: ROOM_ID,
          status: "ACTIVE"
        }
      });

      expect(prisma.room.update).toHaveBeenCalledWith({
        where: { id: ROOM_ID },
        data: expect.objectContaining({
          status: "ARCHIVED",
          archivedAt: expect.any(Date)
        })
      });

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: USER_ID,
          action: "ARCHIVE",
          entityType: "Room",
          entityId: ROOM_ID,
          before: room,
          after: archivedRoom
        }),
        prisma
      );
    });

    test("rejects archiving room assigned to active group", async () => {
      prisma.room.findFirst.mockResolvedValue(room);
      prisma.group.count.mockResolvedValue(1);

      await expectErrorCode(roomsService.remove(ROOM_ID, admin), "ROOM_IN_USE");

      expect(prisma.room.update).not.toHaveBeenCalled();
      expect(auditService.createLog).not.toHaveBeenCalled();
    });

    test("allows archiving room without active groups", async () => {
      prisma.room.findFirst.mockResolvedValue(room);
      prisma.group.count.mockResolvedValue(0);

      await roomsService.remove(ROOM_ID, manager);

      expect(prisma.room.update).toHaveBeenCalled();
    });

    test("throws ROOM_NOT_FOUND when room does not exist", async () => {
      await expectErrorCode(roomsService.remove(ROOM_ID, admin), "ROOM_NOT_FOUND");

      expect(prisma.group.count).not.toHaveBeenCalled();
    });

    test("rejects teacher access", async () => {
      await expectErrorCode(roomsService.remove(ROOM_ID, teacher), "FORBIDDEN");

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});

describe("Rooms routes", () => {
  function getRoutes() {
    return roomsRoutes.stack
      .filter((layer) => layer.route)
      .map((layer) => ({
        path: layer.route.path,
        method: Object.keys(layer.route.methods)[0],
        handlers: layer.route.stack.map((item) => item.handle)
      }));
  }

  test("uses authentication middleware", () => {
    const authLayer = roomsRoutes.stack.find((layer) => layer.handle === requireAuth);

    expect(authLayer).toBeDefined();
  });

  test("defines all required routes", () => {
    const routes = getRoutes();

    expect(routes.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "get /",
      "get /:id",
      "post /",
      "patch /:id",
      "delete /:id"
    ]);
  });

  test("GET routes allow all read roles", () => {
    const routes = getRoutes();

    const expectedRoles = ["ADMIN", "MANAGER", "TEACHER", "EDUCATOR", "ASSISTANT"];

    const getAllRoute = routes.find((item) => item.method === "get" && item.path === "/");

    const getByIdRoute = routes.find((item) => item.method === "get" && item.path === "/:id");

    expect(getAllRoute.handlers[0].allowedRoles).toEqual(expectedRoles);
    expect(getByIdRoute.handlers[0].allowedRoles).toEqual(expectedRoles);
  });

  test("management routes allow only ADMIN and MANAGER", () => {
    const routes = getRoutes();

    const expectedRoles = ["ADMIN", "MANAGER"];

    const postRoute = routes.find((item) => item.method === "post" && item.path === "/");

    const patchRoute = routes.find((item) => item.method === "patch" && item.path === "/:id");

    const deleteRoute = routes.find((item) => item.method === "delete" && item.path === "/:id");

    expect(postRoute.handlers[0].allowedRoles).toEqual(expectedRoles);
    expect(patchRoute.handlers[0].allowedRoles).toEqual(expectedRoles);
    expect(deleteRoute.handlers[0].allowedRoles).toEqual(expectedRoles);
  });

  test("GET / uses query validation", () => {
    const route = getRoutes().find((item) => item.method === "get" && item.path === "/");

    expect(route.handlers[1].validationProperty).toBe("query");
    expect(route.handlers[1].schema).toBe(validation.searchRoomSchema);
  });

  test("GET /:id uses params validation", () => {
    const route = getRoutes().find((item) => item.method === "get" && item.path === "/:id");

    expect(route.handlers[1].validationProperty).toBe("params");
    expect(route.handlers[1].schema).toBe(validation.roomIdSchema);
  });

  test("POST / uses body validation", () => {
    const route = getRoutes().find((item) => item.method === "post" && item.path === "/");

    expect(route.handlers[1].validationProperty).toBe("body");
    expect(route.handlers[1].schema).toBe(validation.createRoomSchema);
  });

  test("PATCH /:id validates params and body", () => {
    const route = getRoutes().find((item) => item.method === "patch" && item.path === "/:id");

    expect(route.handlers[1].validationProperty).toBe("params");
    expect(route.handlers[1].schema).toBe(validation.roomIdSchema);

    expect(route.handlers[2].validationProperty).toBe("body");
    expect(route.handlers[2].schema).toBe(validation.updateRoomSchema);
  });

  test("DELETE /:id uses params validation", () => {
    const route = getRoutes().find((item) => item.method === "delete" && item.path === "/:id");

    expect(route.handlers[1].validationProperty).toBe("params");
    expect(route.handlers[1].schema).toBe(validation.roomIdSchema);
  });
});
