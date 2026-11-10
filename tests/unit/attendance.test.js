jest.mock("../../src/config/prisma", () => ({
  employee: { findFirst: jest.fn() },
  staffAssignment: { findMany: jest.fn() },
  parent: { findFirst: jest.fn() },
  child: { findFirst: jest.fn() },
  groupEnrollment: { findFirst: jest.fn() },
  attendance: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  },
  $transaction: jest.fn()
}));

jest.mock("../../src/modules/audit/audit.service", () => ({
  createLog: jest.fn()
}));

jest.mock("../../src/middleware/validate.middleware", () =>
  jest.fn(() => (req, res, next) => next())
);

jest.mock("../../src/middleware/auth.middleware", () => jest.fn((req, res, next) => next()));

jest.mock("../../src/middleware/rbac.middleware", () => jest.fn(() => (req, res, next) => next()));

const prisma = require("../../src/config/prisma");
const auditService = require("../../src/modules/audit/audit.service");
const service = require("../../src/modules/attendance/attendance.service");
const controller = require("../../src/modules/attendance/attendance.controller");

const {
  attendanceIdSchema,
  listAttendanceSchema,
  createAttendanceSchema,
  updateAttendanceSchema
} = require("../../src/modules/attendance/attendance.validation");

const HTTP_STATUS = require("../../src/utils/http-status");

const childId = "507f1f77bcf86cd799439011";
const attendanceId = "507f1f77bcf86cd799439012";
const groupId = "507f1f77bcf86cd799439013";
const employeeId = "507f1f77bcf86cd799439014";
const parentId = "507f1f77bcf86cd799439015";
const userId = "507f1f77bcf86cd799439016";

const manager = {
  id: userId,
  role: "ADMIN"
};

const teacher = {
  id: userId,
  role: "TEACHER"
};

const parentUser = {
  id: userId,
  role: "PARENT"
};

const validDate = "2026-10-10";

function createAttendanceRecord(overrides = {}) {
  return {
    id: attendanceId,
    childId,
    date: new Date(`${validDate}T00:00:00.000Z`),
    status: "PRESENT",
    checkIn: new Date(`${validDate}T08:30:00.000Z`),
    checkOut: new Date(`${validDate}T17:00:00.000Z`),
    note: null,
    absenceReason: null,
    recordedById: employeeId,
    child: {
      id: childId,
      firstName: "Іван",
      lastName: "Іваненко",
      childCode: "CH001"
    },
    recordedBy: {
      id: employeeId,
      firstName: "Петро",
      lastName: "Петренко"
    },
    ...overrides
  };
}

function createTransaction() {
  return {
    attendance: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    }
  };
}

let tx;

