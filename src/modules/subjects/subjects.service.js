const prisma = require("../../config/prisma");
const AppError = require("../../utils/AppError");
const { HTTP_STATUS } = require("../../utils/http-status");

function fail(message, status, code) {
  throw new AppError(message, status, code);
}

async function getSubjectOrFail(id) {
  const subject = await prisma.subject.findUnique({
    where: { id }
  });

  if (!subject || subject.status === "ARCHIVED") {
    fail("Subject not found", HTTP_STATUS.NOT_FOUND, "SUBJECT_NOT_FOUND");
  }

  return subject;
}

async function checkUniqueName(name, excludeId) {
  const subject = await prisma.subject.findFirst({
    where: {
      name: {
        equals: name.trim(),
        mode: "insensitive"
      },
      ...(excludeId && { id: { not: excludeId } })
    }
  });

  if (subject) {
    fail("Subject name already exists", HTTP_STATUS.CONFLICT, "SUBJECT_NAME_EXISTS");
  }
}

function handleUniqueError(error) {
  if (error.code === "P2002") {
    fail("Subject name already exists", HTTP_STATUS.CONFLICT, "SUBJECT_NAME_EXISTS");
  }

  throw error;
}

async function getAll(query = {}) {
  const where = {
    status: query.status || { not: "ARCHIVED" }
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

async function getById(id) {
  return getSubjectOrFail(id);
}

async function create(data) {
  await checkUniqueName(data.name);

  try {
    return await prisma.subject.create({
      data: {
        name: data.name.trim(),
        description: data.description ?? null,
        status: "ACTIVE"
      }
    });
  } catch (error) {
    handleUniqueError(error);
  }
}

async function update(id, data) {
  await getSubjectOrFail(id);

  if (data.name !== undefined) {
    await checkUniqueName(data.name, id);
  }

  try {
    return await prisma.subject.update({
      where: { id },
      data
    });
  } catch (error) {
    handleUniqueError(error);
  }
}

async function remove(id) {
  await getSubjectOrFail(id);

  const activeAssignments = await prisma.teacherSubject.count({
    where: {
      subjectId: id,
      employee: { status: "ACTIVE" }
    }
  });

  if (activeAssignments > 0) {
    fail("Subject has assigned active teachers", HTTP_STATUS.CONFLICT, "SUBJECT_HAS_TEACHERS");
  }

  return prisma.subject.update({
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
