const prisma = require("../../config/prisma");
const AppError = require("../../utils/AppError");
const { HTTP_STATUS } = require("../../utils/http-status");

const MAX_CAPACITY = 20;

function fail(message, status, code) {
  throw new AppError(message, status, code);
}

function ageInMonths(birthDate, now = new Date()) {
  const birth = new Date(birthDate);

  let months =
    (now.getUTCFullYear() - birth.getUTCFullYear()) * 12 + now.getUTCMonth() - birth.getUTCMonth();

  if (now.getUTCDate() < birth.getUTCDate()) {
    months--;
  }

  return months;
}

function checkAgeRange(from, to) {
  if (from > to) {
    fail("Invalid age range", HTTP_STATUS.BAD_REQUEST, "INVALID_AGE_RANGE");
  }
}

function checkChildAge(child, group) {
  const age = ageInMonths(child.birthDate);

  if (age < group.ageFromMonths || age > group.ageToMonths) {
    fail("Child age does not match group", HTTP_STATUS.CONFLICT, "AGE_MISMATCH");
  }
}

async function getExistingGroup(db, id) {
  const group = await db.group.findUnique({
    where: { id }
  });

  if (!group || group.status === "ARCHIVED") {
    fail("Group not found", HTTP_STATUS.NOT_FOUND, "GROUP_NOT_FOUND");
  }

  return group;
}

async function getActiveChild(db, childId) {
  const child = await db.child.findUnique({
    where: { id: childId }
  });

  if (!child) {
    fail("Child not found", HTTP_STATUS.NOT_FOUND, "CHILD_NOT_FOUND");
  }

  if (child.status !== "ACTIVE") {
    fail("Child is not active", HTTP_STATUS.CONFLICT, "CHILD_NOT_ACTIVE");
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
    fail("Group name already exists", HTTP_STATUS.CONFLICT, "GROUP_NAME_EXISTS");
  }
}

async function checkMainRoom(db, roomId, excludeId) {
  if (roomId == null) return;

  const room = await db.room.findUnique({
    where: { id: roomId }
  });

  if (!room || room.status !== "ACTIVE") {
    fail("Active room not found", HTTP_STATUS.NOT_FOUND, "ROOM_NOT_FOUND");
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
    fail("Room is already assigned", HTTP_STATUS.CONFLICT, "ROOM_ALREADY_ASSIGNED");
  }
}

