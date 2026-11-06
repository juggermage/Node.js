
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
    fail(
      "You do not have permission to perform this action",
      HTTP_STATUS.FORBIDDEN,
      "FORBIDDEN"
    );
  }
}

function ensureReadAccess(user) {
  if (!user) {
    fail(
      "Authentication required",
      HTTP_STATUS.UNAUTHORIZED,
      "UNAUTHORIZED"
    );
  }

  if (
    !MANAGEMENT_ROLES.includes(user.role) &&
    !EMPLOYEE_ROLES.includes(user.role)
  ) {
    fail(
      "You do not have permission to access employees",
      HTTP_STATUS.FORBIDDEN,
      "FORBIDDEN"
    );
  }
}

function employeeInclude() {
  return {
    user: {
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true
      }
    }
  };
}

async function getEmployeeOrFail(id, tx = prisma) {
  const employee = await tx.employee.findUnique({
    where: { id },
    include: employeeInclude()
  });

  if (!employee || employee.status === "ARCHIVED") {
    fail(
      "Employee not found",
      HTTP_STATUS.NOT_FOUND,
      "EMPLOYEE_NOT_FOUND"
    );
  }

  return employee;
}

async function ensureEmployeeAccess(id, user, tx = prisma) {
  ensureReadAccess(user);

  if (MANAGEMENT_ROLES.includes(user.role)) {
    return getEmployeeOrFail(id, tx);
  }

  const employee = await tx.employee.findFirst({
    where: {
      id,
      userId: user.id,
      status: { not: "ARCHIVED" }
    },
    include: employeeInclude()
  });

  if (!employee) {
    fail(
      "Employee not found",
      HTTP_STATUS.NOT_FOUND,
      "EMPLOYEE_NOT_FOUND"
    );
  }

  return employee;
}

async function checkEmployeeCode(code, excludeId, tx = prisma) {
  const existing = await tx.employee.findUnique({
    where: { employeeCode: code }
  });

  if (existing && existing.id !== excludeId) {
    fail(
      "Employee code already exists",
      HTTP_STATUS.CONFLICT,
      "EMPLOYEE_CODE_EXISTS"
    );
  }
}

async function ensureUserCanBeLinked(userId, role, excludeEmployeeId, tx) {
  if (userId === null || userId === undefined) return;

  const account = await tx.user.findUnique({
    where: { id: userId }
  });

  if (!account) {
    fail(
      "User account not found",
      HTTP_STATUS.NOT_FOUND,
      "USER_NOT_FOUND"
    );
  }

  if (account.role !== role) {
    fail(
      "User role must match employee role",
      HTTP_STATUS.CONFLICT,
      "USER_ROLE_MISMATCH"
    );
  }

  const linkedEmployee = await tx.employee.findFirst({
    where: {
      userId,
      ...(excludeEmployeeId && {
        id: { not: excludeEmployeeId }
      })
    }
  });

  if (linkedEmployee) {
    fail(
      "User account is already linked to another employee",
      HTTP_STATUS.CONFLICT,
      "USER_ALREADY_LINKED"
    );
  }
}

function handlePrismaError(error) {
  if (error.code === "P2002") {
    fail(
      "Employee code or user link already exists",
      HTTP_STATUS.CONFLICT,
      "EMPLOYEE_ALREADY_EXISTS"
    );
  }

  if (error.code === "P2025" || error.code === "P2003") {
    fail(
      "Related record not found",
      HTTP_STATUS.NOT_FOUND,
      "RELATED_RECORD_NOT_FOUND"
    );
  }

  throw error;
}

async function getAll(query = {}, user) {
  ensureReadAccess(user);

  const where = {
    status: MANAGEMENT_ROLES.includes(user.role)
      ? query.status || { not: "ARCHIVED" }
      : "ACTIVE"
  };

  if (EMPLOYEE_ROLES.includes(user.role)) {
    where.userId = user.id;
  }

  if (query.role && MANAGEMENT_ROLES.includes(user.role)) {
    where.role = query.role;
  }

  if (query.search && MANAGEMENT_ROLES.includes(user.role)) {
    const search = query.search.trim();

    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { employeeCode: { contains: search, mode: "insensitive" } }
    ];
  }

  return prisma.employee.findMany({
    where,
    include: employeeInclude(),
    orderBy: [
      { lastName: "asc" },
      { firstName: "asc" }
    ]
  });
}

async function getById(id, user) {
  return ensureEmployeeAccess(id, user);
}

