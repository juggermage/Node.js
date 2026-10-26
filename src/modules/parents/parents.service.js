const prisma = require("../../config/prisma");
const AppError = require("../../utils/AppError");
const { HTTP_STATUS } = require("../../utils/http-status");

function fail(message, status, code) {
  throw new AppError(message, status, code);
}

async function getParentOrFail(id, includeArchived = false) {
  const parent = await prisma.parent.findUnique({
    where: { id }
  });

  if (!parent || (!includeArchived && parent.status === "ARCHIVED")) {
    fail("Parent not found", HTTP_STATUS.NOT_FOUND, "PARENT_NOT_FOUND");
  }

  return parent;
}

async function ensureUniqueEmail(email, excludeId) {
  if (!email) return;

  const existing = await prisma.parent.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {})
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

async function getAll(query = {}) {
  const where = {
    status: query.status || { not: "ARCHIVED" }
  };

  if (query.search) {
    const search = query.search.trim();

    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search } }
    ];
  }

  return prisma.parent.findMany({
    where,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
  });
}

async function getById(id) {
  return getParentOrFail(id);
}

async function create(data) {
  const email = data.email?.trim().toLowerCase() || null;

  await ensureUniqueEmail(email);

  try {
    return await prisma.parent.create({
      data: {
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        phone: data.phone,
        email,
        status: "ACTIVE"
      }
    });
  } catch (error) {
    handlePrismaError(error);
  }
}

async function update(id, data) {
  await getParentOrFail(id);

  const updateData = { ...data };

  if (data.firstName !== undefined) {
    updateData.firstName = data.firstName.trim();
  }

  if (data.lastName !== undefined) {
    updateData.lastName = data.lastName.trim();
  }

  if (data.email !== undefined) {
    updateData.email = data.email?.trim().toLowerCase() || null;
    await ensureUniqueEmail(updateData.email, id);
  }

  try {
    return await prisma.parent.update({
      where: { id },
      data: updateData
    });
  } catch (error) {
    handlePrismaError(error);
  }
}

async function remove(id) {
  await getParentOrFail(id);

  // Не видаляємо зв'язки з дітьми та фінансову історію.
  return prisma.parent.update({
    where: { id },
    data: {
      status: "ARCHIVED",
      archivedAt: new Date()
    }
  });
}

async function getChildren(id) {
  await getParentOrFail(id);

  return prisma.childParent.findMany({
    where: { parentId: id },
    include: { child: true },
    orderBy: { startDate: "desc" }
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