describe("Attendance validation", () => {
  describe("attendanceIdSchema", () => {
    test("accepts a valid MongoDB ObjectId", () => {
      const result = attendanceIdSchema.validate({
        id: attendanceId
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects an invalid ID", () => {
      const result = attendanceIdSchema.validate({
        id: "invalid-id"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects a missing ID", () => {
      const result = attendanceIdSchema.validate({});

      expect(result.error).toBeDefined();
    });
  });

  describe("listAttendanceSchema", () => {
    test("accepts an empty query", () => {
      const result = listAttendanceSchema.validate({});

      expect(result.error).toBeUndefined();
    });

    test("accepts valid filters", () => {
      const result = listAttendanceSchema.validate({
        childId,
        groupId,
        status: "PRESENT",
        date: validDate,
        from: "2026-10-01",
        to: "2026-10-31"
      });

      expect(result.error).toBeUndefined();
    });

    test.each(["PRESENT", "ABSENT", "LATE", "EXCUSED"])(
      "accepts attendance status %s",
      (status) => {
        const result = listAttendanceSchema.validate({ status });

        expect(result.error).toBeUndefined();
      }
    );

    test("rejects an invalid attendance status", () => {
      const result = listAttendanceSchema.validate({
        status: "UNKNOWN"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects an invalid child ID", () => {
      const result = listAttendanceSchema.validate({
        childId: "invalid"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects an invalid group ID", () => {
      const result = listAttendanceSchema.validate({
        groupId: "invalid"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects an invalid date format", () => {
      const result = listAttendanceSchema.validate({
        date: "10-10-2026"
      });

      expect(result.error).toBeDefined();
      expect(result.error.message).toContain("Date must be in YYYY-MM-DD format");
    });

    test("rejects an invalid calendar date", () => {
      const result = listAttendanceSchema.validate({
        date: "2026-02-30"
      });

      expect(result.error).toBeDefined();
      expect(result.error.message).toContain("Date must be a valid calendar date");
    });

    test("rejects a reversed date range", () => {
      const result = listAttendanceSchema.validate({
        from: "2026-10-31",
        to: "2026-10-01"
      });

      expect(result.error.message).toContain("from must not be later than to");
    });
  });

  describe("createAttendanceSchema", () => {
    const validData = {
      childId,
      date: validDate,
      status: "PRESENT",
      checkIn: "08:30",
      checkOut: "17:00",
      note: "Присутній",
      absenceReason: ""
    };

    test("accepts valid attendance data", () => {
      const result = createAttendanceSchema.validate(validData);

      expect(result.error).toBeUndefined();
    });

    test("requires childId", () => {
      const result = createAttendanceSchema.validate({
        date: validDate
      });

      expect(result.error).toBeDefined();
    });

    test("requires date", () => {
      const result = createAttendanceSchema.validate({
        childId
      });

      expect(result.error).toBeDefined();
    });

    test("uses PRESENT as the default status", () => {
      const result = createAttendanceSchema.validate({
        childId,
        date: validDate
      });

      expect(result.error).toBeUndefined();
      expect(result.value.status).toBe("PRESENT");
    });

    test("accepts null checkIn and checkOut", () => {
      const result = createAttendanceSchema.validate({
        childId,
        date: validDate,
        checkIn: null,
        checkOut: null
      });

      expect(result.error).toBeUndefined();
    });

    test("accepts empty note and absenceReason", () => {
      const result = createAttendanceSchema.validate({
        childId,
        date: validDate,
        note: "",
        absenceReason: ""
      });

      expect(result.error).toBeUndefined();
    });

    test("trims note and absenceReason", () => {
      const result = createAttendanceSchema.validate({
        childId,
        date: validDate,
        note: "  Присутній  ",
        absenceReason: "  Причина  "
      });

      expect(result.value.note).toBe("Присутній");
      expect(result.value.absenceReason).toBe("Причина");
    });

    test("rejects invalid time format", () => {
      const result = createAttendanceSchema.validate({
        childId,
        date: validDate,
        checkIn: "8:30"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects an invalid time", () => {
      const result = createAttendanceSchema.validate({
        childId,
        date: validDate,
        checkIn: "25:00"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects checkOut earlier than checkIn", () => {
      const result = createAttendanceSchema.validate({
        childId,
        date: validDate,
        checkIn: "17:00",
        checkOut: "08:00"
      });

      expect(result.error.message).toContain("checkOut must be later than checkIn");
    });

    test("rejects equal checkIn and checkOut", () => {
      const result = createAttendanceSchema.validate({
        childId,
        date: validDate,
        checkIn: "08:30",
        checkOut: "08:30"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects note longer than 1000 characters", () => {
      const result = createAttendanceSchema.validate({
        childId,
        date: validDate,
        note: "a".repeat(1001)
      });

      expect(result.error).toBeDefined();
    });

    test("rejects absenceReason longer than 500 characters", () => {
      const result = createAttendanceSchema.validate({
        childId,
        date: validDate,
        absenceReason: "a".repeat(501)
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("updateAttendanceSchema", () => {
    test("accepts valid update data", () => {
      const result = updateAttendanceSchema.validate({
        status: "ABSENT",
        absenceReason: "Хвороба"
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects an empty update object", () => {
      const result = updateAttendanceSchema.validate({});

      expect(result.error).toBeDefined();
    });

    test("accepts updating only the date", () => {
      const result = updateAttendanceSchema.validate({
        date: "2026-10-11"
      });

      expect(result.error).toBeUndefined();
    });

    test("accepts updating only the status", () => {
      const result = updateAttendanceSchema.validate({
        status: "LATE"
      });

      expect(result.error).toBeUndefined();
    });

    test("accepts null checkIn and checkOut", () => {
      const result = updateAttendanceSchema.validate({
        checkIn: null,
        checkOut: null
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects an invalid status", () => {
      const result = updateAttendanceSchema.validate({
        status: "UNKNOWN"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects an invalid date", () => {
      const result = updateAttendanceSchema.validate({
        date: "2026-02-30"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects an invalid time range", () => {
      const result = updateAttendanceSchema.validate({
        checkIn: "17:00",
        checkOut: "08:00"
      });

      expect(result.error).toBeDefined();
      expect(result.error.message).toContain("checkOut must be later than checkIn");
    });

    test("rejects an invalid time format", () => {
      const result = updateAttendanceSchema.validate({
        checkIn: "8:30"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects an oversized note", () => {
      const result = updateAttendanceSchema.validate({
        note: "a".repeat(1001)
      });

      expect(result.error).toBeDefined();
    });

    test("rejects an oversized absence reason", () => {
      const result = updateAttendanceSchema.validate({
        absenceReason: "a".repeat(501)
      });

      expect(result.error).toBeDefined();
    });
  });
});

describe("Attendance service", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    tx = createTransaction();

    prisma.employee.findFirst.mockResolvedValue({
      id: employeeId
    });

    prisma.staffAssignment.findMany.mockResolvedValue([{ groupId }]);

    prisma.parent.findFirst.mockResolvedValue({
      id: parentId,
      children: [{ childId }]
    });

    prisma.child.findFirst.mockResolvedValue({
      id: childId,
      status: "ACTIVE"
    });

    prisma.groupEnrollment.findFirst.mockResolvedValue({
      childId,
      groupId
    });

    prisma.attendance.findMany.mockResolvedValue([]);
    prisma.attendance.findUnique.mockResolvedValue(null);
    prisma.attendance.findFirst.mockResolvedValue(null);

    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    auditService.createLog.mockResolvedValue({});
  });

  describe("getAll", () => {
    test("returns attendance records for a manager", async () => {
      const record = createAttendanceRecord();

      prisma.attendance.findMany.mockResolvedValue([record]);

      const result = await service.getAll({}, manager);

      expect(prisma.attendance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          orderBy: [{ date: "desc" }, { createdAt: "desc" }]
        })
      );

      expect(result).toHaveLength(1);
      expect(result[0].checkIn).toBe("08:30");
      expect(result[0].checkOut).toBe("17:00");
    });

    test("formats null checkIn and checkOut", async () => {
      prisma.attendance.findMany.mockResolvedValue([
        createAttendanceRecord({
          checkIn: null,
          checkOut: null
        })
      ]);

      const result = await service.getAll({}, manager);

      expect(result[0].checkIn).toBeNull();
      expect(result[0].checkOut).toBeNull();
    });

    test("filters records by childId", async () => {
      await service.getAll({ childId }, manager);

      expect(prisma.attendance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { childId }
        })
      );
    });

    test("filters records by status", async () => {
      await service.getAll({ status: "ABSENT" }, manager);

      expect(prisma.attendance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: "ABSENT" }
        })
      );
    });

    test("filters records by exact date", async () => {
      await service.getAll({ date: validDate }, manager);

      expect(prisma.attendance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            date: new Date(`${validDate}T00:00:00.000Z`)
          }
        })
      );
    });

    test("filters records by date range", async () => {
      await service.getAll(
        {
          from: "2026-10-01",
          to: "2026-10-31"
        },
        manager
      );

      expect(prisma.attendance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            date: {
              gte: new Date("2026-10-01T00:00:00.000Z"),
              lte: new Date("2026-10-31T00:00:00.000Z")
            }
          }
        })
      );
    });

    test("filters records by group for a manager", async () => {
      await service.getAll({ groupId }, manager);

      expect(prisma.attendance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            child: {
              enrollments: {
                some: { groupId }
              }
            }
          }
        })
      );
    });

    test("restricts teacher records to assigned groups", async () => {
      await service.getAll({}, teacher);

      expect(prisma.employee.findFirst).toHaveBeenCalledWith({
        where: {
          userId,
          status: "ACTIVE",
          role: "TEACHER"
        }
      });

      expect(prisma.staffAssignment.findMany).toHaveBeenCalled();

      expect(prisma.attendance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            child: {
              enrollments: {
                some: expect.objectContaining({
                  groupId: { in: [groupId] }
                })
              }
            }
          }
        })
      );
    });

    test("restricts parent records to their children", async () => {
      await service.getAll({}, parentUser);

      expect(prisma.parent.findFirst).toHaveBeenCalled();

      expect(prisma.attendance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            childId: { in: [childId] }
          }
        })
      );
    });

    test("rejects a teacher without an employee profile", async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      await expect(service.getAll({}, teacher)).rejects.toThrow("Employee profile not found");

      expect(prisma.attendance.findMany).not.toHaveBeenCalled();
    });

    test("rejects a parent without a parent profile", async () => {
      prisma.parent.findFirst.mockResolvedValue(null);

      await expect(service.getAll({}, parentUser)).rejects.toThrow("Parent profile not found");

      expect(prisma.attendance.findMany).not.toHaveBeenCalled();
    });

    test("rejects a user with an unsupported role", async () => {
      await expect(service.getAll({}, { id: userId, role: "STUDENT" })).rejects.toThrow(
        "You do not have permission to access attendance"
      );
    });

    test("rejects a teacher requesting an unassigned group", async () => {
      await expect(
        service.getAll({ groupId: "507f1f77bcf86cd799439099" }, teacher)
      ).rejects.toThrow("You do not have access to this group");

      expect(prisma.attendance.findMany).not.toHaveBeenCalled();
    });
  });

  describe("getById", () => {
    test("returns an attendance record", async () => {
      const record = createAttendanceRecord();

      prisma.attendance.findUnique.mockResolvedValue(record);

      const result = await service.getById(attendanceId, manager);

      expect(prisma.attendance.findUnique).toHaveBeenCalledWith({
        where: { id: attendanceId },
        include: expect.any(Object)
      });

      expect(result.id).toBe(attendanceId);
      expect(result.checkIn).toBe("08:30");
      expect(result.checkOut).toBe("17:00");
    });

    test("throws when the record does not exist", async () => {
      prisma.attendance.findUnique.mockResolvedValue(null);

      await expect(service.getById(attendanceId, manager)).rejects.toThrow(
        "Attendance record not found"
      );
    });

    test("checks whether the child is active", async () => {
      prisma.attendance.findUnique.mockResolvedValue(createAttendanceRecord());

      await service.getById(attendanceId, manager);

      expect(prisma.child.findFirst).toHaveBeenCalledWith({
        where: {
          id: childId,
          status: "ACTIVE"
        }
      });
    });

    test("rejects access to an inactive or missing child", async () => {
      prisma.attendance.findUnique.mockResolvedValue(createAttendanceRecord());

      prisma.child.findFirst.mockResolvedValue(null);

      await expect(service.getById(attendanceId, manager)).rejects.toThrow("Child not found");
    });

    test("rejects a parent accessing another child", async () => {
      prisma.attendance.findUnique.mockResolvedValue(createAttendanceRecord());

      prisma.parent.findFirst.mockResolvedValue({
        id: parentId,
        children: [{ childId: "507f1f77bcf86cd799439099" }]
      });

      await expect(service.getById(attendanceId, parentUser)).rejects.toThrow(
        "You do not have access to this child"
      );
    });

    test("rejects a teacher without assigned groups", async () => {
      prisma.attendance.findUnique.mockResolvedValue(createAttendanceRecord());

      prisma.staffAssignment.findMany.mockResolvedValue([]);

      await expect(service.getById(attendanceId, teacher)).rejects.toThrow(
        "You are not assigned to any group"
      );
    });

    test("rejects a teacher when the child is not enrolled in an assigned group", async () => {
      prisma.attendance.findUnique.mockResolvedValue(createAttendanceRecord());

      prisma.groupEnrollment.findFirst.mockResolvedValue(null);

      await expect(service.getById(attendanceId, teacher)).rejects.toThrow(
        "Child does not belong to your assigned groups on this date"
      );
    });
  });

  describe("create", () => {
    const data = {
      childId,
      date: validDate,
      status: "PRESENT",
      checkIn: "08:30",
      checkOut: "17:00",
      note: "Присутній",
      absenceReason: null
    };

    test("creates an attendance record", async () => {
      const record = createAttendanceRecord();

      tx.attendance.create.mockResolvedValue(record);

      const result = await service.create(data, manager);

      expect(prisma.child.findFirst).toHaveBeenCalled();
      expect(prisma.attendance.findFirst).toHaveBeenCalledWith({
        where: {
          childId,
          date: new Date(`${validDate}T00:00:00.000Z`)
        }
      });

      expect(tx.attendance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            childId,
            status: "PRESENT",
            checkIn: new Date(`${validDate}T08:30:00.000Z`),
            checkOut: new Date(`${validDate}T17:00:00.000Z`),
            note: "Присутній",
            absenceReason: null,
            recordedById: null
          }),
          include: expect.any(Object)
        })
      );

      expect(result.id).toBe(attendanceId);
      expect(result.checkIn).toBe("08:30");
      expect(result.checkOut).toBe("17:00");
    });

    test("creates an audit log", async () => {
      tx.attendance.create.mockResolvedValue(createAttendanceRecord());

      await service.create(data, manager);

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: userId,
          action: "CREATE",
          entityType: "Attendance",
          entityId: attendanceId
        }),
        tx
      );
    });

    test("uses employee ID as recordedById for a teacher", async () => {
      tx.attendance.create.mockResolvedValue(createAttendanceRecord());

      await service.create(data, teacher);

      expect(tx.attendance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recordedById: employeeId
          })
        })
      );
    });

    test("rejects creation for a missing child", async () => {
      prisma.child.findFirst.mockResolvedValue(null);

      await expect(service.create(data, manager)).rejects.toThrow("Child not found");

      expect(prisma.attendance.findFirst).not.toHaveBeenCalled();
    });

    test("rejects creation when a record already exists", async () => {
      prisma.attendance.findFirst.mockResolvedValue({
        id: attendanceId
      });

      await expect(service.create(data, manager)).rejects.toThrow(
        "Attendance record already exists for this child and date"
      );

      expect(tx.attendance.create).not.toHaveBeenCalled();
    });

    test("rejects an invalid time range", async () => {
      await expect(
        service.create(
          {
            ...data,
            checkIn: "17:00",
            checkOut: "08:00"
          },
          manager
        )
      ).rejects.toThrow("checkOut must be later than checkIn");

      expect(tx.attendance.create).not.toHaveBeenCalled();
    });

    test("converts a Prisma duplicate error into an application error", async () => {
      tx.attendance.create.mockRejectedValue({
        code: "P2002"
      });

      await expect(service.create(data, manager)).rejects.toThrow(
        "Attendance record already exists for this child and date"
      );
    });

    test("rethrows other transaction errors", async () => {
      const error = new Error("Database error");

      tx.attendance.create.mockRejectedValue(error);

      await expect(service.create(data, manager)).rejects.toThrow("Database error");
    });

    test("sets missing note and absenceReason to null", async () => {
      tx.attendance.create.mockResolvedValue(createAttendanceRecord());

      await service.create(
        {
          childId,
          date: validDate,
          status: "PRESENT"
        },
        manager
      );

      expect(tx.attendance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            note: null,
            absenceReason: null
          })
        })
      );
    });
  });

  describe("update", () => {
    const before = createAttendanceRecord();

    test("updates an attendance record", async () => {
      tx.attendance.findUnique.mockResolvedValue(before);

      const updated = createAttendanceRecord({
        status: "LATE",
        note: "Запізнився"
      });

      tx.attendance.update.mockResolvedValue(updated);

      const result = await service.update(
        attendanceId,
        {
          status: "LATE",
          note: "Запізнився"
        },
        manager
      );

      expect(tx.attendance.findUnique).toHaveBeenCalledWith({
        where: { id: attendanceId }
      });

      expect(tx.attendance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: attendanceId },
          data: expect.objectContaining({
            status: "LATE",
            note: "Запізнився"
          }),
          include: expect.any(Object)
        })
      );

      expect(result.status).toBe("LATE");
    });

    test("creates an audit log after updating", async () => {
      tx.attendance.findUnique.mockResolvedValue(before);

      const updated = createAttendanceRecord({
        status: "ABSENT"
      });

      tx.attendance.update.mockResolvedValue(updated);

      await service.update(attendanceId, { status: "ABSENT" }, manager);

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: userId,
          action: "UPDATE",
          entityType: "Attendance",
          entityId: attendanceId,
          before,
          after: updated
        }),
        tx
      );
    });

    test("throws when the record does not exist", async () => {
      tx.attendance.findUnique.mockResolvedValue(null);

      await expect(service.update(attendanceId, { status: "ABSENT" }, manager)).rejects.toThrow(
        "Attendance record not found"
      );

      expect(tx.attendance.update).not.toHaveBeenCalled();
    });

    test("rejects an update when the child does not exist", async () => {
      tx.attendance.findUnique.mockResolvedValue(before);
      prisma.child.findFirst.mockResolvedValue(null);

      await expect(service.update(attendanceId, { status: "ABSENT" }, manager)).rejects.toThrow(
        "Child not found"
      );
    });

    test("rejects a duplicate attendance date", async () => {
      tx.attendance.findUnique.mockResolvedValue(before);

      tx.attendance.findFirst.mockResolvedValue({
        id: "507f1f77bcf86cd799439099"
      });

      await expect(service.update(attendanceId, { date: "2026-10-11" }, manager)).rejects.toThrow(
        "Attendance record already exists for this child and date"
      );

      expect(tx.attendance.update).not.toHaveBeenCalled();
    });

    test("checks for duplicates only when the date changes", async () => {
      tx.attendance.findUnique.mockResolvedValue(before);

      tx.attendance.update.mockResolvedValue(before);

      await service.update(attendanceId, { status: "LATE" }, manager);

      expect(tx.attendance.findFirst).not.toHaveBeenCalled();
    });

    test("rejects an invalid time range", async () => {
      tx.attendance.findUnique.mockResolvedValue(before);

      await expect(
        service.update(
          attendanceId,
          {
            checkIn: "17:00",
            checkOut: "08:00"
          },
          manager
        )
      ).rejects.toThrow("checkOut must be later than checkIn");

      expect(tx.attendance.update).not.toHaveBeenCalled();
    });

    test("preserves existing checkIn when it is not updated", async () => {
      tx.attendance.findUnique.mockResolvedValue(before);

      tx.attendance.update.mockResolvedValue(before);

      await service.update(attendanceId, { status: "LATE" }, manager);

      expect(tx.attendance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            checkIn: before.checkIn
          })
        })
      );
    });

    test("updates checkIn and checkOut using the new date", async () => {
      tx.attendance.findUnique.mockResolvedValue(before);

      tx.attendance.update.mockResolvedValue(createAttendanceRecord());

      await service.update(
        attendanceId,
        {
          date: "2026-10-11",
          checkIn: "09:00",
          checkOut: "18:00"
        },
        manager
      );

      expect(tx.attendance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            date: new Date("2026-10-11T00:00:00.000Z"),
            checkIn: new Date("2026-10-11T09:00:00.000Z"),
            checkOut: new Date("2026-10-11T18:00:00.000Z")
          })
        })
      );
    });

    test("allows clearing checkIn and checkOut", async () => {
      tx.attendance.findUnique.mockResolvedValue(before);

      tx.attendance.update.mockResolvedValue(
        createAttendanceRecord({
          checkIn: null,
          checkOut: null
        })
      );

      await service.update(
        attendanceId,
        {
          checkIn: null,
          checkOut: null
        },
        manager
      );

      expect(tx.attendance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            checkIn: null,
            checkOut: null
          })
        })
      );
    });
  });

  describe("remove", () => {
    test("deletes an attendance record", async () => {
      const before = createAttendanceRecord();

      tx.attendance.findUnique.mockResolvedValue(before);
      tx.attendance.delete.mockResolvedValue(before);

      await service.remove(attendanceId, manager);

      expect(tx.attendance.findUnique).toHaveBeenCalledWith({
        where: { id: attendanceId }
      });

      expect(tx.attendance.delete).toHaveBeenCalledWith({
        where: { id: attendanceId }
      });
    });

    test("creates an audit log after deletion", async () => {
      const before = createAttendanceRecord();

      tx.attendance.findUnique.mockResolvedValue(before);
      tx.attendance.delete.mockResolvedValue(before);

      await service.remove(attendanceId, manager);

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: userId,
          action: "DELETE",
          entityType: "Attendance",
          entityId: attendanceId,
          before
        }),
        tx
      );
    });

    test("throws when the record does not exist", async () => {
      tx.attendance.findUnique.mockResolvedValue(null);

      await expect(service.remove(attendanceId, manager)).rejects.toThrow(
        "Attendance record not found"
      );

      expect(tx.attendance.delete).not.toHaveBeenCalled();
    });
  });
});

