
const prisma = require("../../config/prisma");
const auditService = require("../audit/audit.service");
const AppError = require("../../utils/app-error");
const HTTP_STATUS = require("../../utils/http-status");

const STAFF_ROLES = ["TEACHER", "EDUCATOR", "ASSISTANT"];
const MANAGEMENT_ROLES = ["ADMIN", "MANAGER"];

function fail(message, status, code) {
  throw new AppError(message, status, code);
}

function toDate(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function toTimeDate(value, date) {
  if (!value) return null;

  const [hours, minutes] = value.split(":").map(Number);
  const result = new Date(date);

  result.setUTCHours(hours, minutes, 0, 0);

  return result;
}

function formatTime(value) {
  if (!value) return null;

  return `${String(value.getUTCHours()).padStart(2, "0")}:${String(
    value.getUTCMinutes()
  ).padStart(2, "0")}`;
}

function formatAttendance(record) {
  if (!record) return record;

  return {
    ...record,
    checkIn: formatTime(record.checkIn),
    checkOut: formatTime(record.checkOut)
  };
}

async function getAccessContext(user) {
  if (MANAGEMENT_ROLES.includes(user.role)) {
    return {
      isManager: true,
      employeeId: null,
      groupIds: [],
      childIds: []
    };
  }

  if (STAFF_ROLES.includes(user.role)) {
    const employee = await prisma.employee.findFirst({
      where: {
        userId: user.id,
        status: "ACTIVE",
        role: user.role
      }
    });

    if (!employee) {
      fail(
        "Employee profile not found",
        HTTP_STATUS.FORBIDDEN,
        "EMPLOYEE_PROFILE_NOT_FOUND"
      );
    }

    const assignments = await prisma.staffAssignment.findMany({
      where: {
        employeeId: employee.id,
        role: user.role,
        endDate: null
      },
      select: {
        groupId: true
      }
    });

    return {
      isManager: false,
      employeeId: employee.id,
      groupIds: assignments.map((item) => item.groupId),
      childIds: []
    };
  }

  if (user.role === "PARENT") {
    const parent = await prisma.parent.findFirst({
      where: {
        userId: user.id,
        status: "ACTIVE"
      },
      include: {
        children: {
          where: {
            endDate: null
          },
          select: {
            childId: true
          }
        }
      }
    });

    if (!parent) {
      fail(
        "Parent profile not found",
        HTTP_STATUS.FORBIDDEN,
        "PARENT_PROFILE_NOT_FOUND"
      );
    }

    return {
      isManager: false,
      employeeId: null,
      groupIds: [],
      childIds: parent.children.map((item) => item.childId)
    };
  }

  fail(
    "You do not have permission to access attendance",
    HTTP_STATUS.FORBIDDEN,
    "FORBIDDEN"
  );
}

async function ensureChildAccess(childId, date, context) {
  const child = await prisma.child.findFirst({
    where: {
      id: childId,
      status: "ACTIVE"
    }
  });

  if (!child) {
    fail(
      "Child not found",
      HTTP_STATUS.NOT_FOUND,
      "CHILD_NOT_FOUND"
    );
  }

  if (context.isManager) {
    return child;
  }

  if (context.childIds.length > 0) {
    if (!context.childIds.includes(childId)) {
      fail(
        "You do not have access to this child",
        HTTP_STATUS.FORBIDDEN,
        "CHILD_ACCESS_DENIED"
      );
    }

    return child;
  }

  if (context.groupIds.length === 0) {
    fail(
      "You are not assigned to any group",
      HTTP_STATUS.FORBIDDEN,
      "GROUP_ACCESS_DENIED"
    );
  }

  const attendanceDate = toDate(date);

  const enrollment = await prisma.groupEnrollment.findFirst({
    where: {
      childId,
      groupId: { in: context.groupIds },
      startDate: { lte: attendanceDate },
      OR: [
        { endDate: null },
        { endDate: { gte: attendanceDate } }
      ]
    }
  });

  if (!enrollment) {
    fail(
      "Child does not belong to your assigned groups on this date",
      HTTP_STATUS.FORBIDDEN,
      "GROUP_ACCESS_DENIED"
    );
  }

  return child;
}

function buildAttendanceData(data, date) {
  return {
    ...(data.date !== undefined && { date }),
    ...(data.status !== undefined && { status: data.status }),
    ...(data.checkIn !== undefined && {
      checkIn: toTimeDate(data.checkIn, date)
    }),
    ...(data.checkOut !== undefined && {
      checkOut: toTimeDate(data.checkOut, date)
    }),
    ...(data.note !== undefined && { note: data.note })
  };
}

async function getAll(filters = {}, user) {
  const context = await getAccessContext(user);

  const where = {};

  if (filters.childId) {
    where.childId = filters.childId;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.date) {
    const date = toDate(filters.date);

    where.date = date;
  } else if (filters.from || filters.to) {
    where.date = {};

    if (filters.from) {
      where.date.gte = toDate(filters.from);
    }

    if (filters.to) {
      where.date.lte = toDate(filters.to);
    }
  }

  if (!context.isManager) {
    if (context.childIds.length > 0) {
      where.childId = {
        in: context.childIds
      };
    } else {
      if (
        filters.groupId &&
        !context.groupIds.includes(filters.groupId)
      ) {
        fail(
          "You do not have access to this group",
          HTTP_STATUS.FORBIDDEN,
          "GROUP_ACCESS_DENIED"
        );
      }

      where.child = {
        enrollments: {
          some: {
            ...(filters.groupId
              ? { groupId: filters.groupId }
              : { groupId: { in: context.groupIds } }),
            startDate: {
              lte: filters.to
                ? toDate(filters.to)
                : new Date()
            },
            OR: [
              { endDate: null },
              {
                endDate: {
                  gte: filters.from
                    ? toDate(filters.from)
                    : filters.date
                      ? toDate(filters.date)
                      : new Date()
                }
              }
            ]
          }
        }
      };
    }
  } else if (filters.groupId) {
    where.child = {
      enrollments: {
        some: {
          groupId: filters.groupId
        }
      }
    };
  }

  const records = await prisma.attendance.findMany({
    where,
    include: {
      child: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          childCode: true
        }
      },
      recordedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true
        }
      }
    },
    orderBy: [
      { date: "desc" },
      { createdAt: "desc" }
    ]
  });

  return records.map(formatAttendance);
}

