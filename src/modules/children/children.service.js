const { randomUUID } = require("node:crypto");
const prisma = require("../../config/prisma");
const AppError = require("../../utils/app-error");
const HTTP_STATUS = require("../../utils/http-status");

function normalizeData(data) {
  const result = { ...data };

  if (result.birthDate !== undefined) {
    result.birthDate = new Date(`${result.birthDate}T00:00:00.000Z`);
  }

  return result;
}

async function getAll(search) {
  const where = {
    status: { not: "ARCHIVED" }
  };

  if (search) {
    const query = search.trim();

    if (query) {
      const parts = query.split(/\s+/);

      if (parts.length === 2) {
        where.OR = [
          {
            firstName: {
              contains: parts[0],
              mode: "insensitive"
            },
            lastName: {
              contains: parts[1],
              mode: "insensitive"
            }
          },
          {
            firstName: {
              contains: parts[1],
              mode: "insensitive"
            },
            lastName: {
              contains: parts[0],
              mode: "insensitive"
            }
          }
        ];
      } else {
        where.OR = [
          {
            firstName: {
              contains: query,
              mode: "insensitive"
            }
          },
          {
            lastName: {
              contains: query,
              mode: "insensitive"
            }
          }
        ];
      }
    }
  }

  return prisma.child.findMany({
    where,
    orderBy: {
      createdAt: "desc"
    }
  });
}

async function getById(id) {
  const child = await prisma.child.findFirst({
    where: {
      id,
      status: { not: "ARCHIVED" }
    }
  });

  if (!child) {
    throw new AppError("Child not found", HTTP_STATUS.NOT_FOUND, "CHILD_NOT_FOUND");
  }

  return child;
}

async function create(data) {
  return prisma.child.create({
    data: {
      ...normalizeData(data),
      childCode: randomUUID()
    }
  });
}

async function update(id, data) {
  const result = await prisma.child.updateMany({
    where: {
      id,
      status: { not: "ARCHIVED" }
    },
    data: normalizeData(data)
  });

  if (result.count === 0) {
    throw new AppError("Child not found", HTTP_STATUS.NOT_FOUND, "CHILD_NOT_FOUND");
  }

  return getById(id);
}

async function remove(id) {
  const result = await prisma.child.updateMany({
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
    throw new AppError("Child not found", HTTP_STATUS.NOT_FOUND, "CHILD_NOT_FOUND");
  }
}

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove
};
