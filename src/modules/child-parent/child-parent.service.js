
const prisma = require("../../config/prisma");
const auditService = require("../audit/audit.service");
const AppError = require("../../utils/app-error");
const HTTP_STATUS = require("../../utils/http-status");

const MANAGEMENT_ROLES = ["ADMIN", "MANAGER"];
const EMPLOYEE_ROLES = ["TEACHER", "EDUCATOR", "ASSISTANT"];

function fail(message, status, code) {
  throw new AppError(message, status, code);
}

function ensureManagementAccess(user) {
  if (!user || !MANAGEMENT_ROLES.includes(user.role)) {
    fail("You do not have permission to perform this action", HTTP_STATUS.FORBIDDEN, "FORBIDDEN");
  }
}

function getActiveRelationFilter(includeEnded = false) {
  if (includeEnded) {
    return {};
  }

  return {
    OR: [{ endDate: null }, { endDate: { isSet: false } }]
  };
}

function getReadAccessFilter(user) {
  if (!user) {
    fail("Authentication required", HTTP_STATUS.UNAUTHORIZED, "UNAUTHORIZED");
  }

  if (MANAGEMENT_ROLES.includes(user.role)) {
    return {};
  }

  if (user.role === "PARENT") {
    return {
      parent: {
        userId: user.id
      }
    };
  }

  if (EMPLOYEE_ROLES.includes(user.role)) {
    return {
      child: {
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
      }
    };
  }

  fail("You do not have permission to access this resource", HTTP_STATUS.FORBIDDEN, "FORBIDDEN");
}

function handlePrismaError(error) {
  if (error.code === "P2003" || error.code === "P2025") {
    fail("Child or parent not found", HTTP_STATUS.NOT_FOUND, "RELATED_RECORD_NOT_FOUND");
  }

  if (error.code === "P2002") {
    fail(
      "This child-parent relationship already exists",
      HTTP_STATUS.CONFLICT,
      "CHILD_PARENT_EXISTS"
    );
  }

  throw error;
}

async function getLinkOrFail(id, tx = prisma) {
  const link = await tx.childParent.findUnique({
    where: { id },
    include: {
      child: true,
      parent: true
    }
  });

  if (!link) {
    fail("Relationship not found", HTTP_STATUS.NOT_FOUND, "CHILD_PARENT_NOT_FOUND");
  }

  return link;
}

async function ensureLinkAccess(id, user, tx = prisma) {
  const accessFilter = getReadAccessFilter(user);

  const link = await tx.childParent.findFirst({
    where: {
      id,
      ...accessFilter
    },
    include: {
      child: true,
      parent: true
    }
  });

  if (!link) {
    fail("Relationship not found", HTTP_STATUS.NOT_FOUND, "CHILD_PARENT_NOT_FOUND");
  }

  return link;
}