async function getById(id, user) {
  const record = await prisma.attendance.findUnique({
    where: { id },
    include: {
      child: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          childCode: true
        }
      },
      recordedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true
        }
      }
    }
  });

  if (!record) {
    fail(
      "Attendance record not found",
      HTTP_STATUS.NOT_FOUND,
      "ATTENDANCE_NOT_FOUND"
    );
  }

  const context = await getAccessContext(user);

  await ensureChildAccess(
    record.childId,
    record.date.toISOString().slice(0, 10),
    context
  );

  return formatAttendance(record);
}

async function create(data, user) {
  const context = await getAccessContext(user);
  const date = toDate(data.date);

  await ensureChildAccess(data.childId, data.date, context);

  const existing = await prisma.attendance.findFirst({
    where: {
      childId: data.childId,
      date
    }
  });

  if (existing) {
    fail(
      "Attendance record already exists for this child and date",
      HTTP_STATUS.CONFLICT,
      "ATTENDANCE_ALREADY_EXISTS"
    );
  }

  const checkIn = toTimeDate(data.checkIn, date);
  const checkOut = toTimeDate(data.checkOut, date);

  if (checkIn && checkOut && checkOut <= checkIn) {
    fail(
      "checkOut must be later than checkIn",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "INVALID_TIME_RANGE"
    );
  }

  return prisma.$transaction(async (tx) => {
    const record = await tx.attendance.create({
      data: {
        childId: data.childId,
        date,
        status: data.status,
        checkIn,
        checkOut,
        note: data.note ?? null,
        recordedById: context.employeeId
      },
      include: {
        child: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            childCode: true
          }
        },
        recordedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    await auditService.createLog(
      {
        actorId: user.id,
        action: "CREATE",
        entityType: "Attendance",
        entityId: record.id,
        after: record
      },
      tx
    );

    return formatAttendance(record);
  });
}

async function update(id, data, user) {
  const context = await getAccessContext(user);

  return prisma.$transaction(async (tx) => {
    const before = await tx.attendance.findUnique({
      where: { id }
    });

    if (!before) {
      fail(
        "Attendance record not found",
        HTTP_STATUS.NOT_FOUND,
        "ATTENDANCE_NOT_FOUND"
      );
    }

    await ensureChildAccess(
      before.childId,
      before.date.toISOString().slice(0, 10),
      context
    );

    const date = data.date ? toDate(data.date) : before.date;

    await ensureChildAccess(
      before.childId,
      date.toISOString().slice(0, 10),
      context
    );

    const checkIn =
      data.checkIn !== undefined
        ? toTimeDate(data.checkIn, date)
        : before.checkIn
          ? toTimeDate(formatTime(before.checkIn), date)
          : null;

    const checkOut =
      data.checkOut !== undefined
        ? toTimeDate(data.checkOut, date)
        : before.checkOut
          ? toTimeDate(formatTime(before.checkOut), date)
          : null;

    if (checkIn && checkOut && checkOut <= checkIn) {
      fail(
        "checkOut must be later than checkIn",
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        "INVALID_TIME_RANGE"
      );
    }

    const updated = await tx.attendance.update({
      where: { id },
      data: {
        ...buildAttendanceData(data, date),
        checkIn,
        checkOut
      },
      include: {
        child: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            childCode: true
          }
        },
        recordedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    await auditService.createLog(
      {
        actorId: user.id,
        action: "UPDATE",
        entityType: "Attendance",
        entityId: id,
        before,
        after: updated
      },
      tx
    );

    return formatAttendance(updated);
  });
}

async function remove(id, user) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.attendance.findUnique({
      where: { id }
    });

    if (!before) {
      fail(
        "Attendance record not found",
        HTTP_STATUS.NOT_FOUND,
        "ATTENDANCE_NOT_FOUND"
      );
    }

    await tx.attendance.delete({
      where: { id }
    });

    await auditService.createLog(
      {
        actorId: user.id,
        action: "DELETE",
        entityType: "Attendance",
        entityId: id,
        before
      },
      tx
    );
  });
}

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove
};
