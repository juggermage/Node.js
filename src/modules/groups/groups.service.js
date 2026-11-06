
const prisma = require("../../config/prisma");
const auditService = require("../audit/audit.service");
const AppError = require("../../utils/app-error");
const HTTP_STATUS = require("../../utils/http-status");

const MAX_CAPACITY = 20;
const MANAGEMENT_ROLES = ["ADMIN", "MANAGER"];
const EMPLOYEE_ROLES = ["TEACHER", "EDUCATOR", "ASSISTANT"];
const READ_ROLES = [
  "ADMIN",
  "MANAGER",
  "PARENT",
  "TEACHER",
  "EDUCATOR",
  "ASSISTANT"
];

function fail(message, status, code) {
  throw new AppError(message, status, code);
}

function ensureManagementAccess(user) {
  if (!user || !MANAGEMENT_ROLES.includes(user.role)) {
    fail(
      "You do not have permission to perform this action",
      HTTP_STATUS.FORBIDDEN,
      "FORBIDDEN"
    );
  }
}

function ensureReadAccess(user) {
  if (!user) {
    fail(
      "Authentication required",
      HTTP_STATUS.UNAUTHORIZED,
      "UNAUTHORIZED"
    );
  }

  if (!READ_ROLES.includes(user.role)) {
    fail(
      "You do not have permission to access this resource",
      HTTP_STATUS.FORBIDDEN,
      "FORBIDDEN"
    );
  }
}

function getGroupAccessFilter(user) {
  ensureReadAccess(user);

  if (MANAGEMENT_ROLES.includes(user.role)) {
    return {};
  }

  if (user.role === "PARENT") {
    return {
      enrollments: {
        some: {
          endDate: null,
          child: {
            parents: {
              some: {
                endDate: null,
                parent: {
                  userId: user.id,
                  status: "ACTIVE"
                }
              }
            }
          }
        }
      }
    };
  }

  if (EMPLOYEE_ROLES.includes(user.role)) {
    return {
      staffAssignments: {
        some: {
          endDate: null,
          employee: {
            userId: user.id,
            status: "ACTIVE",
            role: user.role
          }
        }
      }
    };
  }

  return {};
}

function getChildAccessFilter(user) {
  ensureReadAccess(user);

  if (MANAGEMENT_ROLES.includes(user.role)) {
    return {};
  }

  if (user.role === "PARENT") {
    return {
      parents: {
        some: {
          endDate: null,
          parent: {
            userId: user.id,
            status: "ACTIVE"
          }
        }
      }
    };
  }

  if (EMPLOYEE_ROLES.includes(user.role)) {
    return {
      enrollments: {
        some: {
          endDate: null,
          group: {
            staffAssignments: {
              some: {
                endDate: null,
                employee: {
                  userId: user.id,
                  status: "ACTIVE",
                  role: user.role
                }
              }
            }
          }
        }
      }
    };
  }

  return {};
}

function ageInMonths(birthDate, now = new Date()) {
  const birth = new Date(birthDate);

  let months =
    (now.getUTCFullYear() - birth.getUTCFullYear()) * 12 +
    now.getUTCMonth() -
    birth.getUTCMonth();

  if (now.getUTCDate() < birth.getUTCDate()) {
    months--;
  }

  return months;
}

function checkAgeRange(from, to) {
  if (from > to) {
    fail(
      "Invalid age range",
      HTTP_STATUS.BAD_REQUEST,
      "INVALID_AGE_RANGE"
    );
  }
}

function checkChildAge(child, group) {
  const age = ageInMonths(child.birthDate);

  if (age < group.ageFromMonths || age > group.ageToMonths) {
    fail(
      "Child age does not match group",
      HTTP_STATUS.CONFLICT,
      "AGE_MISMATCH"
    );
  }
}

async function getExistingGroup(db, id) {
  const group = await db.group.findUnique({
    where: { id }
  });

  if (!group || group.status === "ARCHIVED") {
    fail(
      "Group not found",
      HTTP_STATUS.NOT_FOUND,
      "GROUP_NOT_FOUND"
    );
  }

  return group;
}

