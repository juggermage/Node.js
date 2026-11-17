const prisma = require("../../config/prisma");
const auditService = require("../audit/audit.service");
const AppError = require("../../utils/app-error");
const HTTP_STATUS = require("../../utils/http-status");

const MODELS = {
  children: { delegate: "child", entityType: "Child", references: [["childParent","childId"],["groupEnrollment","childId"],["attendance","childId"],["childDiscount","childId"],["invoice","childId"]] },
  parents: { delegate: "parent", entityType: "Parent", references: [["childParent","parentId"],["invoice","payerId"],["payment","payerId"],["creditBalance","parentId"],["creditBalanceTransaction","parentId"],["invoiceAdjustment","payerId"]], userReference: true },
  groups: { delegate: "group", entityType: "Group", references: [["groupEnrollment","groupId"],["staffAssignment","groupId"],["schedule","groupId"],["expense","groupId"]] },
  employees: { delegate: "employee", entityType: "Employee", userReference: true, references: [["staffAssignment","employeeId"],["teacherSubject","employeeId"],["scheduleItem","teacherId"],["salaryRate","employeeId"],["salaryCalculation","employeeId"],["attendance","recordedById"]] },
  rooms: { delegate: "room", entityType: "Room", references: [["group","mainRoomId"],["scheduleItem","roomId"]] },
  subjects: { delegate: "subject", entityType: "Subject", references: [["teacherSubject","subjectId"],["scheduleItem","subjectId"]] }
};

function fail(message, status = HTTP_STATUS.CONFLICT, code = "LIFECYCLE_CONFLICT") {
  throw new AppError(message, status, code);
}
function getConfig(entity) {
  const config = MODELS[entity];
  if (!config) fail("Unsupported entity type", HTTP_STATUS.NOT_FOUND, "ENTITY_NOT_SUPPORTED");
  return config;
}
function ensureManagement(user) {
  if (!user || !["ADMIN", "MANAGER"].includes(user.role)) {
    fail("You do not have permission to perform this action", HTTP_STATUS.FORBIDDEN, "FORBIDDEN");
  }
}
async function getRecord(tx, config, id) {
  const record = await tx[config.delegate].findUnique({ where: { id } });
  if (!record) fail("Record not found", HTTP_STATUS.NOT_FOUND, "RECORD_NOT_FOUND");
  return record;
}
async function archive(entity, id, user) {
  ensureManagement(user);
  const config = getConfig(entity);
  return prisma.$transaction(async tx => {
    const before = await getRecord(tx, config, id);
    if (before.status === "ARCHIVED") fail("Record is already archived", HTTP_STATUS.CONFLICT, "ALREADY_ARCHIVED");
    const after = await tx[config.delegate].update({ where: { id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
    await auditService.createLog({ actorId: user.id, action: "ARCHIVE", entityType: config.entityType, entityId: id, before, after }, tx);
    return after;
  });
}
async function restore(entity, id, user) {
  ensureManagement(user);
  const config = getConfig(entity);
  return prisma.$transaction(async tx => {
    const before = await getRecord(tx, config, id);
    if (before.status !== "ARCHIVED") fail("Only archived records can be restored", HTTP_STATUS.CONFLICT, "NOT_ARCHIVED");
    const after = await tx[config.delegate].update({ where: { id }, data: { status: "ACTIVE", archivedAt: null } });
    await auditService.createLog({ actorId: user.id, action: "RESTORE", entityType: config.entityType, entityId: id, before, after }, tx);
    return after;
  });
}
async function hardDelete(entity, id, user) {
  ensureManagement(user);
  const config = getConfig(entity);
  return prisma.$transaction(async tx => {
    const before = await getRecord(tx, config, id);
    if (before.status !== "ARCHIVED") fail("Archive the record before permanent deletion", HTTP_STATUS.CONFLICT, "ARCHIVE_REQUIRED");
    if (config.userReference && before.userId) fail("Record is linked to a user account", HTTP_STATUS.CONFLICT, "RECORD_HAS_USER");
    const dependencies = [];
    for (const [delegate, field] of config.references) {
      const where = { [field]: id };
      const count = await tx[delegate].count({ where });
      if (count > 0) dependencies.push({ entity: delegate, count });
    }
    if (dependencies.length) {
      fail("Record cannot be permanently deleted because related records exist", HTTP_STATUS.CONFLICT, "RECORD_HAS_DEPENDENCIES");
    }
    await tx[config.delegate].delete({ where: { id } });
    await auditService.createLog({ actorId: user.id, action: "DELETE", entityType: config.entityType, entityId: id, before, after: null }, tx);
    return { id, deleted: true };
  });
}
module.exports = { MODELS, archive, restore, hardDelete };
