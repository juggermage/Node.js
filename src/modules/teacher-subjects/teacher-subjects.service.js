const prisma = require("../../config/prisma");
const auditService = require("../audit/audit.service");
const AppError = require("../../utils/app-error");
const HTTP_STATUS = require("../../utils/http-status");

const MANAGEMENT_ROLES = ["ADMIN", "MANAGER"];

function fail(message, status, code) {
  throw new AppError(message, status, code);
}

function ensureReadAccess(user) {
  if (!user) {
    fail("Authentication required", HTTP_STATUS.UNAUTHORIZED, "UNAUTHORIZED");
  }

  if (!["ADMIN", "MANAGER", "TEACHER"].includes(user.role)) {
    fail(
      "You do not have permission to access teacher-subject assignments",
      HTTP_STATUS.FORBIDDEN,
      "FORBIDDEN"
    );
  }
}

function ensureManagementAccess(user) {
  if (!user || !MANAGEMENT_ROLES.includes(user.role)) {
    fail("You do not have permission to perform this action", HTTP_STATUS.FORBIDDEN, "FORBIDDEN");
  }
}

function assignmentInclude() {
  return {
    employee: true,
    subject: true
  };
}

function handlePrismaError(error) {
  if (error.code === "P2002") {
    fail(
      "Teacher is already assigned to this subject",
      HTTP_STATUS.CONFLICT,
      "TEACHER_SUBJECT_EXISTS"
    );
  }

  if (error.code === "P2025" || error.code === "P2003") {
    fail("Related record not found", HTTP_STATUS.NOT_FOUND, "RELATED_RECORD_NOT_FOUND");
  }

  throw error;
}

async function getAssignmentOrFail(id, tx = prisma) {
  const assignment = await tx.teacherSubject.findUnique({
    where: { id },
    include: assignmentInclude()
  });

  if (!assignment) {
    fail("Teacher-subject assignment not found", HTTP_STATUS.NOT_FOUND, "ASSIGNMENT_NOT_FOUND");
  }

  return assignment;
}

async function ensureAssignmentAccess(assignment, user) {
  ensureReadAccess(user);

  if (MANAGEMENT_ROLES.includes(user.role)) {
    return assignment;
  }

  if (assignment.employee.userId !== user.id) {
    fail(
      "You do not have permission to access this assignment",
      HTTP_STATUS.FORBIDDEN,
      "FORBIDDEN"
    );
  }

  return assignment;
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

  return prisma.teacherSubject.findMany({
    where,
    include: assignmentInclude(),
    orderBy: {
      subject: {
        name: "asc"
      }
    }
  });
}

async function create({ employeeId, subjectId }, user) {
  ensureManagementAccess(user);

  try {
    return await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({
        where: { id: employeeId }
      });

      if (!employee || employee.status !== "ACTIVE") {
        fail("Active employee not found", HTTP_STATUS.NOT_FOUND, "EMPLOYEE_NOT_FOUND");
      }

      if (employee.role !== "TEACHER") {
        fail("Employee must have TEACHER role", HTTP_STATUS.CONFLICT, "INVALID_EMPLOYEE_ROLE");
      }

      const subject = await tx.subject.findUnique({
        where: { id: subjectId }
      });

      if (!subject || subject.status !== "ACTIVE") {
        fail("Active subject not found", HTTP_STATUS.NOT_FOUND, "SUBJECT_NOT_FOUND");
      }

      const existing = await tx.teacherSubject.findUnique({
        where: {
          employeeId_subjectId: {
            employeeId,
            subjectId
          }
        }
      });

      if (existing) {
        fail(
          "Teacher is already assigned to this subject",
          HTTP_STATUS.CONFLICT,
          "TEACHER_SUBJECT_EXISTS"
        );
      }

      const assignment = await tx.teacherSubject.create({
        data: {
          employeeId,
          subjectId
        },
        include: assignmentInclude()
      });

      await auditService.createLog(
        {
          actorId: user.id,
          action: "CREATE",
          entityType: "TeacherSubject",
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

async function getTeacherSubjects(employeeId, user) {
  ensureReadAccess(user);

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId }
  });

  if (!employee) {
    fail("Employee not found", HTTP_STATUS.NOT_FOUND, "EMPLOYEE_NOT_FOUND");
  }

  if (employee.role !== "TEACHER") {
    fail("Employee is not a teacher", HTTP_STATUS.CONFLICT, "INVALID_EMPLOYEE_ROLE");
  }

  if (!MANAGEMENT_ROLES.includes(user.role) && employee.userId !== user.id) {
    fail(
      "You do not have permission to access this teacher's subjects",
      HTTP_STATUS.FORBIDDEN,
      "FORBIDDEN"
    );
  }

  return prisma.teacherSubject.findMany({
    where: { employeeId },
    include: {
      subject: true
    },
    orderBy: {
      subject: {
        name: "asc"
      }
    }
  });
}

async function remove(id, user) {
  ensureManagementAccess(user);

  try {
    return await prisma.$transaction(async (tx) => {
      const before = await getAssignmentOrFail(id, tx);

      const deleted = await tx.teacherSubject.delete({
        where: { id },
        include: assignmentInclude()
      });

      await auditService.createLog(
        {
          actorId: user.id,
          action: "DELETE",
          entityType: "TeacherSubject",
          entityId: id,
          before,
          after: deleted
        },
        tx
      );

      return deleted;
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    handlePrismaError(error);
  }
}

module.exports = {
  getAll,
  create,
  getTeacherSubjects,
  remove
};