async function create(data, user) {
  ensureManagementAccess(user);

  try {
    return await prisma.$transaction(async (tx) => {
      await checkEmployeeCode(data.employeeCode, null, tx);

      await ensureUserCanBeLinked(
        data.userId,
        data.role,
        null,
        tx
      );

      const employee = await tx.employee.create({
        data: {
          employeeCode: data.employeeCode.trim(),
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
          role: data.role,
          phone: data.phone || null,
          email: data.email || null,
          userId: data.userId || null,
          status: "ACTIVE"
        },
        include: employeeInclude()
      });

      if (employee.userId) {
        await tx.user.update({
          where: { id: employee.userId },
          data: { isActive: true }
        });
      }

      await auditService.createLog(
        {
          actorId: user.id,
          action: "CREATE",
          entityType: "Employee",
          entityId: employee.id,
          after: employee
        },
        tx
      );

      return employee;
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
      const employee = await getEmployeeOrFail(id, tx);

      if (data.employeeCode !== undefined) {
        await checkEmployeeCode(data.employeeCode, id, tx);
      }

      const newRole = data.role ?? employee.role;
      const newStatus = data.status ?? employee.status;
      const newUserId =
        data.userId !== undefined ? data.userId : employee.userId;

      const activeAssignments = await tx.staffAssignment.count({
        where: {
          employeeId: id,
          endDate: null
        }
      });

      if (
        activeAssignments > 0 &&
        (newRole !== employee.role || newStatus !== "ACTIVE")
      ) {
        fail(
          "Employee has active group assignments",
          HTTP_STATUS.CONFLICT,
          "EMPLOYEE_HAS_ASSIGNMENTS"
        );
      }

      const teachingAssignments = await tx.teacherSubject.count({
        where: { employeeId: id }
      });

      if (
        teachingAssignments > 0 &&
        (newRole !== "TEACHER" || newStatus !== "ACTIVE")
      ) {
        fail(
          "Employee has assigned subjects",
          HTTP_STATUS.CONFLICT,
          "EMPLOYEE_HAS_SUBJECTS"
        );
      }

      const activeScheduleItems = await tx.scheduleItem.count({
        where: {
          teacherId: id,
          status: "ACTIVE"
        }
      });

      if (
        activeScheduleItems > 0 &&
        (newRole !== "TEACHER" || newStatus !== "ACTIVE")
      ) {
        fail(
          "Employee has active scheduled lessons",
          HTTP_STATUS.CONFLICT,
          "EMPLOYEE_HAS_SCHEDULE_ITEMS"
        );
      }

      if (newUserId) {
        await ensureUserCanBeLinked(
          newUserId,
          newRole,
          id,
          tx
        );
      }

      const before = employee;

      const updated = await tx.employee.update({
        where: { id },
        data: {
          ...(data.employeeCode !== undefined && {
            employeeCode: data.employeeCode.trim()
          }),
          ...(data.firstName !== undefined && {
            firstName: data.firstName.trim()
          }),
          ...(data.lastName !== undefined && {
            lastName: data.lastName.trim()
          }),
          ...(data.role !== undefined && {
            role: data.role
          }),
          ...(data.phone !== undefined && {
            phone: data.phone || null
          }),
          ...(data.email !== undefined && {
            email: data.email || null
          }),
          ...(data.status !== undefined && {
            status: data.status
          }),
          ...(data.userId !== undefined && {
            userId: data.userId
          })
        },
        include: employeeInclude()
      });

      if (employee.userId && employee.userId !== updated.userId) {
        await tx.user.update({
          where: { id: employee.userId },
          data: { isActive: false }
        });
      }

      if (updated.userId) {
        await tx.user.update({
          where: { id: updated.userId },
          data: {
            role: updated.role,
            isActive: updated.status === "ACTIVE"
          }
        });
      }

      await auditService.createLog(
        {
          actorId: user.id,
          action: "UPDATE",
          entityType: "Employee",
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
    const employee = await getEmployeeOrFail(id, tx);

    const [staffCount, subjectCount, scheduleCount] = await Promise.all([
      tx.staffAssignment.count({
        where: {
          employeeId: id,
          endDate: null
        }
      }),
      tx.teacherSubject.count({
        where: { employeeId: id }
      }),
      tx.scheduleItem.count({
        where: {
          teacherId: id,
          status: "ACTIVE"
        }
      })
    ]);

    if (staffCount || subjectCount || scheduleCount) {
      fail(
        "Employee has active responsibilities",
        HTTP_STATUS.CONFLICT,
        "EMPLOYEE_HAS_RESPONSIBILITIES"
      );
    }

    const archived = await tx.employee.update({
      where: { id },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date()
      },
      include: employeeInclude()
    });

    if (employee.userId) {
      await tx.user.update({
        where: { id: employee.userId },
        data: { isActive: false }
      });
    }

    await auditService.createLog(
      {
        actorId: user.id,
        action: "ARCHIVE",
        entityType: "Employee",
        entityId: id,
        before: employee,
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
