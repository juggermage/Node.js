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

function ensureReadAccess(user) {
  if (!user) {
    fail("Authentication required", HTTP_STATUS.UNAUTHORIZED, "UNAUTHORIZED");
  }

  if (!MANAGEMENT_ROLES.includes(user.role) && !EMPLOYEE_ROLES.includes(user.role)) {
    fail(
      "You do not have permission to access staff assignments",
      HTTP_STATUS.FORBIDDEN,
      "FORBIDDEN"
    );
  }
}

function assignmentInclude() {
  return {
    employee: true,
    group: true
  };
}

async function getAssignmentOrFail(id, tx = prisma) {
  const assignment = await tx.staffAssignment.findUnique({
    where: { id },
    include: assignmentInclude()
  });

  if (!assignment) {
    fail("Staff assignment not found", HTTP_STATUS.NOT_FOUND, "STAFF_ASSIGNMENT_NOT_FOUND");
  }

  return assignment;
}

function handlePrismaError(error) {
  if (error.code === "P2002") {
    fail("This staff assignment already exists", HTTP_STATUS.CONFLICT, "ASSIGNMENT_ALREADY_EXISTS");
  }

  if (error.code === "P2025" || error.code === "P2003") {
    fail("Related record not found", HTTP_STATUS.NOT_FOUND, "RELATED_RECORD_NOT_FOUND");
  }

  throw error;
}

async function getAll(user) {
  ensureReadAccess(user);

  const where = MANAGEMENT_ROLES.includes(user.role)
    ? {}
    : {
        employee: {
          userId: user.id
        }
      };

  return prisma.staffAssignment.findMany({
    where,
    include: assignmentInclude(),
    orderBy: { startDate: "desc" }
  });
}

async function create({ employeeId, groupId, role }, user) {
  ensureManagementAccess(user);

  try {
    return await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({
        where: { id: employeeId }
      });

      if (!employee || employee.status !== "ACTIVE") {
        fail("Active employee not found", HTTP_STATUS.NOT_FOUND, "EMPLOYEE_NOT_FOUND");
      }

      if (!EMPLOYEE_ROLES.includes(role) || employee.role !== role) {
        fail(
          "Employee role does not match assignment",
          HTTP_STATUS.CONFLICT,
          "INVALID_EMPLOYEE_ROLE"
        );
      }

      const group = await tx.group.findUnique({
        where: { id: groupId }
      });

      if (!group || group.status !== "ACTIVE") {
        fail("Active group not found", HTTP_STATUS.NOT_FOUND, "GROUP_NOT_FOUND");
      }

      const employeeAssignment = await tx.staffAssignment.findFirst({
        where: {
          employeeId,
          endDate: null
        }
      });

      if (employeeAssignment) {
        fail(
          "Employee already has an active group assignment",
          HTTP_STATUS.CONFLICT,
          "EMPLOYEE_ALREADY_ASSIGNED"
        );
      }

      const roleAssignment = await tx.staffAssignment.findFirst({
        where: {
          groupId,
          role,
          endDate: null
        }
      });

      if (roleAssignment) {
        fail(
          "Group already has an active employee for this role",
          HTTP_STATUS.CONFLICT,
          "GROUP_ROLE_ALREADY_ASSIGNED"
        );
      }

      const assignment = await tx.staffAssignment.create({
        data: {
          employeeId,
          groupId,
          role,
          startDate: new Date()
        },
        include: assignmentInclude()
      });

      await auditService.createLog(
        {
          actorId: user.id,
          action: "CREATE",
          entityType: "StaffAssignment",
          entityId: assignment.id,
          after: assignment
        },
        tx
      );

      return assignment;
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    handlePrismaError(error);
  }
}

async function complete(id, user) {
  ensureManagementAccess(user);

  return prisma.$transaction(async (tx) => {
    const before = await getAssignmentOrFail(id, tx);

    if (before.endDate !== null) {
      fail("Assignment already completed", HTTP_STATUS.CONFLICT, "ASSIGNMENT_ALREADY_COMPLETED");
    }

    const updated = await tx.staffAssignment.update({
      where: { id },
      data: {
        endDate: new Date()
      },
      include: assignmentInclude()
    });

    await auditService.createLog(
      {
        actorId: user.id,
        action: "UPDATE",
        entityType: "StaffAssignment",
        entityId: id,
        before,
        after: updated
      },
      tx
    );

    return updated;
  });
}

async function getGroupAssignments(groupId, user) {
  ensureReadAccess(user);

  const group = await prisma.group.findUnique({
    where: { id: groupId }
  });

  if (!group) {
    fail("Group not found", HTTP_STATUS.NOT_FOUND, "GROUP_NOT_FOUND");
  }

  if (!MANAGEMENT_ROLES.includes(user.role)) {
    const ownAssignment = await prisma.staffAssignment.findFirst({
      where: {
        groupId,
        employee: {
          userId: user.id
        },
        endDate: null
      }
    });

    if (!ownAssignment) {
      fail(
        "You do not have permission to access this group's assignments",
        HTTP_STATUS.FORBIDDEN,
        "FORBIDDEN"
      );
    }
  }

  return prisma.staffAssignment.findMany({
    where: {
      groupId,
      ...(!MANAGEMENT_ROLES.includes(user.role) && {
        endDate: null
      })
    },
    include: {
      employee: true
    },
    orderBy: { startDate: "desc" }
  });
}

async function getEmployeeAssignments(employeeId, user) {
  ensureReadAccess(user);

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId }
  });

  if (!employee) {
    fail("Employee not found", HTTP_STATUS.NOT_FOUND, "EMPLOYEE_NOT_FOUND");
  }

  if (!MANAGEMENT_ROLES.includes(user.role) && employee.userId !== user.id) {
    fail(
      "You do not have permission to access this employee's assignments",
      HTTP_STATUS.FORBIDDEN,
      "FORBIDDEN"
    );
  }

  return prisma.staffAssignment.findMany({
    where: { employeeId },
    include: {
      group: true
    },
    orderBy: { startDate: "desc" }
  });
}

module.exports = {
  getAll,
  create,
  complete,
  getGroupAssignments,
  getEmployeeAssignments
};