async function getActiveChild(db, childId) {
  const child = await db.child.findUnique({
    where: { id: childId }
  });

  if (!child) {
    fail(
      "Child not found",
      HTTP_STATUS.NOT_FOUND,
      "CHILD_NOT_FOUND"
    );
  }

  if (child.status !== "ACTIVE") {
    fail(
      "Child is not active",
      HTTP_STATUS.CONFLICT,
      "CHILD_NOT_ACTIVE"
    );
  }

  return child;
}

async function checkUniqueName(db, name, excludeId) {
  const existing = await db.group.findFirst({
    where: {
      name: {
        equals: name.trim(),
        mode: "insensitive"
      },
      ...(excludeId && {
        id: { not: excludeId }
      })
    }
  });

  if (existing) {
    fail(
      "Group name already exists",
      HTTP_STATUS.CONFLICT,
      "GROUP_NAME_EXISTS"
    );
  }
}

async function checkMainRoom(db, roomId, excludeId) {
  if (roomId == null) return;

  const room = await db.room.findUnique({
    where: { id: roomId }
  });

  if (!room || room.status !== "ACTIVE") {
    fail(
      "Active room not found",
      HTTP_STATUS.NOT_FOUND,
      "ROOM_NOT_FOUND"
    );
  }

  const occupied = await db.group.findFirst({
    where: {
      mainRoomId: roomId,
      status: "ACTIVE",
      ...(excludeId && {
        id: { not: excludeId }
      })
    }
  });

  if (occupied) {
    fail(
      "Room is already assigned",
      HTTP_STATUS.CONFLICT,
      "ROOM_ALREADY_ASSIGNED"
    );
  }
}

function handlePrismaError(error) {
  if (error.code === "P2002") {
    fail(
      "Group name already exists",
      HTTP_STATUS.CONFLICT,
      "GROUP_NAME_EXISTS"
    );
  }

  if (error.code === "P2025" || error.code === "P2003") {
    fail(
      "Related record not found",
      HTTP_STATUS.NOT_FOUND,
      "RELATED_RECORD_NOT_FOUND"
    );
  }

  throw error;
}

async function getAllGroups(query = {}, user) {
  const accessFilter = getGroupAccessFilter(user);

  const where = {
    ...accessFilter,
    status: MANAGEMENT_ROLES.includes(user.role)
      ? query.status || { not: "ARCHIVED" }
      : "ACTIVE"
  };

  if (query.search) {
    where.name = {
      contains: query.search.trim(),
      mode: "insensitive"
    };
  }

  return prisma.group.findMany({
    where,
    include: {
      mainRoom: true,
      _count: {
        select: {
          enrollments: {
            where: { endDate: null }
          }
        }
      }
    },
    orderBy: { name: "asc" }
  });
}

async function getGroupById(id, user) {
  const accessFilter = getGroupAccessFilter(user);

  const group = await prisma.group.findFirst({
    where: {
      id,
      ...accessFilter,
      status: MANAGEMENT_ROLES.includes(user.role)
        ? { not: "ARCHIVED" }
        : "ACTIVE"
    },
    include: {
      mainRoom: true,
      enrollments: {
        where: {
          endDate: null,
          child: getChildAccessFilter(user)
        },
        include: { child: true }
      }
    }
  });

  if (!group) {
    fail(
      "Group not found",
      HTTP_STATUS.NOT_FOUND,
      "GROUP_NOT_FOUND"
    );
  }

  return group;
}