describe("Attendance controller", () => {
  let res;

  beforeEach(() => {
    jest.clearAllMocks();

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      locals: {
        validated: {
          query: { status: "PRESENT" },
          params: { id: attendanceId },
          body: { status: "ABSENT" }
        }
      }
    };
  });

  test("getAll returns attendance records", async () => {
    const records = [createAttendanceRecord()];
    const spy = jest.spyOn(service, "getAll").mockResolvedValue(records);

    const req = { user: manager };

    await controller.getAll(req, res);

    expect(spy).toHaveBeenCalledWith({ status: "PRESENT" }, manager);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: records
    });
  });

  test("getById returns an attendance record", async () => {
    const record = createAttendanceRecord();
    const spy = jest.spyOn(service, "getById").mockResolvedValue(record);

    const req = { user: manager };

    await controller.getById(req, res);

    expect(spy).toHaveBeenCalledWith(attendanceId, manager);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: record
    });
  });

  test("create returns a created attendance record", async () => {
    const record = createAttendanceRecord();
    const spy = jest.spyOn(service, "create").mockResolvedValue(record);

    const req = { user: manager };

    await controller.create(req, res);

    expect(spy).toHaveBeenCalledWith({ status: "ABSENT" }, manager);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: record
    });
  });

  test("update returns the updated attendance record", async () => {
    const record = createAttendanceRecord({
      status: "ABSENT"
    });

    const spy = jest.spyOn(service, "update").mockResolvedValue(record);

    const req = { user: manager };

    await controller.update(req, res);

    expect(spy).toHaveBeenCalledWith(attendanceId, { status: "ABSENT" }, manager);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: record
    });
  });

  test("remove deletes an attendance record", async () => {
    const spy = jest.spyOn(service, "remove").mockResolvedValue(undefined);

    const req = { user: manager };

    await controller.remove(req, res);

    expect(spy).toHaveBeenCalledWith(attendanceId, manager);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.NO_CONTENT);
    expect(res.send).toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});

describe("Attendance routes", () => {
  test("registers all attendance endpoints", () => {
    const router = require("../../src/modules/attendance/attendance.routes");

    const routes = router.stack
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

  test("registers authentication middleware", () => {
    const router = require("../../src/modules/attendance/attendance.routes");

    const middlewareLayers = router.stack.filter((layer) => !layer.route);

    expect(middlewareLayers.length).toBeGreaterThan(0);
  });
});
