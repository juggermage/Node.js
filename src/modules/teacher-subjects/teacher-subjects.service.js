const prisma = require("../../config/prisma");
const AppError = require("../../utils/app-error");
const  HTTP_STATUS  = require("../../utils/http-status");

function fail(message, status, code) {
  throw new AppError(message, status, code);
}

async function getAll() {
  return prisma.teacherSubject.findMany({
    include: {
      employee: true,
      subject: true
    }
  });
}

async function create({ employeeId, subjectId }) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId }
  });

  if (!employee || employee.status !== "ACTIVE") {
    fail("Active employee not found", HTTP_STATUS.NOT_FOUND, "EMPLOYEE_NOT_FOUND");
  }

  if (employee.role !== "TEACHER") {
    fail("Employee must have TEACHER role", HTTP_STATUS.CONFLICT, "INVALID_EMPLOYEE_ROLE");
  }

  const subject = await prisma.subject.findUnique({
    where: { id: subjectId }
  });

  if (!subject || subject.status !== "ACTIVE") {
    fail("Active subject not found", HTTP_STATUS.NOT_FOUND, "SUBJECT_NOT_FOUND");
  }

  const existing = await prisma.teacherSubject.findFirst({
    where: {
      employeeId,
      subjectId
    }
  });

  if (existing) {
    fail(
      "Teacher is already assigned to this subject",
      HTTP_STATUS.CONFLICT,
      "TEACHER_SUBJECT_EXISTS"
    );
  }

  try {
    return await prisma.teacherSubject.create({
      data: {
        employeeId,
        subjectId
      },
      include: {
        employee: true,
        subject: true
      }
    });
  } catch (error) {
    if (error.code === "P2002") {
      fail(
        "Teacher-subject assignment already exists",
        HTTP_STATUS.CONFLICT,
        "TEACHER_SUBJECT_EXISTS"
      );
    }

    throw error;
  }
}

async function getTeacherSubjects(employeeId) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId }
  });

  if (!employee) {
    fail("Employee not found", HTTP_STATUS.NOT_FOUND, "EMPLOYEE_NOT_FOUND");
  }

  return prisma.teacherSubject.findMany({
    where: { employeeId },
    include: { subject: true }
  });
}

async function remove(id) {
  const assignment = await prisma.teacherSubject.findUnique({
    where: { id }
  });

  if (!assignment) {
    fail("Assignment not found", HTTP_STATUS.NOT_FOUND, "ASSIGNMENT_NOT_FOUND");
  }

  return prisma.teacherSubject.delete({
    where: { id }
  });
}

module.exports = {
  getAll,
  create,
  getTeacherSubjects,
  remove
};
