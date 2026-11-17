const { randomUUID } = require("node:crypto");

const prisma = require("../../config/prisma");
const auditService = require("../audit/audit.service");
const AppError = require("../../utils/app-error");
const HTTP_STATUS = require("../../utils/http-status");

const MANAGEMENT_ROLES = ["ADMIN", "MANAGER"];

const EMPLOYEE_ROLES = ["TEACHER", "EDUCATOR", "ASSISTANT"];

function normalizeData(data) {
  const result = { ...data };

  if (result.birthDate !== undefined) {
    result.birthDate = new Date(`${result.birthDate}T00:00:00.000Z`);
  }

  return result;
}

function getAccessFilter(user) {
  if (!user) {
    throw new AppError("Authentication required", HTTP_STATUS.UNAUTHORIZED, "UNAUTHORIZED");
  }

  if (MANAGEMENT_ROLES.includes(user.role)) {
    return {};
  }

  if (user.role === "PARENT") {
    return {
      parents: {
        some: {
          parent: {
            userId: user.id,
            status: "ACTIVE"
          },
          endDate: null
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
            status: "ACTIVE",
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

  throw new AppError(
    "You do not have permission to access children",
    HTTP_STATUS.FORBIDDEN,
    "FORBIDDEN"
  );
}

function ensureManagementAccess(user) {
  if (!user || !MANAGEMENT_ROLES.includes(user.role)) {
    throw new AppError(
      "You do not have permission to perform this action",
      HTTP_STATUS.FORBIDDEN,
      "FORBIDDEN"
    );
  }
}

function buildSearchFilter(search) {
  if (!search || !search.trim()) {
    return {};
  }

  const query = search.trim();
  const parts = query.split(/\s+/);
  const codeFilter = {
    childCode: {
      contains: query,
      mode: "insensitive"
    }
  };

  if (parts.length === 2) {
    return {
      OR: [
        codeFilter,
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
      ]
    };
  }

  return {
    OR: [
      codeFilter,
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
    ]
  };
}

async function getAll(filters = {}, user) {
  const { search, status, page = 1, limit = 20 } = filters;

  const accessFilter = getAccessFilter(user);

  const where = {
    AND: [
      accessFilter,
      {
        status: status || { not: "ARCHIVED" }
      },
      buildSearchFilter(search)
    ]
  };

  const skip = (page - 1) * limit;

  const [items, total] = await prisma.$transaction([
    prisma.child.findMany({
      where,
      orderBy: {
        createdAt: "desc"
      },
      skip,
      take: limit,
      include: {
        parents: {
          where: {
            endDate: null
          },
          include: {
            parent: true
          }
        },
        enrollments: {
          where: {
            OR: [{ endDate: null }, { endDate: { isSet: false } }]
          },
          include: {
            group: true
          }
        },
        discounts: {
          where: { OR: [{ validTo: null }, { validTo: { gte: new Date() } }] },
          include: { discount: true }
        }
      }
    }),
    prisma.child.count({ where })
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
  const accessFilter = getAccessFilter(user);

  const child = await prisma.child.findFirst({
    where: {
      AND: [{ id }, accessFilter, { status: { not: "ARCHIVED" } }]
    },
    include: {
      parents: {
        where: {
          endDate: null
        },
        include: {
          parent: true
        }
      },
      enrollments: {
        orderBy: {
          startDate: "desc"
        },
        include: {
          group: true
        }
      },
      discounts: {
        where: { OR: [{ validTo: null }, { validTo: { gte: new Date() } }] },
        include: { discount: true }
      }
    }
  });

  if (!child) {
    throw new AppError("Child not found", HTTP_STATUS.NOT_FOUND, "CHILD_NOT_FOUND");
  }

  return child;
}

async function create(data, user) {
  ensureManagementAccess(user);

  return prisma.$transaction(async (tx) => {
    const child = await tx.child.create({
      data: {
        ...normalizeData(data),
        childCode: randomUUID()
      }
    });

    await auditService.createLog(
      {
        actorId: user.id,
        action: "CREATE",
        entityType: "Child",
        entityId: child.id,
        after: child
      },
      tx
    );

    return child;
  });
}

async function update(id, data, user) {
  ensureManagementAccess(user);

  return prisma.$transaction(async (tx) => {
    const before = await tx.child.findFirst({
      where: {
        id,
        status: { not: "ARCHIVED" }
      }
    });

    if (!before) {
      throw new AppError("Child not found", HTTP_STATUS.NOT_FOUND, "CHILD_NOT_FOUND");
    }

    const child = await tx.child.update({
      where: { id },
      data: normalizeData(data)
    });

    await auditService.createLog(
      {
        actorId: user.id,
        action: "UPDATE",
        entityType: "Child",
        entityId: child.id,
        before,
        after: child
      },
      tx
    );

    return child;
  });
}

async function setDiscount(id, { discountId, annualDiscountId }, user) {
  ensureManagementAccess(user);

  return prisma.$transaction(async (tx) => {
    const child = await tx.child.findFirst({ where: { id, status: { not: "ARCHIVED" } } });
    if (!child) {
      throw new AppError("Child not found", HTTP_STATUS.NOT_FOUND, "CHILD_NOT_FOUND");
    }

    const today = new Date();
    const validFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const previousDay = new Date(validFrom.getTime() - 86400000);
    const currentAssignments = await tx.childDiscount.findMany({
      where: { childId: id, OR: [{ validTo: null }, { validTo: { gte: validFrom } }] },
      include: { discount: true }
    });

    for (const assignment of currentAssignments) {
      if (assignment.validFrom >= validFrom) {
        await tx.childDiscount.delete({ where: { id: assignment.id } });
      } else {
        await tx.childDiscount.update({ where: { id: assignment.id }, data: { validTo: previousDay } });
      }
    }

    const assignments = [];
    const selections = [
      { id: discountId, allowed: [10, 20, 30], label: "regular" },
      { id: annualDiscountId, allowed: [12], label: "annual" }
    ];

    for (const selection of selections) {
      if (!selection.id) continue;
      const discount = await tx.discount.findFirst({
        where: {
          id: selection.id,
          isActive: true,
          type: "PERCENTAGE",
          percentage: { in: selection.allowed }
        }
      });
      if (!discount) {
        throw new AppError("Selected discount not found or has an invalid percentage", HTTP_STATUS.NOT_FOUND, "DISCOUNT_NOT_FOUND");
      }
      assignments.push(await tx.childDiscount.create({
        data: { childId: id, discountId: discount.id, validFrom },
        include: { discount: true }
      }));
    }

    await auditService.createLog({
      actorId: user.id,
      action: "UPDATE",
      entityType: "ChildDiscount",
      entityId: id,
      before: currentAssignments,
      after: assignments
    }, tx);

    return assignments;
  });
}

async function remove(id, user) {
  ensureManagementAccess(user);

  return prisma.$transaction(async (tx) => {
    const before = await tx.child.findFirst({
      where: {
        id,
        status: { not: "ARCHIVED" }
      }
    });

    if (!before) {
      throw new AppError("Child not found", HTTP_STATUS.NOT_FOUND, "CHILD_NOT_FOUND");
    }

    const child = await tx.child.update({
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
        entityType: "Child",
        entityId: child.id,
        before,
        after: child
      },
      tx
    );
  });
}

module.exports = {
  buildSearchFilter,
  getAll,
  getById,
  create,
  update,
  setDiscount,
  remove
};
