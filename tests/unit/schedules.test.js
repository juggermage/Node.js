
jest.mock("../../src/config/prisma", () => ({
  schedule: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  },
  scheduleItem: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn()
  },
  group: {
    findFirst: jest.fn()
  },
  subject: {
    findFirst: jest.fn()
  },
  employee: {
    findFirst: jest.fn(),
    findMany: jest.fn()
  },
  room: {
    findFirst: jest.fn(),
    findMany: jest.fn()
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

const Joi = require("joi");
const { ScheduleStatus, ScheduleItemType } = require("@prisma/client");

const prisma = require("../../src/config/prisma");
const auditService = require("../../src/modules/audit/audit.service");

const schedulesService = require("../../src/modules/schedules/schedules.service");
const schedulesGenerator = require("../../src/modules/schedules/schedules.generator");
const schedulesController = require("../../src/modules/schedules/schedules.controller");
const schedulesRoutes = require("../../src/modules/schedules/schedules.routes");
const schedulesValidation = require("../../src/modules/schedules/schedules.validation");

const rules = require("../../src/modules/schedules/schedules.rules");
const config = require("../../src/modules/schedules/schedules.config");

const HTTP_STATUS = require("../../src/utils/http-status");
const AppError = require("../../src/utils/app-error");

const requireAuth = require("../../src/middleware/auth.middleware");

const SCHEDULE_ID = "507f1f77bcf86cd799439011";
const ITEM_ID = "507f1f77bcf86cd799439012";
const GROUP_ID = "507f1f77bcf86cd799439013";
const SUBJECT_ID = "507f1f77bcf86cd799439014";
const TEACHER_ID = "507f1f77bcf86cd799439015";
const ROOM_ID = "507f1f77bcf86cd799439016";
const USER_ID = "507f1f77bcf86cd799439017";

const user = {
  id: USER_ID,
  role: "ADMIN"
};

const schedule = {
  id: SCHEDULE_ID,
  groupId: GROUP_ID,
  name: "Test schedule",
  status: "DRAFT",
  validFrom: new Date("2026-01-01T00:00:00.000Z"),
  validTo: new Date("2026-06-30T00:00:00.000Z")
};

const lesson = {
  id: ITEM_ID,
  scheduleId: SCHEDULE_ID,
  type: "LESSON",
  dayOfWeek: 1,
  startTime: "09:00",
  endTime: "09:40",
  subjectId: SUBJECT_ID,
  teacherId: TEACHER_ID,
  roomId: ROOM_ID,
  status: "ACTIVE"
};

const createScheduleData = {
  groupId: GROUP_ID,
  name: "Test schedule",
  validFrom: "2026-01-01",
  validTo: "2026-06-30"
};

const createLessonData = {
  type: "LESSON",
  dayOfWeek: 1,
  startTime: "09:00",
  endTime: "09:40",
  subjectId: SUBJECT_ID,
  teacherId: TEACHER_ID,
  roomId: ROOM_ID
};

function createResponse() {
  return {
    locals: {
      validated: {
        params: {
          id: SCHEDULE_ID,
          itemId: ITEM_ID
        },
        query: {},
        body: createScheduleData
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

function setupTransaction() {
  prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
}

function setupActiveReferences() {
  prisma.group.findFirst.mockImplementation(async (args = {}) => {
    const where = args.where || {};

    if (
      where.mainRoomId ||
      where.mainRoom?.is ||
      where.id?.not ||
      where.NOT
    ) {
      return null;
    }

    return {
      id: GROUP_ID,
      status: "ACTIVE"
    };
  });

  prisma.subject.findFirst.mockResolvedValue({
    id: SUBJECT_ID,
    status: "ACTIVE"
  });

  prisma.employee.findFirst.mockResolvedValue({
    id: TEACHER_ID,
    status: "ACTIVE"
  });

  prisma.room.findFirst.mockResolvedValue({
    id: ROOM_ID,
    status: "ACTIVE"
  });
}

beforeEach(() => {
  jest.clearAllMocks();

  setupTransaction();
  setupActiveReferences();

  prisma.schedule.findMany.mockResolvedValue([]);
  prisma.schedule.findUnique.mockResolvedValue(schedule);
  prisma.schedule.create.mockResolvedValue(schedule);
  prisma.schedule.update.mockResolvedValue(schedule);
  prisma.schedule.delete.mockResolvedValue(schedule);

  prisma.scheduleItem.findMany.mockResolvedValue([]);
  prisma.scheduleItem.findFirst.mockResolvedValue(lesson);
  prisma.scheduleItem.create.mockResolvedValue(lesson);
  prisma.scheduleItem.update.mockResolvedValue(lesson);
  prisma.scheduleItem.delete.mockResolvedValue(lesson);
  prisma.scheduleItem.deleteMany.mockResolvedValue({ count: 0 });

  auditService.createLog.mockResolvedValue({});
});

describe("Schedules rules", () => {
  describe("toMinutes", () => {
    test("converts time to minutes", () => {
      expect(rules.toMinutes("09:00")).toBe(540);
      expect(rules.toMinutes("10:30")).toBe(630);
      expect(rules.toMinutes("14:45")).toBe(885);
    });
  });

  describe("timeRangesOverlap", () => {
    test("returns true when intervals overlap", () => {
      expect(
        rules.timeRangesOverlap("09:00", "10:00", "09:30", "10:30")
      ).toBe(true);
    });

    test("returns false when intervals do not overlap", () => {
      expect(
        rules.timeRangesOverlap("09:00", "10:00", "10:00", "11:00")
      ).toBe(false);
    });

    test("returns false when intervals are separate", () => {
      expect(
        rules.timeRangesOverlap("09:00", "10:00", "11:00", "12:00")
      ).toBe(false);
    });

    test("returns true when one interval contains another", () => {
      expect(
        rules.timeRangesOverlap("09:00", "12:00", "10:00", "11:00")
      ).toBe(true);
    });
  });

  describe("periodsOverlap", () => {
    test("returns true when periods overlap", () => {
      expect(
        rules.periodsOverlap(
          {
            validFrom: "2026-01-01",
            validTo: "2026-06-30"
          },
          {
            validFrom: "2026-05-01",
            validTo: "2026-12-31"
          }
        )
      ).toBe(true);
    });

    test("returns false when periods do not overlap", () => {
      expect(
        rules.periodsOverlap(
          {
            validFrom: "2026-01-01",
            validTo: "2026-03-31"
          },
          {
            validFrom: "2026-04-01",
            validTo: "2026-06-30"
          }
        )
      ).toBe(false);
    });

    test("handles period without end date", () => {
      expect(
        rules.periodsOverlap(
          {
            validFrom: "2026-01-01",
            validTo: null
          },
          {
            validFrom: "2026-12-01",
            validTo: "2027-01-01"
          }
        )
      ).toBe(true);
    });
  });

  describe("isInsideWorkDay", () => {
    test("accepts time inside working hours", () => {
      expect(rules.isInsideWorkDay("09:00", "10:00")).toBe(true);
    });

    test("accepts interval at working day boundaries", () => {
      expect(rules.isInsideWorkDay("08:00", "16:00")).toBe(true);
    });

    test("rejects time before working day", () => {
      expect(rules.isInsideWorkDay("07:00", "08:00")).toBe(false);
    });

    test("rejects time after working day", () => {
      expect(rules.isInsideWorkDay("15:30", "16:30")).toBe(false);
    });
  });

  describe("findRestrictedWindow", () => {
    test("finds breakfast interval", () => {
      expect(rules.findRestrictedWindow("08:40", "09:00")).toMatchObject({
        name: "BREAKFAST"
      });
    });

    test("finds lunch interval", () => {
      expect(rules.findRestrictedWindow("12:00", "12:20")).toMatchObject({
        name: "LUNCH"
      });
    });

    test("finds sleep interval", () => {
      expect(rules.findRestrictedWindow("13:15", "13:45")).toMatchObject({
        name: "SLEEP"
      });
    });

    test("finds snack interval", () => {
      expect(rules.findRestrictedWindow("15:00", "15:20")).toMatchObject({
        name: "SNACK"
      });
    });

    test("returns null outside restricted intervals", () => {
      expect(rules.findRestrictedWindow("09:00", "09:40")).toBeNull();
    });
  });

  describe("findTimeOverlap", () => {
    test("finds overlapping item on the same day", () => {
      const items = [
        {
          id: ITEM_ID,
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "10:00"
        }
      ];

      const result = rules.findTimeOverlap(
        {
          dayOfWeek: 1,
          startTime: "09:30",
          endTime: "10:30"
        },
        items
      );

      expect(result).toEqual(items[0]);
    });

    test("ignores items from another day", () => {
      const items = [
        {
          id: ITEM_ID,
          dayOfWeek: 2,
          startTime: "09:00",
          endTime: "10:00"
        }
      ];

      expect(
        rules.findTimeOverlap(
          {
            dayOfWeek: 1,
            startTime: "09:30",
            endTime: "10:30"
          },
          items
        )
      ).toBeNull();
    });

    test("ignores excluded item", () => {
      const items = [
        {
          id: ITEM_ID,
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "10:00"
        }
      ];

      expect(
        rules.findTimeOverlap(
          {
            dayOfWeek: 1,
            startTime: "09:30",
            endTime: "10:30"
          },
          items,
          ITEM_ID
        )
      ).toBeNull();
    });
  });

  describe("findResourceConflict", () => {
    test("finds conflict for the same resource", () => {
      const items = [
        {
          id: ITEM_ID,
          teacherId: TEACHER_ID,
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "10:00"
        }
      ];

      expect(
        rules.findResourceConflict(
          {
            teacherId: TEACHER_ID,
            dayOfWeek: 1,
            startTime: "09:30",
            endTime: "10:30"
          },
          items,
          "teacherId"
        )
      ).toEqual(items[0]);
    });

    test("returns null when resource is different", () => {
      const items = [
        {
          id: ITEM_ID,
          teacherId: TEACHER_ID,
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "10:00"
        }
      ];

      expect(
        rules.findResourceConflict(
          {
            teacherId: "507f1f77bcf86cd799439099",
            dayOfWeek: 1,
            startTime: "09:30",
            endTime: "10:30"
          },
          items,
          "teacherId"
        )
      ).toBeNull();
    });

    test("returns null when candidate has no resource", () => {
      expect(
        rules.findResourceConflict(
          {
            teacherId: null,
            dayOfWeek: 1,
            startTime: "09:30",
            endTime: "10:30"
          },
          [],
          "teacherId"
        )
      ).toBeNull();
    });
  });
});

describe("Schedules validation", () => {
  describe("scheduleIdSchema", () => {
    test("accepts valid id", () => {
      const result = schedulesValidation.scheduleIdSchema.validate({
        id: SCHEDULE_ID
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects invalid id", () => {
      const result = schedulesValidation.scheduleIdSchema.validate({
        id: "invalid"
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("itemParamsSchema", () => {
    test("accepts valid schedule and item ids", () => {
      const result = schedulesValidation.itemParamsSchema.validate({
        id: SCHEDULE_ID,
        itemId: ITEM_ID
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects invalid item id", () => {
      const result = schedulesValidation.itemParamsSchema.validate({
        id: SCHEDULE_ID,
        itemId: "invalid"
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("listSchedulesSchema", () => {
    test("accepts valid filters", () => {
      const result = schedulesValidation.listSchedulesSchema.validate({
        groupId: GROUP_ID,
        status: Object.values(ScheduleStatus)[0]
      });

      expect(result.error).toBeUndefined();
    });

    test("accepts empty filters", () => {
      const result = schedulesValidation.listSchedulesSchema.validate({});

      expect(result.error).toBeUndefined();
    });

    test("rejects invalid group id", () => {
      const result = schedulesValidation.listSchedulesSchema.validate({
        groupId: "invalid"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects invalid status", () => {
      const result = schedulesValidation.listSchedulesSchema.validate({
        status: "UNKNOWN"
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("createScheduleSchema", () => {
    test("accepts valid schedule data", () => {
      const result = schedulesValidation.createScheduleSchema.validate(
        createScheduleData
      );

      expect(result.error).toBeUndefined();
    });

    test("accepts null validTo", () => {
      const result = schedulesValidation.createScheduleSchema.validate({
        ...createScheduleData,
        validTo: null
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects invalid date format", () => {
      const result = schedulesValidation.createScheduleSchema.validate({
        ...createScheduleData,
        validFrom: "01-01-2026"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects impossible calendar date", () => {
      const result = schedulesValidation.createScheduleSchema.validate({
        ...createScheduleData,
        validFrom: "2026-02-30"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects validTo earlier than validFrom", () => {
      const result = schedulesValidation.createScheduleSchema.validate({
        ...createScheduleData,
        validFrom: "2026-06-30",
        validTo: "2026-01-01"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects missing group id", () => {
      const { groupId, ...data } = createScheduleData;

      const result = schedulesValidation.createScheduleSchema.validate(data);

      expect(result.error).toBeDefined();
    });

    test("rejects empty name", () => {
      const result = schedulesValidation.createScheduleSchema.validate({
        ...createScheduleData,
        name: " "
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("updateScheduleSchema", () => {
    test("accepts valid partial update", () => {
      const result = schedulesValidation.updateScheduleSchema.validate({
        name: "New name"
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects empty object", () => {
      const result = schedulesValidation.updateScheduleSchema.validate({});

      expect(result.error).toBeDefined();
    });

    test("rejects invalid period", () => {
      const result = schedulesValidation.updateScheduleSchema.validate({
        validFrom: "2026-06-30",
        validTo: "2026-01-01"
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("createItemSchema", () => {
    test("accepts valid lesson", () => {
      const result = schedulesValidation.createItemSchema.validate(
        createLessonData
      );

      expect(result.error).toBeUndefined();
    });

    test("accepts valid non-lesson item", () => {
      const type = Object.values(ScheduleItemType).find(
        (itemType) => itemType !== "LESSON"
      );

      if (!type) return;

      const result = schedulesValidation.createItemSchema.validate({
        type,
        dayOfWeek: 1,
        startTime: "08:30",
        endTime: "09:00"
      });

      expect(result.error).toBeUndefined();
    });

    test("requires subject for lesson", () => {
      const { subjectId, ...data } = createLessonData;

      const result = schedulesValidation.createItemSchema.validate(data);

      expect(result.error).toBeDefined();
    });

    test("requires teacher for lesson", () => {
      const { teacherId, ...data } = createLessonData;

      const result = schedulesValidation.createItemSchema.validate(data);

      expect(result.error).toBeDefined();
    });

    test("requires room for lesson", () => {
      const { roomId, ...data } = createLessonData;

      const result = schedulesValidation.createItemSchema.validate(data);

      expect(result.error).toBeDefined();
    });

    test("rejects subject for non-lesson item", () => {
      const type = Object.values(ScheduleItemType).find(
        (itemType) => itemType !== "LESSON"
      );

      if (!type) return;

      const result = schedulesValidation.createItemSchema.validate({
        type,
        dayOfWeek: 1,
        startTime: "08:30",
        endTime: "09:00",
        subjectId: SUBJECT_ID
      });

      expect(result.error).toBeDefined();
    });

    test("rejects invalid day of week", () => {
      const result = schedulesValidation.createItemSchema.validate({
        ...createLessonData,
        dayOfWeek: 7
      });

      expect(result.error).toBeDefined();
    });

    test("rejects invalid time format", () => {
      const result = schedulesValidation.createItemSchema.validate({
        ...createLessonData,
        startTime: "9:00"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects end time earlier than start time", () => {
      const result = schedulesValidation.createItemSchema.validate({
        ...createLessonData,
        startTime: "10:00",
        endTime: "09:00"
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("updateItemSchema", () => {
    test("accepts valid partial update", () => {
      const result = schedulesValidation.updateItemSchema.validate({
        startTime: "10:00"
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects empty update", () => {
      const result = schedulesValidation.updateItemSchema.validate({});

      expect(result.error).toBeDefined();
    });

    test("rejects invalid time", () => {
      const result = schedulesValidation.updateItemSchema.validate({
        startTime: "25:00"
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("cancelItemSchema", () => {
    test("accepts valid reason", () => {
      const result = schedulesValidation.cancelItemSchema.validate({
        reason: "Teacher is unavailable"
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects empty reason", () => {
      const result = schedulesValidation.cancelItemSchema.validate({
        reason: " "
      });

      expect(result.error).toBeDefined();
    });

    test("rejects missing reason", () => {
      const result = schedulesValidation.cancelItemSchema.validate({});

      expect(result.error).toBeDefined();
    });
  });

  describe("generateScheduleSchema", () => {
    test("accepts valid generation data", () => {
      const result = schedulesValidation.generateScheduleSchema.validate(
        createScheduleData
      );

      expect(result.error).toBeUndefined();
    });

    test("rejects invalid date period", () => {
      const result = schedulesValidation.generateScheduleSchema.validate({
        ...createScheduleData,
        validFrom: "2026-06-30",
        validTo: "2026-01-01"
      });

      expect(result.error).toBeDefined();
    });
  });
});

describe("Schedules service", () => {
  describe("getAll", () => {
    test("returns schedules without filters", async () => {
      prisma.schedule.findMany.mockResolvedValue([schedule]);

      const result = await schedulesService.getAll();

      expect(result).toEqual([schedule]);

      expect(prisma.schedule.findMany).toHaveBeenCalledWith({
        where: {},
        include: {
          group: {
            select: {
              id: true,
              name: true
            }
          },
          _count: {
            select: {
              items: true
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        }
      });
    });

    test("filters schedules by group id and status", async () => {
      await schedulesService.getAll({
        groupId: GROUP_ID,
        status: "DRAFT"
      });

      expect(prisma.schedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            groupId: GROUP_ID,
            status: "DRAFT"
          }
        })
      );
    });

    test("filters schedules by group id only", async () => {
      await schedulesService.getAll({
        groupId: GROUP_ID
      });

      expect(prisma.schedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            groupId: GROUP_ID
          }
        })
      );
    });
  });

  describe("getById", () => {
    test("returns schedule by id", async () => {
      prisma.schedule.findUnique.mockResolvedValue(schedule);

      const result = await schedulesService.getById(SCHEDULE_ID);

      expect(result).toEqual(schedule);

      expect(prisma.schedule.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: SCHEDULE_ID
          },
          include: expect.any(Object)
        })
      );
    });

    test("throws when schedule does not exist", async () => {
      prisma.schedule.findUnique.mockResolvedValue(null);

      await expectErrorCode(
        schedulesService.getById(SCHEDULE_ID),
        "SCHEDULE_NOT_FOUND"
      );
    });
  });

  describe("create", () => {
    test("creates schedule and writes audit log", async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: GROUP_ID,
        status: "ACTIVE"
      });

      prisma.schedule.create.mockResolvedValue(schedule);

      const result = await schedulesService.create(
        createScheduleData,
        user
      );

      expect(result).toEqual(schedule);

      expect(prisma.schedule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            groupId: GROUP_ID,
            name: "Test schedule",
            status: "DRAFT",
            validFrom: new Date("2026-01-01T00:00:00.000Z"),
            validTo: new Date("2026-06-30T00:00:00.000Z")
          }
        })
      );

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: USER_ID,
          action: "CREATE",
          entityType: "Schedule",
          entityId: SCHEDULE_ID,
          after: schedule
        }),
        prisma
      );
    });

    test("creates schedule without end date", async () => {
      await schedulesService.create(
        {
          ...createScheduleData,
          validTo: null
        },
        user
      );

      expect(prisma.schedule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            validTo: null
          })
        })
      );
    });

    test("rejects inactive or missing group", async () => {
      prisma.group.findFirst.mockResolvedValue(null);

      await expectErrorCode(
        schedulesService.create(createScheduleData, user),
        "GROUP_NOT_FOUND"
      );

      expect(prisma.schedule.create).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    test("updates draft schedule", async () => {
      prisma.schedule.findUnique.mockResolvedValue(schedule);

      const updated = {
        ...schedule,
        name: "Updated schedule"
      };

      prisma.schedule.update.mockResolvedValue(updated);

      const result = await schedulesService.update(
        SCHEDULE_ID,
        { name: "Updated schedule" },
        user
      );

      expect(result).toEqual(updated);

      expect(prisma.schedule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: SCHEDULE_ID
          },
          data: expect.objectContaining({
            name: "Updated schedule"
          })
        })
      );

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "UPDATE",
          entityType: "Schedule",
          entityId: SCHEDULE_ID,
          before: schedule,
          after: updated
        }),
        prisma
      );
    });

    test("rejects update when schedule does not exist", async () => {
      prisma.schedule.findUnique.mockResolvedValue(null);

      await expectErrorCode(
        schedulesService.update(
          SCHEDULE_ID,
          { name: "Updated" },
          user
        ),
        "SCHEDULE_NOT_FOUND"
      );
    });

    test("rejects update of published schedule", async () => {
      prisma.schedule.findUnique.mockResolvedValue({
        ...schedule,
        status: "PUBLISHED"
      });

      await expectErrorCode(
        schedulesService.update(
          SCHEDULE_ID,
          { name: "Updated" },
          user
        ),
        "SCHEDULE_PUBLISHED"
      );
    });

    test("rejects invalid date period", async () => {
      prisma.schedule.findUnique.mockResolvedValue(schedule);

      await expectErrorCode(
        schedulesService.update(
          SCHEDULE_ID,
          {
            validFrom: "2026-07-01",
            validTo: "2026-01-01"
          },
          user
        ),
        "INVALID_PERIOD"
      );
    });
  });

  describe("remove", () => {
    test("deletes draft schedule and its items", async () => {
      prisma.schedule.findUnique.mockResolvedValue({
        ...schedule,
        items: [lesson]
      });

      await schedulesService.remove(SCHEDULE_ID, user);

      expect(prisma.scheduleItem.deleteMany).toHaveBeenCalledWith({
        where: {
          scheduleId: SCHEDULE_ID
        }
      });

      expect(prisma.schedule.delete).toHaveBeenCalledWith({
        where: {
          id: SCHEDULE_ID
        }
      });

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "DELETE",
          entityType: "ScheduleItem",
          entityId: ITEM_ID,
          before: lesson
        }),
        prisma
      );

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "DELETE",
          entityType: "Schedule",
          entityId: SCHEDULE_ID
        }),
        prisma
      );
    });

    test("rejects deletion of missing schedule", async () => {
      prisma.schedule.findUnique.mockResolvedValue(null);

      await expectErrorCode(
        schedulesService.remove(SCHEDULE_ID, user),
        "SCHEDULE_NOT_FOUND"
      );
    });

    test("rejects deletion of published schedule", async () => {
      prisma.schedule.findUnique.mockResolvedValue({
        ...schedule,
        status: "PUBLISHED",
        items: []
      });

      await expectErrorCode(
        schedulesService.remove(SCHEDULE_ID, user),
        "SCHEDULE_PUBLISHED"
      );

      expect(prisma.schedule.delete).not.toHaveBeenCalled();
    });
  });

  describe("createItem", () => {
    beforeEach(() => {
      prisma.schedule.findUnique.mockResolvedValue(schedule);
      prisma.scheduleItem.findMany.mockResolvedValue([]);
      prisma.scheduleItem.create.mockResolvedValue(lesson);
    });

    test("creates lesson and writes audit log", async () => {
      const result = await schedulesService.createItem(
        SCHEDULE_ID,
        createLessonData,
        user
      );

      expect(result).toEqual(lesson);

      expect(prisma.scheduleItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            scheduleId: SCHEDULE_ID,
            ...createLessonData
          }
        })
      );

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: USER_ID,
          action: "CREATE",
          entityType: "ScheduleItem",
          entityId: ITEM_ID,
          after: lesson
        }),
        prisma
      );
    });

    test("rejects item outside working hours", async () => {
      await expectErrorCode(
        schedulesService.createItem(
          SCHEDULE_ID,
          {
            ...createLessonData,
            startTime: "07:00",
            endTime: "07:40"
          },
          user
        ),
        "OUTSIDE_WORKING_HOURS"
      );

      expect(prisma.scheduleItem.create).not.toHaveBeenCalled();
    });

    test("rejects lesson during restricted time", async () => {
      await expectErrorCode(
        schedulesService.createItem(
          SCHEDULE_ID,
          {
            ...createLessonData,
            startTime: "12:00",
            endTime: "12:30"
          },
          user
        ),
        "LESSON_DURING_RESTRICTED_TIME"
      );

      expect(prisma.scheduleItem.create).not.toHaveBeenCalled();
    });

    test("rejects missing schedule", async () => {
      prisma.schedule.findUnique.mockResolvedValue(null);

      await expectErrorCode(
        schedulesService.createItem(
          SCHEDULE_ID,
          createLessonData,
          user
        ),
        "SCHEDULE_NOT_FOUND"
      );
    });

    test("rejects adding item to published schedule", async () => {
      prisma.schedule.findUnique.mockResolvedValue({
        ...schedule,
        status: "PUBLISHED"
      });

      await expectErrorCode(
        schedulesService.createItem(
          SCHEDULE_ID,
          createLessonData,
          user
        ),
        "SCHEDULE_PUBLISHED"
      );
    });

    test("rejects missing subject", async () => {
      prisma.subject.findFirst.mockResolvedValue(null);

      await expectErrorCode(
        schedulesService.createItem(
          SCHEDULE_ID,
          createLessonData,
          user
        ),
        "SUBJECT_NOT_FOUND"
      );
    });

    test("rejects missing teacher", async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      await expectErrorCode(
        schedulesService.createItem(
          SCHEDULE_ID,
          createLessonData,
          user
        ),
        "EMPLOYEE_NOT_FOUND"
      );
    });

    test("rejects missing room", async () => {
      prisma.room.findFirst.mockResolvedValue(null);

      await expectErrorCode(
        schedulesService.createItem(
          SCHEDULE_ID,
          createLessonData,
          user
        ),
        "ROOM_NOT_FOUND"
      );
    });

    test("rejects room reserved for another group", async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: "507f1f77bcf86cd799439099"
      });

      await expectErrorCode(
        schedulesService.createItem(
          SCHEDULE_ID,
          createLessonData,
          user
        ),
        "ROOM_RESERVED_FOR_OTHER_GROUP"
      );
    });

    test("rejects overlapping item in the same schedule", async () => {
      prisma.scheduleItem.findMany.mockResolvedValue([
        {
          ...lesson,
          id: "507f1f77bcf86cd799439099",
          startTime: "09:20",
          endTime: "10:00"
        }
      ]);

      await expectErrorCode(
        schedulesService.createItem(
          SCHEDULE_ID,
          createLessonData,
          user
        ),
        "SCHEDULE_CONFLICT"
      );
    });

    test("rejects item when teacher is busy in another published schedule", async () => {
      prisma.scheduleItem.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            ...lesson,
            scheduleId: "507f1f77bcf86cd799439099",
            schedule: {
              validFrom: new Date("2026-01-01"),
              validTo: new Date("2026-12-31")
            }
          }
        ]);

      await expectErrorCode(
        schedulesService.createItem(
          SCHEDULE_ID,
          createLessonData,
          user
        ),
        "SCHEDULE_CONFLICT"
      );
    });
  });

  describe("updateItem", () => {
    beforeEach(() => {
      prisma.schedule.findUnique.mockResolvedValue(schedule);
      prisma.scheduleItem.findFirst.mockResolvedValue(lesson);
      prisma.scheduleItem.findMany.mockResolvedValue([]);
      prisma.scheduleItem.update.mockResolvedValue(lesson);
    });

    test("updates item and writes audit log", async () => {
      const updated = {
        ...lesson,
        startTime: "10:00",
        endTime: "10:40"
      };

      prisma.scheduleItem.update.mockResolvedValue(updated);

      const result = await schedulesService.updateItem(
        SCHEDULE_ID,
        ITEM_ID,
        {
          startTime: "10:00",
          endTime: "10:40"
        },
        user
      );

      expect(result).toEqual(updated);

      expect(prisma.scheduleItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: ITEM_ID
          },
          data: expect.objectContaining({
            startTime: "10:00",
            endTime: "10:40"
          })
        })
      );

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "UPDATE",
          entityType: "ScheduleItem",
          entityId: ITEM_ID,
          before: lesson,
          after: updated
        }),
        prisma
      );
    });

    test("rejects missing item", async () => {
      prisma.scheduleItem.findFirst.mockResolvedValue(null);

      await expectErrorCode(
        schedulesService.updateItem(
          SCHEDULE_ID,
          ITEM_ID,
          { startTime: "10:00" },
          user
        ),
        "SCHEDULE_ITEM_NOT_FOUND"
      );
    });

    test("rejects adding subject to non-lesson item", async () => {
      prisma.scheduleItem.findFirst.mockResolvedValue({
        ...lesson,
        type: "BREAKFAST",
        subjectId: null,
        teacherId: null
      });

      await expectErrorCode(
        schedulesService.updateItem(
          SCHEDULE_ID,
          ITEM_ID,
          { subjectId: SUBJECT_ID },
          user
        ),
        "INVALID_ITEM_FIELDS"
      );
    });

    test("rejects invalid time range", async () => {
      await expectErrorCode(
        schedulesService.updateItem(
          SCHEDULE_ID,
          ITEM_ID,
          {
            startTime: "10:00",
            endTime: "09:00"
          },
          user
        ),
        "INVALID_TIME_RANGE"
      );
    });

    test("rejects editing published schedule", async () => {
      prisma.schedule.findUnique.mockResolvedValue({
        ...schedule,
        status: "PUBLISHED"
      });

      await expectErrorCode(
        schedulesService.updateItem(
          SCHEDULE_ID,
          ITEM_ID,
          { startTime: "10:00" },
          user
        ),
        "SCHEDULE_PUBLISHED"
      );
    });
  });

  describe("removeItem", () => {
    test("deletes item and writes audit log", async () => {
      prisma.schedule.findUnique.mockResolvedValue(schedule);
      prisma.scheduleItem.findFirst.mockResolvedValue(lesson);

      await schedulesService.removeItem(
        SCHEDULE_ID,
        ITEM_ID,
        user
      );

      expect(prisma.scheduleItem.delete).toHaveBeenCalledWith({
        where: {
          id: ITEM_ID
        }
      });

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "DELETE",
          entityType: "ScheduleItem",
          entityId: ITEM_ID,
          before: lesson
        }),
        prisma
      );
    });

    test("rejects missing item", async () => {
      prisma.schedule.findUnique.mockResolvedValue(schedule);
      prisma.scheduleItem.findFirst.mockResolvedValue(null);

      await expectErrorCode(
        schedulesService.removeItem(
          SCHEDULE_ID,
          ITEM_ID,
          user
        ),
        "SCHEDULE_ITEM_NOT_FOUND"
      );
    });
  });

  describe("cancelItem", () => {
    const publishedSchedule = {
      ...schedule,
      status: "PUBLISHED"
    };

    test("cancels item and writes audit log", async () => {
      prisma.schedule.findUnique.mockResolvedValue(publishedSchedule);

      const cancelled = {
        ...lesson,
        status: "CANCELLED",
        cancelReason: "Teacher is unavailable"
      };

      prisma.scheduleItem.findFirst.mockResolvedValue(lesson);
      prisma.scheduleItem.update.mockResolvedValue(cancelled);

      const result = await schedulesService.cancelItem(
        SCHEDULE_ID,
        ITEM_ID,
        {
          reason: "Teacher is unavailable"
        },
        user
      );

      expect(result).toEqual(cancelled);

      expect(prisma.scheduleItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: ITEM_ID
          },
          data: expect.objectContaining({
            status: "CANCELLED",
            cancelReason: "Teacher is unavailable",
            cancelledAt: expect.any(Date)
          })
        })
      );

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "CANCEL",
          entityType: "ScheduleItem",
          entityId: ITEM_ID,
          before: lesson,
          after: cancelled
        }),
        prisma
      );
    });

    test("rejects cancellation of draft schedule", async () => {
      prisma.schedule.findUnique.mockResolvedValue(schedule);

      await expectErrorCode(
        schedulesService.cancelItem(
          SCHEDULE_ID,
          ITEM_ID,
          { reason: "Reason" },
          user
        ),
        "SCHEDULE_NOT_PUBLISHED"
      );
    });

    test("rejects missing item", async () => {
      prisma.schedule.findUnique.mockResolvedValue(publishedSchedule);
      prisma.scheduleItem.findFirst.mockResolvedValue(null);

      await expectErrorCode(
        schedulesService.cancelItem(
          SCHEDULE_ID,
          ITEM_ID,
          { reason: "Reason" },
          user
        ),
        "SCHEDULE_ITEM_NOT_FOUND"
      );
    });

    test("rejects already cancelled item", async () => {
      prisma.schedule.findUnique.mockResolvedValue(publishedSchedule);

      prisma.scheduleItem.findFirst.mockResolvedValue({
        ...lesson,
        status: "CANCELLED"
      });

      await expectErrorCode(
        schedulesService.cancelItem(
          SCHEDULE_ID,
          ITEM_ID,
          { reason: "Reason" },
          user
        ),
        "SCHEDULE_ITEM_ALREADY_CANCELLED"
      );
    });
  });

  describe("publish", () => {
    test("publishes schedule and writes audit log", async () => {
      prisma.schedule.findUnique
        .mockResolvedValueOnce({
          ...schedule,
          items: [lesson]
        })
        .mockResolvedValueOnce({
          ...schedule,
          items: [lesson]
        });

      prisma.schedule.findMany.mockResolvedValue([]);

      const published = {
        ...schedule,
        status: "PUBLISHED",
        items: [lesson]
      };

      prisma.schedule.update.mockResolvedValue(published);

      const result = await schedulesService.publish(
        SCHEDULE_ID,
        user
      );

      expect(result).toEqual(published);

      expect(prisma.schedule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: SCHEDULE_ID
          },
          data: expect.objectContaining({
            status: "PUBLISHED",
            publishedAt: expect.any(Date)
          })
        })
      );

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "UPDATE",
          entityType: "Schedule",
          entityId: SCHEDULE_ID,
          after: published
        }),
        prisma
      );
    });

    test("rejects missing schedule", async () => {
      prisma.schedule.findUnique.mockResolvedValue(null);

      await expectErrorCode(
        schedulesService.publish(SCHEDULE_ID, user),
        "SCHEDULE_NOT_FOUND"
      );
    });

    test("rejects already published schedule", async () => {
      prisma.schedule.findUnique.mockResolvedValue({
        ...schedule,
        status: "PUBLISHED",
        items: [lesson]
      });

      await expectErrorCode(
        schedulesService.publish(SCHEDULE_ID, user),
        "SCHEDULE_ALREADY_PUBLISHED"
      );
    });

    test("rejects schedule with missing active group", async () => {
      prisma.schedule.findUnique.mockResolvedValue({
        ...schedule,
        items: [lesson]
      });

      prisma.group.findFirst.mockResolvedValue(null);

      await expectErrorCode(
        schedulesService.publish(SCHEDULE_ID, user),
        "GROUP_NOT_FOUND"
      );
    });

    test("rejects empty schedule", async () => {
      prisma.schedule.findUnique.mockResolvedValue({
        ...schedule,
        items: []
      });

      await expectErrorCode(
        schedulesService.publish(SCHEDULE_ID, user),
        "SCHEDULE_EMPTY"
      );
    });

    test("rejects overlapping published period for same group", async () => {
      prisma.schedule.findUnique.mockResolvedValue({
        ...schedule,
        items: [lesson]
      });

      prisma.schedule.findMany.mockResolvedValue([
        {
          id: "507f1f77bcf86cd799439099",
          groupId: GROUP_ID,
          status: "PUBLISHED",
          validFrom: new Date("2026-05-01"),
          validTo: new Date("2026-12-31")
        }
      ]);

      await expectErrorCode(
        schedulesService.publish(SCHEDULE_ID, user),
        "SCHEDULE_PERIOD_OVERLAP"
      );
    });
  });
});

describe("Schedules controller", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();

    jest.spyOn(schedulesService, "getAll").mockResolvedValue([schedule]);
    jest.spyOn(schedulesService, "getById").mockResolvedValue(schedule);
    jest.spyOn(schedulesService, "create").mockResolvedValue(schedule);
    jest.spyOn(schedulesService, "update").mockResolvedValue(schedule);
    jest.spyOn(schedulesService, "remove").mockResolvedValue(undefined);
    jest.spyOn(schedulesService, "publish").mockResolvedValue(schedule);
    jest.spyOn(schedulesService, "createItem").mockResolvedValue(lesson);
    jest.spyOn(schedulesService, "updateItem").mockResolvedValue(lesson);
    jest.spyOn(schedulesService, "removeItem").mockResolvedValue(undefined);
    jest.spyOn(schedulesService, "cancelItem").mockResolvedValue(lesson);

    jest.spyOn(schedulesGenerator, "generate").mockResolvedValue(schedule);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("getAll returns schedules", async () => {
    const req = { user };
    const res = createResponse();

    res.locals.validated.query = {
      groupId: GROUP_ID
    };

    await schedulesController.getAll(req, res);

    expect(schedulesService.getAll).toHaveBeenCalledWith({
      groupId: GROUP_ID
    });

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [schedule]
    });
  });

  test("getById returns schedule", async () => {
    const req = { user };
    const res = createResponse();

    await schedulesController.getById(req, res);

    expect(schedulesService.getById).toHaveBeenCalledWith(SCHEDULE_ID);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: schedule
    });
  });

  test("create returns created schedule", async () => {
    const req = { user };
    const res = createResponse();

    await schedulesController.create(req, res);

    expect(schedulesService.create).toHaveBeenCalledWith(
      createScheduleData,
      user
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: schedule
    });
  });

  test("update returns updated schedule", async () => {
    const req = { user };
    const res = createResponse();

    res.locals.validated.body = {
      name: "Updated schedule"
    };

    await schedulesController.update(req, res);

    expect(schedulesService.update).toHaveBeenCalledWith(
      SCHEDULE_ID,
      { name: "Updated schedule" },
      user
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
  });

  test("remove returns no content", async () => {
    const req = { user };
    const res = createResponse();

    await schedulesController.remove(req, res);

    expect(schedulesService.remove).toHaveBeenCalledWith(
      SCHEDULE_ID,
      user
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.NO_CONTENT);
    expect(res.send).toHaveBeenCalled();
  });

  test("publish returns published schedule", async () => {
    const req = { user };
    const res = createResponse();

    await schedulesController.publish(req, res);

    expect(schedulesService.publish).toHaveBeenCalledWith(
      SCHEDULE_ID,
      user
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
  });

  test("createItem returns created item", async () => {
    const req = { user };
    const res = createResponse();

    res.locals.validated.body = createLessonData;

    await schedulesController.createItem(req, res);

    expect(schedulesService.createItem).toHaveBeenCalledWith(
      SCHEDULE_ID,
      createLessonData,
      user
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
  });

  test("updateItem returns updated item", async () => {
    const req = { user };
    const res = createResponse();

    res.locals.validated.body = {
      startTime: "10:00"
    };

    await schedulesController.updateItem(req, res);

    expect(schedulesService.updateItem).toHaveBeenCalledWith(
      SCHEDULE_ID,
      ITEM_ID,
      { startTime: "10:00" },
      user
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
  });

  test("removeItem returns no content", async () => {
    const req = { user };
    const res = createResponse();

    await schedulesController.removeItem(req, res);

    expect(schedulesService.removeItem).toHaveBeenCalledWith(
      SCHEDULE_ID,
      ITEM_ID,
      user
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.NO_CONTENT);
  });

  test("cancelItem returns cancelled item", async () => {
    const req = { user };
    const res = createResponse();

    res.locals.validated.body = {
      reason: "Teacher is unavailable"
    };

    await schedulesController.cancelItem(req, res);

    expect(schedulesService.cancelItem).toHaveBeenCalledWith(
      SCHEDULE_ID,
      ITEM_ID,
      { reason: "Teacher is unavailable" },
      user
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
  });

  test("generate returns generated schedule", async () => {
    const req = { user };
    const res = createResponse();

    await schedulesController.generate(req, res);

    expect(schedulesGenerator.generate).toHaveBeenCalledWith(
      createScheduleData,
      user
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: schedule
    });
  });
});

describe("Schedules routes", () => {
  function getRoutes() {
    return schedulesRoutes.stack
      .filter((layer) => layer.route)
      .map((layer) => ({
        path: layer.route.path,
        method: Object.keys(layer.route.methods)[0],
        handlers: layer.route.stack.map((item) => item.handle)
      }));
  }

  test("uses authentication middleware", () => {
    const authLayer = schedulesRoutes.stack.find(
      (layer) => layer.handle === requireAuth
    );

    expect(authLayer).toBeDefined();
  });

  test("defines all required routes", () => {
    const routes = getRoutes();

    expect(
      routes.map(({ method, path }) => `${method} ${path}`)
    ).toEqual([
      "get /",
      "post /",
      "post /generate",
      "get /:id",
      "patch /:id",
      "delete /:id",
      "post /:id/publish",
      "post /:id/items",
      "patch /:id/items/:itemId",
      "delete /:id/items/:itemId",
      "post /:id/items/:itemId/cancel"
    ]);
  });

  test("uses ADMIN and MANAGER role authorization", () => {
    const roleLayer = schedulesRoutes.stack.find(
      (layer) => layer.handle.allowedRoles
    );

    expect(roleLayer).toBeDefined();
    expect(roleLayer.handle.allowedRoles).toEqual([
      "ADMIN",
      "MANAGER"
    ]);
  });

  test.each([
    ["get", "/", 0, "query", "listSchedulesSchema"],
    ["post", "/", 0, "body", "createScheduleSchema"],
    ["post", "/generate", 0, "body", "generateScheduleSchema"],
    ["get", "/:id", 0, "params", "scheduleIdSchema"],
    ["patch", "/:id", 0, "params", "scheduleIdSchema"],
    ["delete", "/:id", 0, "params", "scheduleIdSchema"],
    ["post", "/:id/publish", 0, "params", "scheduleIdSchema"],
    ["post", "/:id/items", 0, "params", "scheduleIdSchema"],
    ["patch", "/:id/items/:itemId", 0, "params", "itemParamsSchema"],
    ["delete", "/:id/items/:itemId", 0, "params", "itemParamsSchema"],
    ["post", "/:id/items/:itemId/cancel", 0, "params", "itemParamsSchema"]
  ])(
    "%s %s has the expected first validation middleware",
    (method, path, handlerIndex, property, schemaName) => {
      const route = getRoutes().find(
        (item) => item.method === method && item.path === path
      );

      expect(route).toBeDefined();
      expect(route.handlers[handlerIndex].validationProperty).toBe(property);
      expect(route.handlers[handlerIndex].schema).toBe(
        schedulesValidation[schemaName]
      );
    }
  );

  test("PATCH /:id validates request body", () => {
    const route = getRoutes().find(
      (item) => item.method === "patch" && item.path === "/:id"
    );

    expect(route.handlers[1].validationProperty).toBe("body");
    expect(route.handlers[1].schema).toBe(
      schedulesValidation.updateScheduleSchema
    );
  });

  test("POST /:id/items validates request body", () => {
    const route = getRoutes().find(
      (item) => item.method === "post" && item.path === "/:id/items"
    );

    expect(route.handlers[1].validationProperty).toBe("body");
    expect(route.handlers[1].schema).toBe(
      schedulesValidation.createItemSchema
    );
  });

  test("PATCH /:id/items/:itemId validates request body", () => {
    const route = getRoutes().find(
      (item) => item.method === "patch" &&
        item.path === "/:id/items/:itemId"
    );

    expect(route.handlers[1].validationProperty).toBe("body");
    expect(route.handlers[1].schema).toBe(
      schedulesValidation.updateItemSchema
    );
  });

  test("POST /:id/items/:itemId/cancel validates request body", () => {
    const route = getRoutes().find(
      (item) => item.method === "post" &&
        item.path === "/:id/items/:itemId/cancel"
    );

    expect(route.handlers[1].validationProperty).toBe("body");
    expect(route.handlers[1].schema).toBe(
      schedulesValidation.cancelItemSchema
    );
  });
});

describe("Schedules generator", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();

    jest.spyOn(schedulesService, "create").mockResolvedValue(schedule);
    jest.spyOn(schedulesService, "createItem").mockResolvedValue(lesson);
    jest.spyOn(schedulesService, "getById").mockResolvedValue(schedule);
    jest.spyOn(schedulesService, "remove").mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function createChild() {
    return {
      id: "507f1f77bcf86cd799439099",
      birthDate: new Date(
        new Date().getFullYear() - 3,
        new Date().getMonth(),
        new Date().getDate()
      )
    };
  }

  function setupGeneratorData() {
    prisma.group.findFirst.mockResolvedValue({
      id: GROUP_ID,
      name: "Group A",
      status: "ACTIVE",
      capacity: 20,
      ageFromMonths: 24,
      ageToMonths: 72,
      mainRoomId: ROOM_ID,
      enrollments: [
        {
          child: createChild()
        }
      ]
    });

    prisma.room.findMany.mockResolvedValue([
      {
        id: ROOM_ID,
        capacity: 20,
        status: "ACTIVE"
      }
    ]);

    prisma.employee.findMany.mockResolvedValue([
      {
        id: TEACHER_ID,
        role: "TEACHER",
        status: "ACTIVE",
        subjects: [
          {
            subject: {
              id: SUBJECT_ID,
              status: "ACTIVE"
            }
          }
        ]
      }
    ]);
  }

  test("generates schedule with routine and lessons", async () => {
    setupGeneratorData();

    const result = await schedulesGenerator.generate(
      createScheduleData,
      user
    );

    expect(result).toEqual(schedule);

    expect(schedulesService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: GROUP_ID,
        name: "Test schedule",
        validFrom: "2026-01-01",
        validTo: "2026-06-30"
      }),
      user
    );

    expect(schedulesService.createItem).toHaveBeenCalled();
    expect(schedulesService.getById).toHaveBeenCalledWith(SCHEDULE_ID);

    expect(schedulesService.createItem).toHaveBeenCalledTimes(
      config.WORKING_DAYS.length * 8
    );
  });

  test("uses default schedule name when name is not provided", async () => {
    setupGeneratorData();

    await schedulesGenerator.generate(
      {
        ...createScheduleData,
        name: undefined
      },
      user
    );

    expect(schedulesService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringContaining("Автоматичний розклад")
      }),
      user
    );
  });

  test("rejects when group does not exist", async () => {
    prisma.group.findFirst.mockResolvedValue(null);

    await expectErrorCode(
      schedulesGenerator.generate(createScheduleData, user),
      "GROUP_NOT_FOUND"
    );

    expect(schedulesService.create).not.toHaveBeenCalled();
  });

  test("rejects group without enrolled children", async () => {
    prisma.group.findFirst.mockResolvedValue({
      id: GROUP_ID,
      enrollments: [],
      capacity: 20
    });

    await expectErrorCode(
      schedulesGenerator.generate(createScheduleData, user),
      "GROUP_EMPTY"
    );
  });

  test("rejects group enrollment exceeding capacity", async () => {
    prisma.group.findFirst.mockResolvedValue({
      id: GROUP_ID,
      enrollments: Array.from(
        { length: 3 },
        () => ({ child: createChild() })
      ),
      capacity: 2
    });

    await expectErrorCode(
      schedulesGenerator.generate(createScheduleData, user),
      "GROUP_CAPACITY_EXCEEDED"
    );
  });

  test("rejects children outside group age range", async () => {
    setupGeneratorData();

    prisma.group.findFirst.mockResolvedValue({
      id: GROUP_ID,
      name: "Group A",
      capacity: 20,
      ageFromMonths: 1,
      ageToMonths: 12,
      mainRoomId: ROOM_ID,
      enrollments: [
        {
          child: {
            id: ITEM_ID,
            birthDate: new Date(
              new Date().getFullYear() - 5,
              new Date().getMonth(),
              new Date().getDate()
            )
          }
        }
      ]
    });

    await expectErrorCode(
      schedulesGenerator.generate(createScheduleData, user),
      "GROUP_AGE_MISMATCH"
    );
  });

  test("rejects when no suitable room is available", async () => {
    setupGeneratorData();
    prisma.room.findMany.mockResolvedValue([]);

    await expectErrorCode(
      schedulesGenerator.generate(createScheduleData, user),
      "NO_AVAILABLE_ROOMS"
    );
  });

  test("rejects when there are no available teachers", async () => {
    setupGeneratorData();
    prisma.employee.findMany.mockResolvedValue([]);

    await expectErrorCode(
      schedulesGenerator.generate(createScheduleData, user),
      "NO_AVAILABLE_TEACHERS"
    );
  });

  test("removes generated schedule when item creation fails", async () => {
    setupGeneratorData();

    schedulesService.createItem.mockRejectedValue(
      Object.assign(new Error("Unexpected error"), {
        code: "UNEXPECTED_ERROR"
      })
    );

    await expect(
      schedulesGenerator.generate(createScheduleData, user)
    ).rejects.toMatchObject({
      code: "UNEXPECTED_ERROR"
    });

    expect(schedulesService.remove).toHaveBeenCalledWith(
      SCHEDULE_ID,
      user
    );
  });
});