async function createGroup(data, user) {
  ensureManagementAccess(user);

  checkAgeRange(data.ageFromMonths, data.ageToMonths);

  try {
    return await prisma.$transaction(async (tx) => {
      await checkUniqueName(tx, data.name);
      await checkMainRoom(tx, data.mainRoomId);

      const group = await tx.group.create({
        data: {
          name: data.name.trim(),
          ageFromMonths: data.ageFromMonths,
          ageToMonths: data.ageToMonths,
          capacity: data.capacity ?? MAX_CAPACITY,
          mainRoomId: data.mainRoomId ?? null,
          status: data.status ?? "ACTIVE"
        },
        include: {
          mainRoom: true
        }
      });

      await auditService.createLog(
        {
          actorId: user.id,
          action: "CREATE",
          entityType: "Group",
          entityId: group.id,
          after: group
        },
        tx
      );

      return group;
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    handlePrismaError(error);
  }
}

async function updateGroup(id, data, user) {
  ensureManagementAccess(user);

  try {
    return await prisma.$transaction(async (tx) => {
      const group = await getExistingGroup(tx, id);

      const from = data.ageFromMonths ?? group.ageFromMonths;
      const to = data.ageToMonths ?? group.ageToMonths;
      const capacity = data.capacity ?? group.capacity;
      const nextStatus = data.status ?? group.status;

      checkAgeRange(from, to);

      if (data.name !== undefined) {
        await checkUniqueName(tx, data.name, id);
      }

      const roomId =
        data.mainRoomId !== undefined
          ? data.mainRoomId
          : group.mainRoomId;

      if (nextStatus === "ACTIVE") {
        await checkMainRoom(tx, roomId, id);
      }

      const enrollments = await tx.groupEnrollment.findMany({
        where: {
          groupId: id,
          endDate: null
        },
        include: { child: true }
      });

      if (capacity < enrollments.length) {
        fail(
          "Capacity is below enrolled children count",
          HTTP_STATUS.CONFLICT,
          "CAPACITY_BELOW_ENROLLED"
        );
      }

      for (const enrollment of enrollments) {
        checkChildAge(enrollment.child, {
          ageFromMonths: from,
          ageToMonths: to
        });
      }

      if (nextStatus === "INACTIVE" && enrollments.length > 0) {
        fail(
          "Group has active children",
          HTTP_STATUS.CONFLICT,
          "GROUP_HAS_ACTIVE_CHILDREN"
        );
      }

      const before = {
        ...group,
        mainRoom: undefined
      };

      const updated = await tx.group.update({
        where: { id },
        data: {
          ...(data.name !== undefined && {
            name: data.name.trim()
          }),
          ...(data.ageFromMonths !== undefined && {
            ageFromMonths: data.ageFromMonths
          }),
          ...(data.ageToMonths !== undefined && {
            ageToMonths: data.ageToMonths
          }),
          ...(data.capacity !== undefined && {
            capacity: data.capacity
          }),
          ...(data.mainRoomId !== undefined && {
            mainRoomId: data.mainRoomId
          }),
          ...(data.status !== undefined && {
            status: data.status
          })
        },
        include: {
          mainRoom: true
        }
      });

      await auditService.createLog(
        {
          actorId: user.id,
          action: "UPDATE",
          entityType: "Group",
          entityId: id,
          before,
          after: updated
        },
        tx
      );

      return updated;
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    handlePrismaError(error);
  }
}

async function softDeleteGroup(id, user) {
  ensureManagementAccess(user);

  return prisma.$transaction(async (tx) => {
    const group = await getExistingGroup(tx, id);

    const count = await tx.groupEnrollment.count({
      where: {
        groupId: id,
        endDate: null
      }
    });

    if (count > 0) {
      fail(
        "Cannot archive group with active children",
        HTTP_STATUS.CONFLICT,
        "GROUP_HAS_ACTIVE_CHILDREN"
      );
    }

    const archived = await tx.group.update({
      where: { id },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
        mainRoomId: null
      }
    });

    await auditService.createLog(
      {
        actorId: user.id,
        action: "ARCHIVE",
        entityType: "Group",
        entityId: id,
        before: group,
        after: archived
      },
      tx
    );

    return archived;
  });
}

async function enrollChild(groupId, { childId }, user) {
  ensureManagementAccess(user);

  return prisma.$transaction(async (tx) => {
    const group = await getExistingGroup(tx, groupId);

    if (group.status !== "ACTIVE") {
      fail(
        "Group is not active",
        HTTP_STATUS.CONFLICT,
        "GROUP_NOT_ACTIVE"
      );
    }

    const child = await getActiveChild(tx, childId);
    checkChildAge(child, group);

    const existing = await tx.groupEnrollment.findFirst({
      where: {
        childId,
        endDate: null
      }
    });

    if (existing) {
      fail(
        "Child already enrolled",
        HTTP_STATUS.CONFLICT,
        "CHILD_ALREADY_ENROLLED"
      );
    }

    const count = await tx.groupEnrollment.count({
      where: {
        groupId,
        endDate: null
      }
    });

    if (count >= group.capacity) {
      fail(
        "Group capacity exceeded",
        HTTP_STATUS.CONFLICT,
        "GROUP_CAPACITY_EXCEEDED"
      );
    }

    const enrollment = await tx.groupEnrollment.create({
      data: {
        childId,
        groupId,
        startDate: new Date()
      },
      include: {
        child: true,
        group: true
      }
    });

    await auditService.createLog(
      {
        actorId: user.id,
        action: "CREATE",
        entityType: "GroupEnrollment",
        entityId: enrollment.id,
        after: enrollment
      },
      tx
    );

    return enrollment;
  });
}

async function completeEnrollment(enrollmentId, user) {
  ensureManagementAccess(user);

  return prisma.$transaction(async (tx) => {
    const enrollment = await tx.groupEnrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        child: true,
        group: true
      }
    });

    if (!enrollment) {
      fail(
        "Enrollment not found",
        HTTP_STATUS.NOT_FOUND,
        "ENROLLMENT_NOT_FOUND"
      );
    }

    if (enrollment.endDate !== null) {
      fail(
        "Enrollment already completed",
        HTTP_STATUS.CONFLICT,
        "ENROLLMENT_ALREADY_CLOSED"
      );
    }

    const updated = await tx.groupEnrollment.update({
      where: { id: enrollmentId },
      data: {
        endDate: new Date()
      },
      include: {
        child: true,
        group: true
      }
    });

    await auditService.createLog(
      {
        actorId: user.id,
        action: "CANCEL",
        entityType: "GroupEnrollment",
        entityId: enrollmentId,
        before: enrollment,
        after: updated
      },
      tx
    );

    return updated;
  });
}

