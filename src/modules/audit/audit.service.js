const prisma = require("../../config/prisma");
const AppError = require("../../utils/app-error");
const HTTP_STATUS = require("../../utils/http-status");

// Дозволені типи дій із Prisma-схеми.
const AUDIT_ACTIONS = ["CREATE", "UPDATE", "DELETE", "ARCHIVE", "RESTORE", "PAYMENT", "CANCEL"];

// Поля, які не можна зберігати в журналі.
const SECRET_FIELD_PATTERN = /password|token|secret|authorization|cookie|api.?key|credential/i;

// Очищує дані від конфіденційної інформації.
function prepareSnapshot(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => prepareSnapshot(item));
  }

  const result = {};

  for (const [key, item] of Object.entries(value)) {
    if (SECRET_FIELD_PATTERN.test(key)) {
      continue;
    }

    if (item !== undefined) {
      result[key] = prepareSnapshot(item);
    }
  }

  return result;
}

// Створює запис аудиту.
// Функцію викликають інші серверні модулі.
async function createLog({
  actorId = null,
  action,
  entityType,
  entityId,
  before = null,
  after = null
} = {}) {
  if (!AUDIT_ACTIONS.includes(action)) {
    throw new AppError(
      "Invalid audit action",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "INVALID_AUDIT_ACTION"
    );
  }

  if (
    typeof entityType !== "string" ||
    !entityType.trim() ||
    typeof entityId !== "string" ||
    !entityId.trim()
  ) {
    throw new AppError(
      "Entity type and entity ID are required",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "INVALID_AUDIT_ENTITY"
    );
  }

  // actorId необов'язковий, поки немає Auth.
  // Якщо він переданий, перевіряємо формат ObjectId.
  if (actorId !== null && (typeof actorId !== "string" || !/^[0-9a-fA-F]{24}$/.test(actorId))) {
    throw new AppError(
      "Invalid audit actor ID",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "INVALID_AUDIT_ACTOR"
    );
  }

  return prisma.auditLog.create({
    data: {
      actorId,
      action,
      entityType: entityType.trim(),
      entityId: entityId.trim(),
      before: prepareSnapshot(before),
      after: prepareSnapshot(after)
    }
  });
}

// Повертає записи аудиту з фільтрами.
async function getAll(filters = {}) {
  const { from, to, entityType, action } = filters;

  const where = {};

  if (from || to) {
    where.createdAt = {};

    if (from) {
      where.createdAt.gte = new Date(from);
    }

    if (to) {
      where.createdAt.lte = new Date(to);
    }
  }

  if (entityType) {
    where.entityType = entityType;
  }

  if (action) {
    where.action = action;
  }

  return prisma.auditLog.findMany({
    where,
    orderBy: {
      createdAt: "desc"
    },
    take: 100
  });
}

module.exports = {
  createLog,
  getAll,
  prepareSnapshot
};
