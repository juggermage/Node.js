const prisma = require("../../config/prisma");
const AppError = require("../../utils/app-error");
const HTTP_STATUS = require("../../utils/http-status");

const AUDIT_ACTIONS = ["CREATE", "UPDATE", "DELETE", "ARCHIVE", "RESTORE", "PAYMENT", "CANCEL"];

const SECRET_FIELD_PATTERN = /password|token|secret|authorization|cookie|api.?key|credential/i;

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

async function createLog(
  { actorId = null, action, entityType, entityId, before = null, after = null } = {},
  tx = prisma
) {
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

  if (actorId !== null && (typeof actorId !== "string" || !/^[0-9a-fA-F]{24}$/.test(actorId))) {
    throw new AppError(
      "Invalid audit actor ID",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "INVALID_AUDIT_ACTOR"
    );
  }

  return tx.auditLog.create({
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

async function getAll(filters = {}) {
  const { from, to, actorId, entityType, action, page = 1, limit = 20 } = filters;

  const where = {};

  if (from || to) {
    where.createdAt = {};

    if (from) {
      where.createdAt.gte = from;
    }

    if (to) {
      where.createdAt.lte = to;
    }
  }

  if (actorId) {
    where.actorId = actorId;
  }

  if (entityType) {
    where.entityType = entityType;
  }

  if (action) {
    where.action = action;
  }

  const skip = (page - 1) * limit;

  const [items, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: {
        createdAt: "desc"
      },
      skip,
      take: limit
    }),
    prisma.auditLog.count({
      where
    })
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

async function getById(id) {
  const auditLog = await prisma.auditLog.findUnique({
    where: { id }
  });

  if (!auditLog) {
    throw new AppError("Audit log not found", HTTP_STATUS.NOT_FOUND, "AUDIT_LOG_NOT_FOUND");
  }

  return auditLog;
}

module.exports = {
  createLog,
  getAll,
  getById,
  prepareSnapshot
};
