const prisma = require("../../config/prisma");
const auditService = require("../audit/audit.service");
const AppError = require("../../utils/app-error");
const HTTP_STATUS = require("../../utils/http-status");

const MANAGEMENT_ROLES = ["ADMIN", "MANAGER"];
const READ_ROLES = ["ADMIN", "MANAGER", "TEACHER", "EDUCATOR", "ASSISTANT"];

function fail(message, status, code) {
  throw new AppError(message, status, code);
}

function ensureReadAccess(user) {
  if (!user) {
    fail("Authentication required", HTTP_STATUS.UNAUTHORIZED, "UNAUTHORIZED");
  }

  if (!READ_ROLES.includes(user.role)) {
    fail("You do not have permission to access rooms", HTTP_STATUS.FORBIDDEN, "FORBIDDEN");
  }
}

function ensureManagementAccess(user) {
  if (!user || !MANAGEMENT_ROLES.includes(user.role)) {
    fail("You do not have permission to perform this action", HTTP_STATUS.FORBIDDEN, "FORBIDDEN");
  }
}

function handleRoomError(error) {
  if (error.code === "P2002") {
    fail("Room name already exists", HTTP_STATUS.CONFLICT, "ROOM_NAME_EXISTS");
  }

  if (error.code === "P2025" || error.code === "P2003") {
    fail("Related record not found", HTTP_STATUS.NOT_FOUND, "RELATED_RECORD_NOT_FOUND");
  }

  throw error;
}

async function getRoomOrFail(id, tx = prisma) {
  const room = await tx.room.findFirst({
    where: {
      id,
      status: { not: "ARCHIVED" }
    }
  });

  if (!room) {
    fail("Room not found", HTTP_STATUS.NOT_FOUND, "ROOM_NOT_FOUND");
  }

  return room;
}

async function ensureUniqueName(name, excludeId, tx = prisma) {
  const existing = await tx.room.findFirst({
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
    fail("Room name already exists", HTTP_STATUS.CONFLICT, "ROOM_NAME_EXISTS");
  }
}

async function getAll(filters = {}, user) {
  ensureReadAccess(user);

  const { search, purpose, status } = filters;

  const where = {
    status: status || { not: "ARCHIVED" }
  };

  if (search) {
    where.name = {
      contains: search.trim(),
      mode: "insensitive"
    };
  }

  if (purpose) {
    where.purpose = {
      contains: purpose.trim(),
      mode: "insensitive"
    };
  }

  return prisma.room.findMany({
    where,
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
}

async function getById(id, user) {
  ensureReadAccess(user);

  const room = await prisma.room.findFirst({
    where: {
      id,
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

  if (!room) {
    fail("Room not found", HTTP_STATUS.NOT_FOUND, "ROOM_NOT_FOUND");
  }

  return room;
}

async function create(data, user) {
  ensureManagementAccess(user);

  try {
    return await prisma.$transaction(async (tx) => {
      await ensureUniqueName(data.name, null, tx);

      const room = await tx.room.create({
        data: {
          name: data.name.trim(),
          purpose: data.purpose.trim(),
          capacity: data.capacity,
          status: data.status || "ACTIVE"
        }
      });

      await auditService.createLog(
        {
          actorId: user.id,
          action: "CREATE",
          entityType: "Room",
          entityId: room.id,
          after: room
        },
        tx
      );

      return room;
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    handleRoomError(error);
  }
}

async function update(id, data, user) {
  ensureManagementAccess(user);

  try {
    return await prisma.$transaction(async (tx) => {
      const before = await getRoomOrFail(id, tx);

      if (data.name !== undefined) {
        await ensureUniqueName(data.name, id, tx);
      }

      const updated = await tx.room.update({
        where: { id },
        data: {
          ...(data.name !== undefined && {
            name: data.name.trim()
          }),
          ...(data.purpose !== undefined && {
            purpose: data.purpose.trim()
          }),
          ...(data.capacity !== undefined && {
            capacity: data.capacity
          }),
          ...(data.status !== undefined && {
            status: data.status
          })
        }
      });

      await auditService.createLog(
        {
          actorId: user.id,
          action: "UPDATE",
          entityType: "Room",
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
    handleRoomError(error);
  }
}

async function remove(id, user) {
  ensureManagementAccess(user);

  return prisma.$transaction(async (tx) => {
    const before = await getRoomOrFail(id, tx);

    const activeGroupsCount = await tx.group.count({
      where: {
        mainRoomId: id,
        status: "ACTIVE"
      }
    });

    if (activeGroupsCount > 0) {
      fail("Room is assigned to an active group", HTTP_STATUS.CONFLICT, "ROOM_IN_USE");
    }

    const archived = await tx.room.update({
      where: { id },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date()
      }
    });

    await auditService.createLog(
      {
        actorId: user.id,
        action: "ARCHIVE",
        entityType: "Room",
        entityId: id,
        before,
        after: archived
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
