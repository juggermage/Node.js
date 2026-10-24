const prisma = require("../../config/prisma");
const AppError = require("../../utils/app-error");
const HTTP_STATUS = require("../../utils/http-status");

function handleRoomError(error) {
  if (error.code === "P2002") {
    throw new AppError(
      "Room name already exists",
      HTTP_STATUS.CONFLICT,
      "ROOM_NAME_EXISTS"
    );
  }

  throw error;
}

async function getAll(filters = {}) {
  const { search, purpose, status } = filters;

  const where = {
    status: status || { not: "ARCHIVED" }
  };

  if (search) {
    where.name = {
      contains: search,
      mode: "insensitive"
    };
  }

  if (purpose) {
    where.purpose = {
      contains: purpose,
      mode: "insensitive"
    };
  }

  return prisma.room.findMany({
    where,
    orderBy: {
      createdAt: "desc"
    }
  });
}

async function getById(id) {
  const room = await prisma.room.findFirst({
    where: {
      id,
      status: { not: "ARCHIVED" }
    }
  });

  if (!room) {
    throw new AppError(
      "Room not found",
      HTTP_STATUS.NOT_FOUND,
      "ROOM_NOT_FOUND"
    );
  }

  return room;
}

async function create(data) {
  try {
    return await prisma.room.create({
      data
    });
  } catch (error) {
    handleRoomError(error);
  }
}

async function update(id, data) {
  await getById(id);

  try {
    const result = await prisma.room.updateMany({
      where: {
        id,
        status: { not: "ARCHIVED" }
      },
      data
    });

    if (result.count === 0) {
      throw new AppError(
        "Room not found",
        HTTP_STATUS.NOT_FOUND,
        "ROOM_NOT_FOUND"
      );
    }

    return getById(id);
  } catch (error) {
    handleRoomError(error);
  }
}

async function remove(id) {
  await getById(id);

  // Не дозволяємо архівувати кімнату,
  // закріплену за активною групою.
  const activeGroupsCount = await prisma.group.count({
    where: {
      mainRoomId: id,
      status: "ACTIVE"
    }
  });

  if (activeGroupsCount > 0) {
    throw new AppError(
      "Room is assigned to an active group",
      HTTP_STATUS.CONFLICT,
      "ROOM_IN_USE"
    );
  }

  const result = await prisma.room.updateMany({
    where: {
      id,
      status: { not: "ARCHIVED" }
    },
    data: {
      status: "ARCHIVED",
      archivedAt: new Date()
    }
  });

  if (result.count === 0) {
    throw new AppError(
      "Room not found",
      HTTP_STATUS.NOT_FOUND,
      "ROOM_NOT_FOUND"
    );
  }
}

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove
};
