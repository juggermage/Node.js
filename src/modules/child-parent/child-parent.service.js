const prisma = require("../../config/prisma");
const AppError = require("../../utils/AppError");
const { HTTP_STATUS } = require("../../utils/http-status");

function fail(message, status, code) {
  throw new AppError(message, status, code);
}

async function createOrRestore({ childId, parentId, relation }) {
  return prisma.$transaction(async (tx) => {
    const [child, parent] = await Promise.all([
      tx.child.findUnique({ where: { id: childId } }),
      tx.parent.findUnique({ where: { id: parentId } })
    ]);

    if (!child || child.status === "ARCHIVED") {
      fail("Child not found", HTTP_STATUS.NOT_FOUND, "CHILD_NOT_FOUND");
    }

    if (!parent || parent.status !== "ACTIVE") {
      fail("Active parent not found", HTTP_STATUS.NOT_FOUND, "PARENT_NOT_FOUND");
    }

    const existing = await tx.childParent.findUnique({
      where: {
        childId_parentId: { childId, parentId }
      }
    });

    if (existing && existing.endDate === null) {
      fail(
        "This child-parent relationship is already active",
        HTTP_STATUS.CONFLICT,
        "CHILD_PARENT_EXISTS"
      );
    }

    if (existing) {
      return tx.childParent.update({
        where: { id: existing.id },
        data: {
          relation,
          startDate: new Date(),
          endDate: null
        },
        include: { child: true, parent: true }
      });
    }

    return tx.childParent.create({
      data: { childId, parentId, relation },
      include: { child: true, parent: true }
    });
  });
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
    fail("Relationship already ended", HTTP_STATUS.CONFLICT, "RELATIONSHIP_ALREADY_ENDED");
  }

  const result = await prisma.childParent.updateMany({
    where: { id, endDate: null },
    data: { endDate: new Date() }
  });

  if (result.count !== 1) {
    fail("Relationship has already changed", HTTP_STATUS.CONFLICT, "RELATIONSHIP_CONFLICT");
  }

  return prisma.childParent.findUnique({
    where: { id },
    include: { child: true, parent: true }
  });
}

module.exports = {
  createOrRestore,
  getById,
  getForChild,
  getForParent,
  complete
};
