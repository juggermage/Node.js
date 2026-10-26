const prisma = require("../../config/prisma");
const AppError = require("../../utils/AppError");
const { HTTP_STATUS } = require("../../utils/http-status");

function fail(message, status, code) {
  throw new AppError(message, status, code);
}

async function getAll() {
  return prisma.staffAssignment.findMany({
    include: {
      employee: true,
      group: true
    },
    orderBy: { startDate: "desc" }
  });
}

async function create({ employeeId, groupId, role }) {
  return prisma.$transaction(async (tx) => {
    const employee = await tx.employee.findUnique({
      where: { id: employeeId }
    });

    if (!employee || employee.status !== "ACTIVE") {
      fail("Active employee not found", HTTP_STATUS.NOT_FOUND, "EMPLOYEE_NOT_FOUND");
    }

    if (employee.role !== role) {
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

    return tx.staffAssignment.create({
      data: {
        employeeId,
        groupId,
        role,
        startDate: new Date()
      },
      include: {
        employee: true,
        group: true
      }
    });
  });
}

async function complete(id) {
  const assignment = await prisma.staffAssignment.findUnique({
    where: { id }
  });

  if (!assignment) {
    fail("Staff assignment not found", HTTP_STATUS.NOT_FOUND, "STAFF_ASSIGNMENT_NOT_FOUND");
  }

  if (assignment.endDate !== null) {
    fail("Assignment already completed", HTTP_STATUS.CONFLICT, "ASSIGNMENT_ALREADY_COMPLETED");
  }

  const result = await prisma.staffAssignment.updateMany({
    where: {
      id,
      endDate: null
    },
    data: {
      endDate: new Date()
    }
  });

  if (result.count !== 1) {
    fail("Assignment has already changed", HTTP_STATUS.CONFLICT, "ASSIGNMENT_CONFLICT");
  }

  return prisma.staffAssignment.findUnique({
    where: { id },
    include: {
      employee: true,
      group: true
    }
  });
}

async function getGroupAssignments(groupId) {
  const group = await prisma.group.findUnique({
    where: { id: groupId }
  });

  if (!group) {
    fail("Group not found", HTTP_STATUS.NOT_FOUND, "GROUP_NOT_FOUND");
  }

  return prisma.staffAssignment.findMany({
    where: { groupId },
    include: { employee: true },
    orderBy: { startDate: "desc" }
  });
}

async function getEmployeeAssignments(employeeId) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId }
  });

  if (!employee) {
    fail("Employee not found", HTTP_STATUS.NOT_FOUND, "EMPLOYEE_NOT_FOUND");
  }

  return prisma.staffAssignment.findMany({
    where: { employeeId },
    include: { group: true },
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
