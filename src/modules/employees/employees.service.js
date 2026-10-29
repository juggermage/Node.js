const prisma = require("../../config/prisma");
const AppError = require("../../utils/app-error");
const HTTP_STATUS = require("../../utils/http-status");

function fail(message, status, code) {
  throw new AppError(message, status, code);
}

async function getEmployeeOrFail(id) {
  const employee = await prisma.employee.findUnique({
    where: { id }
  });

  if (!employee || employee.status === "ARCHIVED") {
    fail("Employee not found", HTTP_STATUS.NOT_FOUND, "EMPLOYEE_NOT_FOUND");
  }

  return employee;
}

async function checkEmployeeCode(code, excludeId) {
  const existing = await prisma.employee.findUnique({
    where: { employeeCode: code }
  });

  if (existing && existing.id !== excludeId) {
    fail("Employee code already exists", HTTP_STATUS.CONFLICT, "EMPLOYEE_CODE_EXISTS");
  }
}

function handleUniqueError(error) {
  if (error.code === "P2002") {
    fail("Employee code already exists", HTTP_STATUS.CONFLICT, "EMPLOYEE_CODE_EXISTS");
  }

  throw error;
}

async function getAll(query = {}) {
  const where = {
    status: query.status || { not: "ARCHIVED" }
  };

  if (query.role) {
    where.role = query.role;
  }

  if (query.search) {
    const search = query.search.trim();

    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { employeeCode: { contains: search, mode: "insensitive" } }
    ];
  }

  return prisma.employee.findMany({
    where,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
  });
}

async function getById(id) {
  return getEmployeeOrFail(id);
}

async function create(data) {
  await checkEmployeeCode(data.employeeCode);

  try {
    return await prisma.employee.create({
      data: {
        employeeCode: data.employeeCode,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        phone: data.phone || null,
        email: data.email || null,
        status: "ACTIVE"
      }
    });
  } catch (error) {
    handleUniqueError(error);
  }
}

async function update(id, data) {
  const employee = await getEmployeeOrFail(id);

  if (data.employeeCode !== undefined) {
    await checkEmployeeCode(data.employeeCode, id);
  }

  const newRole = data.role ?? employee.role;
  const newStatus = data.status ?? employee.status;

  const activeAssignments = await prisma.staffAssignment.count({
    where: {
      employeeId: id,
      endDate: null
    }
  });

  if (activeAssignments > 0 && (newRole !== employee.role || newStatus !== "ACTIVE")) {
    fail("Employee has active group assignments", HTTP_STATUS.CONFLICT, "EMPLOYEE_HAS_ASSIGNMENTS");
  }

  const teachingAssignments = await prisma.teacherSubject.count({
    where: { employeeId: id }
  });

  if (teachingAssignments > 0 && (newRole !== "TEACHER" || newStatus !== "ACTIVE")) {
    fail("Employee has assigned subjects", HTTP_STATUS.CONFLICT, "EMPLOYEE_HAS_SUBJECTS");
  }

  const activeScheduleItems = await prisma.scheduleItem.count({
    where: {
      teacherId: id,
      status: "ACTIVE"
    }
  });

  if (activeScheduleItems > 0 && (newRole !== "TEACHER" || newStatus !== "ACTIVE")) {
    fail(
      "Employee has active scheduled lessons",
      HTTP_STATUS.CONFLICT,
      "EMPLOYEE_HAS_SCHEDULE_ITEMS"
    );
  }

  try {
    return await prisma.employee.update({
      where: { id },
      data: {
        ...data,
        ...(data.phone === "" && { phone: null }),
        ...(data.email === "" && { email: null })
      }
    });
  } catch (error) {
    handleUniqueError(error);
  }
}

async function remove(id) {
  await getEmployeeOrFail(id);

  const [staffCount, subjectCount, scheduleCount] = await Promise.all([
    prisma.staffAssignment.count({
      where: {
        employeeId: id,
        endDate: null
      }
    }),
    prisma.teacherSubject.count({
      where: { employeeId: id }
    }),
    prisma.scheduleItem.count({
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

  return prisma.employee.update({
    where: { id },
    data: {
      status: "ARCHIVED",
      archivedAt: new Date()
    }
  });
}

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove
};