async function getGroupHistory(groupId, user) {
  const accessFilter = getGroupAccessFilter(user);

  const group = await prisma.group.findFirst({
    where: {
      id: groupId,
      ...accessFilter,
      status: MANAGEMENT_ROLES.includes(user.role)
        ? { not: "ARCHIVED" }
        : "ACTIVE"
    }
  });

  if (!group) {
    fail(
      "Group not found",
      HTTP_STATUS.NOT_FOUND,
      "GROUP_NOT_FOUND"
    );
  }

  return prisma.groupEnrollment.findMany({
    where: {
      groupId,
      child: getChildAccessFilter(user)
    },
    include: { child: true },
    orderBy: { startDate: "desc" }
  });
}

async function getChildHistory(childId, user) {
  const accessFilter = getChildAccessFilter(user);

  const child = await prisma.child.findFirst({
    where: {
      id: childId,
      ...accessFilter
    }
  });

  if (!child) {
    fail(
      "Child not found",
      HTTP_STATUS.NOT_FOUND,
      "CHILD_NOT_FOUND"
    );
  }

  return prisma.groupEnrollment.findMany({
    where: { childId },
    include: { group: true },
    orderBy: { startDate: "desc" }
  });
}

module.exports = {
  getAllGroups,
  getGroupById,
  createGroup,
  updateGroup,
  softDeleteGroup,
  enrollChild,
  completeEnrollment,
  getGroupHistory,
  getChildHistory
};
