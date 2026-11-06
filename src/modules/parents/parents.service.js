const prisma = require("../../config/prisma");
const auditService = require("../audit/audit.service");
const AppError = require("../../utils/app-error");
const HTTP_STATUS = require("../../utils/http-status");

const MANAGEMENT_ROLES = ["ADMIN", "MANAGER"];

function fail(message, status, code) {
  throw new AppError(message, status, code);
}

function ensureManagementAccess(user) {
  if (!user || !MANAGEMENT_ROLES.includes(user.role)) {
    fail("You do not have permission to perform this action", HTTP_STATUS.FORBIDDEN, "FORBIDDEN");
  }
}

async function getOwnParentOrFail(user, tx = prisma) {
  if (!user || user.role !== "PARENT") {
    fail("You do not have permission to access this resource", HTTP_STATUS.FORBIDDEN, "FORBIDDEN");
  }

  const parent = await tx.parent.findFirst({
    where: {
      userId: user.id,
      status: { not: "ARCHIVED" }
    }
  });

  if (!parent) {
    fail("Parent profile not found", HTTP_STATUS.NOT_FOUND, "PARENT_NOT_FOUND");
  }

  return parent;
}

async function getParentOrFail(id, tx = prisma) {
  const parent = await tx.parent.findFirst({
    where: {
      id,
      status: { not: "ARCHIVED" }
    }
  });

  if (!parent) {
    fail("Parent not found", HTTP_STATUS.NOT_FOUND, "PARENT_NOT_FOUND");
  }

  return parent;
}

async function ensureParentAccess(id, user, tx = prisma) {
  if (MANAGEMENT_ROLES.includes(user?.role)) {
    return getParentOrFail(id, tx);
  }

  if (user?.role === "PARENT") {
    const parent = await getOwnParentOrFail(user, tx);

    if (parent.id !== id) {
      fail("You do not have permission to access this parent", HTTP_STATUS.FORBIDDEN, "FORBIDDEN");
    }

    return parent;
  }

  fail("You do not have permission to access this resource", HTTP_STATUS.FORBIDDEN, "FORBIDDEN");
}

async function ensureUniqueEmail(email, excludeId, tx = prisma) {
  if (!email) return;

  const existing = await tx.parent.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive"
      },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      status: { not: "ARCHIVED" }
    }
  });

  if (existing) {
    fail("Email is already registered", HTTP_STATUS.CONFLICT, "PARENT_EMAIL_EXISTS");
  }
}

function handlePrismaError(error) {
  if (error.code === "P2002") {
    fail(
      "A record with these unique fields already exists",
      HTTP_STATUS.CONFLICT,
      "DUPLICATE_RECORD"
    );
  }

  if (error.code === "P2025") {
    fail("Parent not found", HTTP_STATUS.NOT_FOUND, "PARENT_NOT_FOUND");
  }

  throw error;
}

function normalizeParentData(data) {
  const result = { ...data };

  if (result.firstName !== undefined) {
    result.firstName = result.firstName.trim();
  }

  if (result.lastName !== undefined) {
    result.lastName = result.lastName.trim();
  }

  if (result.email !== undefined) {
    result.email = result.email?.trim().toLowerCase() || null;
  }

  return result;
}

async function getAll(query = {}, user) {
  if (user?.role === "PARENT") {
    const parent = await getOwnParentOrFail(user);

    const children = await prisma.childParent.findMany({
      where: {
        parentId: parent.id,
        endDate: null
      },
      include: {
        child: true
      }
    });

    return {
      items: [parent],
      pagination: {
        page: 1,
        limit: 1,
        total: 1,
        totalPages: 1
      },
      children: children.map((item) => item.child)
    };
  }

  ensureManagementAccess(user);

  const { search, status, page = 1, limit = 20 } = query;

  const where = {
    status: status || { not: "ARCHIVED" }
  };

  if (search) {
    const value = search.trim();

    where.OR = [
      {
        firstName: {
          contains: value,
          mode: "insensitive"
        }
      },
      {
        lastName: {
          contains: value,
          mode: "insensitive"
        }
      },
      {
        email: {
          contains: value,
          mode: "insensitive"
        }
      },
      {
        phone: {
          contains: value
        }
      }
    ];
  }

  const skip = (page - 1) * limit;

  const [items, total] = await prisma.$transaction([
    prisma.parent.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip,
      take: limit
    }),
    prisma.parent.count({ where })
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

async function getById(id, user) {
  return ensureParentAccess(id, user);
}

async function create(data, user) {
  ensureManagementAccess(user);

  const normalizedData = normalizeParentData(data);

  await ensureUniqueEmail(normalizedData.email);

  try {
    return await prisma.$transaction(async (tx) => {
      const parent = await tx.parent.create({
        data: {
          ...normalizedData,
          status: "ACTIVE"
        }
      });

      await auditService.createLog(
        {
          actorId: user.id,
          action: "CREATE",
          entityType: "Parent",
          entityId: parent.id,
          after: parent
        },
        tx
      );

      return parent;
    });
  } catch (error) {
    handlePrismaError(error);
  }
}

async function update(id, data, user) {
  ensureManagementAccess(user);

  const normalizedData = normalizeParentData(data);

  if (normalizedData.email !== undefined) {
    await ensureUniqueEmail(normalizedData.email, id);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const before = await getParentOrFail(id, tx);

      const parent = await tx.parent.update({
        where: { id },
        data: normalizedData
      });

      await auditService.createLog(
        {
          actorId: user.id,
          action: "UPDATE",
          entityType: "Parent",
          entityId: parent.id,
          before,
          after: parent
        },
        tx
      );

      return parent;
    });
  } catch (error) {
    handlePrismaError(error);
  }
}

async function remove(id, user) {
  ensureManagementAccess(user);

  return prisma.$transaction(async (tx) => {
    const before = await getParentOrFail(id, tx);

    const parent = await tx.parent.update({
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
        entityType: "Parent",
        entityId: parent.id,
        before,
        after: parent
      },
      tx
    );

    return parent;
  });
}

async function getChildren(id, user) {
  const parent = await ensureParentAccess(id, user);

  return prisma.childParent.findMany({
    where: {
      parentId: parent.id,
      endDate: null,
      child: {
        status: { not: "ARCHIVED" }
      }
    },
    include: {
      child: true
    },
    orderBy: {
      startDate: "desc"
    }
  });
}

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove,
  getChildren
};
