const prisma = require("../../config/prisma");
const AppError = require("../../utils/AppError");
const { HTTP_STATUS } = require("../../utils/http-status");

function fail(message, status, code) {
  throw new AppError(message, status, code);
}

function handlePrismaError(error) {
  if (error.code === "P2003" || error.code === "P2025") {
    fail("Child or parent not found", HTTP_STATUS.NOT_FOUND, "RELATED_RECORD_NOT_FOUND");
  }

  if (error.code === "P2002") {
    fail("This child-parent relationship already exists", HTTP_STATUS.CONFLICT, "CHILD_PARENT_EXISTS");
  }

  throw error;
}

async function createOrRestore({ childId, parentId, relation }) {
  const [child, parent] = await Promise.all([
    prisma.child.findUnique({ where: { id: childId } }),
    prisma.parent.findUnique({ where: { id: parentId } })
  ]);

  if (!child || child.status === "ARCHIVED") {
    fail("Child not found", HTTP_STATUS.NOT_FOUND, "CHILD_NOT_FOUND");
  }

  if (!parent || parent.status !== "ACTIVE") {
    fail("Active parent not found", HTTP_STATUS.NOT_FOUND, "PARENT_NOT_FOUND");
  }

  const existing = await prisma.childParent.findUnique({
    where: {
      childId_parentId: { childId, parentId }
    }
  });

  try {
    if (existing && existing.endDate === null) {
      fail(
        "This child-parent relationship is already active",
        HTTP_STATUS.CONFLICT,
        "CHILD_PARENT_EXISTS"
      );
    }

    if (existing) {
      return await prisma.childParent.update({
        where: { id: existing.id },
        data: {
          relation,
          startDate: new Date(),
          endDate: null
        },
        include: { child: true, parent: true }
      });
    }

    return await prisma.childParent.create({
      data: { childId, parentId, relation },
      include: { child: true, parent: true }
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    handlePrismaError(error);
  }
}

async function getById(id) {
  const link = await prisma.childParent.findUnique({
    where: { id },
    include: { child: true, parent: true }
  });

  if (!link) {
    fail("Relationship not found", HTTP_STATUS.NOT_FOUND, "CHILD_PARENT_NOT_FOUND");
  }

  return link;
}

async function getForChild(childId, includeEnded = false) {
  const child = await prisma.child.findUnique({
    where: { id: childId }
  });

  if (!child) {
    fail("Child not found", HTTP_STATUS.NOT_FOUND, "CHILD_NOT_FOUND");
  }

  return prisma.childParent.findMany({
    where: {
      childId,
      ...(includeEnded ? {} : { endDate: null })
    },
    include: { parent: true },
    orderBy: { startDate: "desc" }
  });
}

async function getForParent(parentId, includeEnded = false) {
  const parent = await prisma.parent.findUnique({
    where: { id: parentId }
  });

  if (!parent) {
    fail("Parent not found", HTTP_STATUS.NOT_FOUND, "PARENT_NOT_FOUND");
  }

  return prisma.childParent.findMany({
    where: {
      parentId,
      ...(includeEnded ? {} : { endDate: null })
    },
    include: { child: true },
    orderBy: { startDate: "desc" }
  });
}

async function complete(id) {
  const link = await prisma.childParent.findUnique({
    where: { id }
  });

  if (!link) {
    fail("Relationship not found", HTTP_STATUS.NOT_FOUND, "CHILD_PARENT_NOT_FOUND");
  }

  if (link.endDate !== null) {
    fail(
      "Relationship already ended",
      HTTP_STATUS.CONFLICT,
      "RELATIONSHIP_ALREADY_ENDED"
    );
  }

  try {
    return await prisma.childParent.update({
      where: { id },
      data: { endDate: new Date() },
      include: { child: true, parent: true }
    });
  } catch (error) {
    handlePrismaError(error);
  }
}

module.exports = {
  createOrRestore,
  getById,
  getForChild,
  getForParent,
  complete
};