async function getAllGroups(query = {}) {
  const where = {
    status: query.status || { not: "ARCHIVED" }
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

async function getGroupById(id) {
  await getExistingGroup(prisma, id);

  return prisma.group.findUnique({
    where: { id },
    include: {
      mainRoom: true,
      enrollments: {
        where: { endDate: null },
        include: { child: true }
      }
    }
  });
}

async function createGroup(data) {
  checkAgeRange(data.ageFromMonths, data.ageToMonths);

  await checkUniqueName(prisma, data.name);
  await checkMainRoom(prisma, data.mainRoomId);

  try {
    return await prisma.group.create({
      data: {
        name: data.name.trim(),
        ageFromMonths: data.ageFromMonths,
        ageToMonths: data.ageToMonths,
        capacity: data.capacity ?? MAX_CAPACITY,
        mainRoomId: data.mainRoomId ?? null,
        status: "ACTIVE"
      }
    });
  } catch (error) {
    if (error.code === "P2002") {
      fail("Group name already exists", HTTP_STATUS.CONFLICT, "GROUP_NAME_EXISTS");
    }
    throw error;
  }
}

async function updateGroup(id, data) {
  const group = await getExistingGroup(prisma, id);

  const from = data.ageFromMonths ?? group.ageFromMonths;
  const to = data.ageToMonths ?? group.ageToMonths;
  const capacity = data.capacity ?? group.capacity;
  const nextStatus = data.status ?? group.status;

  checkAgeRange(from, to);

  if (data.name !== undefined) {
    await checkUniqueName(prisma, data.name, id);
  }

  const roomId = data.mainRoomId !== undefined ? data.mainRoomId : group.mainRoomId;

  if (nextStatus === "ACTIVE") {
    await checkMainRoom(prisma, roomId, id);
  }

  const enrollments = await prisma.groupEnrollment.findMany({
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
    fail("Group has active children", HTTP_STATUS.CONFLICT, "GROUP_HAS_ACTIVE_CHILDREN");
  }

  try {
    return await prisma.group.update({
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
      }
    });
  } catch (error) {
    if (error.code === "P2002") {
      fail("Group name already exists", HTTP_STATUS.CONFLICT, "GROUP_NAME_EXISTS");
    }
    throw error;
  }
}

async function softDeleteGroup(id) {
  await getExistingGroup(prisma, id);

  const count = await prisma.groupEnrollment.count({
    where: { groupId: id, endDate: null }
  });

  if (count > 0) {
    fail(
      "Cannot archive group with active children",
      HTTP_STATUS.CONFLICT,
      "GROUP_HAS_ACTIVE_CHILDREN"
    );
  }

  return prisma.group.update({
    where: { id },
    data: {
      status: "ARCHIVED",
      archivedAt: new Date(),
      mainRoomId: null
    }
  });
}

async function enrollChild(groupId, { childId }) {
  return prisma.$transaction(async (tx) => {
    const group = await getExistingGroup(tx, groupId);

    if (group.status !== "ACTIVE") {
      fail("Group is not active", HTTP_STATUS.CONFLICT, "GROUP_NOT_ACTIVE");
    }

    const child = await getActiveChild(tx, childId);
    checkChildAge(child, group);

    const existing = await tx.groupEnrollment.findFirst({
      where: { childId, endDate: null }
    });

    if (existing) {
      fail("Child already enrolled", HTTP_STATUS.CONFLICT, "CHILD_ALREADY_ENROLLED");
    }

    const count = await tx.groupEnrollment.count({
      where: { groupId, endDate: null }
    });

    if (count >= group.capacity) {
      fail("Group capacity exceeded", HTTP_STATUS.CONFLICT, "GROUP_CAPACITY_EXCEEDED");
    }

    return tx.groupEnrollment.create({
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
  });
}

async function completeEnrollment(enrollmentId) {
  const enrollment = await prisma.groupEnrollment.findUnique({
    where: { id: enrollmentId }
  });

  if (!enrollment) {
    fail("Enrollment not found", HTTP_STATUS.NOT_FOUND, "ENROLLMENT_NOT_FOUND");
  }

  if (enrollment.endDate !== null) {
    fail("Enrollment already completed", HTTP_STATUS.CONFLICT, "ENROLLMENT_ALREADY_CLOSED");
  }

  const result = await prisma.groupEnrollment.updateMany({
    where: {
      id: enrollmentId,
      endDate: null
    },
    data: { endDate: new Date() }
  });

  if (result.count !== 1) {
    fail("Enrollment already changed", HTTP_STATUS.CONFLICT, "ENROLLMENT_CONFLICT");
  }

  return prisma.groupEnrollment.findUnique({
    where: { id: enrollmentId }
  });
}

async function transferChild({ childId, toGroupId }) {
  return prisma.$transaction(async (tx) => {
    const child = await getActiveChild(tx, childId);

    const current = await tx.groupEnrollment.findFirst({
      where: { childId, endDate: null }
    });

    if (!current) {
      fail("Active enrollment not found", HTTP_STATUS.NOT_FOUND, "ACTIVE_ENROLLMENT_NOT_FOUND");
    }

    if (current.groupId === toGroupId) {
      fail("Child already belongs to this group", HTTP_STATUS.CONFLICT, "SAME_GROUP_TRANSFER");
    }

    const target = await getExistingGroup(tx, toGroupId);

    if (target.status !== "ACTIVE") {
      fail("Target group is not active", HTTP_STATUS.CONFLICT, "GROUP_NOT_ACTIVE");
    }

    checkChildAge(child, target);

    const count = await tx.groupEnrollment.count({
      where: {
        groupId: toGroupId,
        endDate: null
      }
    });

    if (count >= target.capacity) {
      fail("Target group is full", HTTP_STATUS.CONFLICT, "GROUP_CAPACITY_EXCEEDED");
    }

    const now = new Date();

    const closed = await tx.groupEnrollment.updateMany({
      where: {
        id: current.id,
        endDate: null
      },
      data: { endDate: now }
    });

    if (closed.count !== 1) {
      fail("Enrollment changed", HTTP_STATUS.CONFLICT, "ENROLLMENT_CONFLICT");
    }

    return tx.groupEnrollment.create({
      data: {
        childId,
        groupId: toGroupId,
        startDate: now
      },
      include: {
        child: true,
        group: true
      }
    });
  });
}

async function getGroupHistory(groupId) {
  const group = await prisma.group.findUnique({
    where: { id: groupId }
  });

  if (!group) {
    fail("Group not found", HTTP_STATUS.NOT_FOUND, "GROUP_NOT_FOUND");
  }

  return prisma.groupEnrollment.findMany({
    where: { groupId },
    include: { child: true },
    orderBy: { startDate: "desc" }
  });
}

async function getChildHistory(childId) {
  const child = await prisma.child.findUnique({
    where: { id: childId }
  });

  if (!child) {
    fail("Child not found", HTTP_STATUS.NOT_FOUND, "CHILD_NOT_FOUND");
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
  transferChild,
  getGroupHistory,
  getChildHistory
};