async function createOrRestore({ childId, parentId, relation }, user) {
  ensureManagementAccess(user);

  try {
    return await prisma.$transaction(async (tx) => {
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

      let link;
      let action;

      if (existing) {
        link = await tx.childParent.update({
          where: { id: existing.id },
          data: {
            relation,
            startDate: new Date(),
            endDate: null
          },
          include: {
            child: true,
            parent: true
          }
        });

        action = "RESTORE";
      } else {
        link = await tx.childParent.create({
          data: {
            childId,
            parentId,
            relation
          },
          include: {
            child: true,
            parent: true
          }
        });

        action = "CREATE";
      }

      await auditService.createLog(
        {
          actorId: user.id,
          action,
          entityType: "ChildParent",
          entityId: link.id,
          before: existing,
          after: link
        },
        tx
      );

      return link;
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    handlePrismaError(error);
  }
}

async function getById(id, user) {
  return ensureLinkAccess(id, user);
}

async function getAll({ search, includeEnded = false } = {}, user) {
  const accessFilter = getReadAccessFilter(user);
  const where = {
    ...accessFilter,
    ...getActiveRelationFilter(includeEnded)
  };

  if (search && search.trim()) {
    const query = search.trim();
    where.AND = [
      {
        OR: [
          { child: { firstName: { contains: query, mode: "insensitive" } } },
          { child: { lastName: { contains: query, mode: "insensitive" } } },
          { child: { childCode: { contains: query, mode: "insensitive" } } },
          { parent: { firstName: { contains: query, mode: "insensitive" } } },
          { parent: { lastName: { contains: query, mode: "insensitive" } } },
          { parent: { phone: { contains: query } } },
          { parent: { email: { contains: query, mode: "insensitive" } } }
        ]
      }
    ];
  }

  return prisma.childParent.findMany({
    where,
    include: { child: true, parent: true },
    orderBy: [{ startDate: "desc" }, { id: "asc" }]
  });
}

async function getForChild(childId, includeEnded = false, user) {
  const accessFilter = getReadAccessFilter(user);

  const child = await prisma.child.findFirst({
    where: {
      id: childId,
      ...(user.role === "PARENT"
        ? {
            parents: {
              some: {
                parent: { userId: user.id },
                endDate: null
              }
            }
          }
        : {}),
      ...(EMPLOYEE_ROLES.includes(user.role)
        ? {
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
          }
        : {})
    }
  });

  if (!child) {
    fail("Child not found", HTTP_STATUS.NOT_FOUND, "CHILD_NOT_FOUND");
  }

  return prisma.childParent.findMany({
    where: {
      childId,
      ...getActiveRelationFilter(includeEnded),
      ...accessFilter
    },
    include: {
      parent: true
    },
    orderBy: {
      startDate: "desc"
    }
  });
}

async function getForParent(parentId, includeEnded = false, user) {
  getReadAccessFilter(user);

  if (user.role === "PARENT") {
    const ownParent = await prisma.parent.findFirst({
      where: {
        userId: user.id,
        status: { not: "ARCHIVED" }
      }
    });

    if (!ownParent || ownParent.id !== parentId) {
      fail("You do not have permission to access this parent", HTTP_STATUS.FORBIDDEN, "FORBIDDEN");
    }
  }

  if (EMPLOYEE_ROLES.includes(user.role)) {
    const parent = await prisma.parent.findUnique({
      where: { id: parentId }
    });

    if (!parent) {
      fail("Parent not found", HTTP_STATUS.NOT_FOUND, "PARENT_NOT_FOUND");
    }

    const accessibleLinks = await prisma.childParent.findMany({
      where: {
        parentId,
        child: {
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
        }
      },
      select: { id: true }
    });

    const ids = accessibleLinks.map((link) => link.id);

    return prisma.childParent.findMany({
      where: {
        id: { in: ids },
        ...getActiveRelationFilter(includeEnded)
      },
      include: {
        child: true
      },
      orderBy: {
        startDate: "desc"
      }
    });
  }

  return prisma.childParent.findMany({
    where: {
      parentId,
      ...getActiveRelationFilter(includeEnded)
    },
    include: {
      child: true
    },
    orderBy: {
      startDate: "desc"
    }
  });
}

async function update(id, data, user) {
  ensureManagementAccess(user);
  try {
    return await prisma.$transaction(async (tx) => {
      const before = await getLinkOrFail(id, tx);
      if (before.endDate !== null) {
        fail("Cannot edit an ended relationship", HTTP_STATUS.CONFLICT, "RELATIONSHIP_ALREADY_ENDED");
      }
      const link = await tx.childParent.update({
        where: { id },
        data: { relation: data.relation },
        include: { child: true, parent: true }
      });
      await auditService.createLog({
        actorId: user.id,
        action: "UPDATE",
        entityType: "ChildParent",
        entityId: link.id,
        before,
        after: link
      }, tx);
      return link;
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    handlePrismaError(error);
  }
}

async function complete(id, user) {
  ensureManagementAccess(user);

  try {
    return await prisma.$transaction(async (tx) => {
      const before = await getLinkOrFail(id, tx);

      if (before.endDate !== null) {
        fail("Relationship already ended", HTTP_STATUS.CONFLICT, "RELATIONSHIP_ALREADY_ENDED");
      }

      const link = await tx.childParent.update({
        where: { id },
        data: {
          endDate: new Date()
        },
        include: {
          child: true,
          parent: true
        }
      });

      await auditService.createLog(
        {
          actorId: user.id,
          action: "CANCEL",
          entityType: "ChildParent",
          entityId: link.id,
          before,
          after: link
        },
        tx
      );

      return link;
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    handlePrismaError(error);
  }
}

module.exports = {
  createOrRestore,
  getById,
  getAll,
  getForChild,
  getForParent,
  update,
  complete
};
