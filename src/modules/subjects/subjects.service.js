const prisma = require("../../config/prisma");
const auditService = require("../audit/audit.service");
const AppError = require("../../utils/app-error");
const HTTP_STATUS = require("../../utils/http-status");

const MANAGEMENT_ROLES = ["ADMIN", "MANAGER"];
const EMPLOYEE_ROLES = ["TEACHER", "EDUCATOR", "ASSISTANT"];

function fail(message, status, code) {
  throw new AppError(message, status, code);
}

function ensureReadAccess(user) {
  if (!user) {
    fail("Authentication required", HTTP_STATUS.UNAUTHORIZED, "UNAUTHORIZED");
  }

  if (!MANAGEMENT_ROLES.includes(user.role) && !EMPLOYEE_ROLES.includes(user.role)) {
    fail("You do not have permission to access subjects", HTTP_STATUS.FORBIDDEN, "FORBIDDEN");
  }
}

function ensureManagementAccess(user) {
  if (!user || !MANAGEMENT_ROLES.includes(user.role)) {
    fail("You do not have permission to perform this action", HTTP_STATUS.FORBIDDEN, "FORBIDDEN");
  }
}

async function getSubjectOrFail(id, tx = prisma) {
  const subject = await tx.subject.findUnique({
    where: { id }
  });

  if (!subject || subject.status === "ARCHIVED") {
    fail("Subject not found", HTTP_STATUS.NOT_FOUND, "SUBJECT_NOT_FOUND");
  }

  return subject;
}

async function checkUniqueName(name, excludeId, tx = prisma) {
  const subject = await tx.subject.findFirst({
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

  if (subject) {
    fail("Subject name already exists", HTTP_STATUS.CONFLICT, "SUBJECT_NAME_EXISTS");
  }
}

function handlePrismaError(error) {
  if (error.code === "P2002") {
    fail("Subject name already exists", HTTP_STATUS.CONFLICT, "SUBJECT_NAME_EXISTS");
  }

  if (error.code === "P2025" || error.code === "P2003") {
    fail("Related record not found", HTTP_STATUS.NOT_FOUND, "RELATED_RECORD_NOT_FOUND");
  }

  throw error;
}

async function getAll(query = {}, user) {
  ensureReadAccess(user);

  const where = {
    status: MANAGEMENT_ROLES.includes(user.role) ? query.status || { not: "ARCHIVED" } : "ACTIVE"
  };

  if (query.search) {
    where.name = {
      contains: query.search.trim(),
      mode: "insensitive"
    };
  }

  return prisma.subject.findMany({
    where,
    orderBy: { name: "asc" }
  });
}

async function getById(id, user) {
  ensureReadAccess(user);

  const subject = await prisma.subject.findFirst({
    where: {
      id,
      status: MANAGEMENT_ROLES.includes(user.role) ? { not: "ARCHIVED" } : "ACTIVE"
    }
  });

  if (!subject) {
    fail("Subject not found", HTTP_STATUS.NOT_FOUND, "SUBJECT_NOT_FOUND");
  }

  return subject;
}

async function create(data, user) {
  ensureManagementAccess(user);

  try {
    return await prisma.$transaction(async (tx) => {
      await checkUniqueName(data.name, null, tx);

      const subject = await tx.subject.create({
        data: {
          name: data.name.trim(),
          description: data.description ?? null,
          status: "ACTIVE"
        }
      });

      await auditService.createLog(
        {
          actorId: user.id,
          action: "CREATE",
          entityType: "Subject",
          entityId: subject.id,
          after: subject
        },
        tx
      );

      return subject;
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    handlePrismaError(error);
  }
}

async function update(id, data, user) {
  ensureManagementAccess(user);

  try {
    return await prisma.$transaction(async (tx) => {
      const before = await getSubjectOrFail(id, tx);

      if (data.name !== undefined) {
        await checkUniqueName(data.name, id, tx);
      }

      const updated = await tx.subject.update({
        where: { id },
        data: {
          ...(data.name !== undefined && {
            name: data.name.trim()
          }),
          ...(data.description !== undefined && {
            description: data.description
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
          entityType: "Subject",
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
    handlePrismaError(error);
  }
}

async function remove(id, user) {
  ensureManagementAccess(user);

  return prisma.$transaction(async (tx) => {
    const before = await getSubjectOrFail(id, tx);

    const activeAssignments = await tx.teacherSubject.count({
      where: {
        subjectId: id,
        employee: {
          status: "ACTIVE"
        }
      }
    });

    if (activeAssignments > 0) {
      fail("Subject has assigned active teachers", HTTP_STATUS.CONFLICT, "SUBJECT_HAS_TEACHERS");
    }

    const archived = await tx.subject.update({
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
        entityType: "Subject",
        entityId: id,
        before,
        after: archived
      },
      tx
    );

    return archived;
  });
}

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove
};
