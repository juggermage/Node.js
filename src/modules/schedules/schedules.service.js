const prisma = require("../../config/prisma");
const auditService = require("../audit/audit.service");
const AppError = require("../../utils/app-error");
const HTTP_STATUS = require("../../utils/http-status");

const { WORK_DAY } = require("./schedules.config");
const {
  toMinutes,
  periodsOverlap,
  isInsideWorkDay,
  findRestrictedWindow,
  findTimeOverlap,
  findResourceConflict
} = require("./schedules.rules");

const itemInclude = {
  subject: { select: { id: true, name: true } },
  teacher: { select: { id: true, firstName: true, lastName: true } },
  room: { select: { id: true, name: true } }
};

const scheduleInclude = {
  group: { select: { id: true, name: true } },
  items: {
    include: itemInclude,
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }]
  }
};

function toUtcDate(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function resolveDate(input, current) {
  if (input === undefined) return current;
  if (input === null) return null;

  return toUtcDate(input);
}

async function findScheduleOrThrow(id, db = prisma) {
  const schedule = await db.schedule.findUnique({
    where: { id }
  });

  if (!schedule) {
    throw new AppError(
      "Schedule not found",
      HTTP_STATUS.NOT_FOUND,
      "SCHEDULE_NOT_FOUND"
    );
  }

  return schedule;
}

function assertDraft(schedule) {
  if (schedule.status !== "DRAFT") {
    throw new AppError(
      "Published schedule cannot be edited",
      HTTP_STATUS.CONFLICT,
      "SCHEDULE_PUBLISHED"
    );
  }
}

async function requireActive(delegate, id, code, message) {
  const record = await delegate.findFirst({
    where: { id, status: "ACTIVE" }
  });

  if (!record) {
    throw new AppError(message, HTTP_STATUS.NOT_FOUND, code);
  }

  return record;
}

function assertDayRules(item) {
  if (!isInsideWorkDay(item.startTime, item.endTime)) {
    throw new AppError(
      `Item must be within working hours ${WORK_DAY.start}-${WORK_DAY.end}`,
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "OUTSIDE_WORKING_HOURS"
    );
  }

  if (item.type === "LESSON") {
    const window = findRestrictedWindow(item.startTime, item.endTime);

    if (window) {
      throw new AppError(
        `Lesson cannot take place during ${window.name} (${window.start}-${window.end})`,
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        "LESSON_DURING_RESTRICTED_TIME"
      );
    }
  }
}

async function assertReferences(item, schedule) {
  if (item.subjectId) {
    await requireActive(
      prisma.subject,
      item.subjectId,
      "SUBJECT_NOT_FOUND",
      "Subject not found"
    );
  }

  if (item.teacherId) {
    await requireActive(
      prisma.employee,
      item.teacherId,
      "EMPLOYEE_NOT_FOUND",
      "Teacher not found"
    );
  }

  if (item.roomId) {
    await requireActive(
      prisma.room,
      item.roomId,
      "ROOM_NOT_FOUND",
      "Room not found"
    );

    const reservedByOtherGroup = await prisma.group.findFirst({
      where: {
        mainRoomId: item.roomId,
        id: { not: schedule.groupId }
      }
    });

    if (reservedByOtherGroup) {
      throw new AppError(
        "Room is the main room of another group",
        HTTP_STATUS.CONFLICT,
        "ROOM_RESERVED_FOR_OTHER_GROUP"
      );
    }
  }
}

async function loadOtherPublishedItems(schedule, items) {
  const teacherIds = [
    ...new Set(items.map((item) => item.teacherId).filter(Boolean))
  ];

  const roomIds = [
    ...new Set(items.map((item) => item.roomId).filter(Boolean))
  ];

  const conditions = [];

  if (teacherIds.length > 0) {
    conditions.push({ teacherId: { in: teacherIds } });
  }

  if (roomIds.length > 0) {
    conditions.push({ roomId: { in: roomIds } });
  }

  if (conditions.length === 0) {
    return [];
  }

  const found = await prisma.scheduleItem.findMany({
    where: {
      scheduleId: { not: schedule.id },
      status: "ACTIVE",
      schedule: { status: "PUBLISHED" },
      OR: conditions
    },
    include: {
      schedule: {
        select: {
          validFrom: true,
          validTo: true
        }
      }
    }
  });

  return found.filter((item) =>
    periodsOverlap(schedule, item.schedule)
  );
}

function assertNoConflicts(
  item,
  ownItems,
  otherItems,
  excludeItemId = null
) {
  if (findTimeOverlap(item, ownItems, excludeItemId)) {
    throw new AppError(
      "Group already has an item at this time",
      HTTP_STATUS.CONFLICT,
      "SCHEDULE_CONFLICT"
    );
  }

  const allItems = [...ownItems, ...otherItems];

  if (findResourceConflict(item, allItems, "teacherId", excludeItemId)) {
    throw new AppError(
      "Teacher is already busy at this time",
      HTTP_STATUS.CONFLICT,
      "SCHEDULE_CONFLICT"
    );
  }

  if (findResourceConflict(item, allItems, "roomId", excludeItemId)) {
    throw new AppError(
      "Room is already occupied at this time",
      HTTP_STATUS.CONFLICT,
      "SCHEDULE_CONFLICT"
    );
  }
}

async function validateItem(schedule, item, excludeItemId = null) {
  assertDayRules(item);
  await assertReferences(item, schedule);

  const ownItems = await prisma.scheduleItem.findMany({
    where: {
      scheduleId: schedule.id,
      status: "ACTIVE"
    }
  });

  const otherItems = await loadOtherPublishedItems(schedule, [item]);

  assertNoConflicts(item, ownItems, otherItems, excludeItemId);
}

async function getAll({ groupId, status } = {}) {
  const where = {};

  if (groupId) where.groupId = groupId;
  if (status) where.status = status;

  return prisma.schedule.findMany({
    where,
    include: {
      group: { select: { id: true, name: true } },
      _count: { select: { items: true } }
    },
    orderBy: { createdAt: "desc" }
  });
}

async function getById(id) {
  const schedule = await prisma.schedule.findUnique({
    where: { id },
    include: scheduleInclude
  });

  if (!schedule) {
    throw new AppError(
      "Schedule not found",
      HTTP_STATUS.NOT_FOUND,
      "SCHEDULE_NOT_FOUND"
    );
  }

  return schedule;
}

async function create({ groupId, name, validFrom, validTo }, user) {
  await requireActive(
    prisma.group,
    groupId,
    "GROUP_NOT_FOUND",
    "Group not found"
  );

  return prisma.$transaction(async (tx) => {
    const schedule = await tx.schedule.create({
      data: {
        groupId,
        name,
        status: "DRAFT",
        validFrom: toUtcDate(validFrom),
        validTo: validTo ? toUtcDate(validTo) : null
      },
      include: scheduleInclude
    });

    await auditService.createLog(
      {
        actorId: user.id,
        action: "CREATE",
        entityType: "Schedule",
        entityId: schedule.id,
        after: schedule
      },
      tx
    );

    return schedule;
  });
}

async function update(id, data, user) {
  return prisma.$transaction(async (tx) => {
    const before = await findScheduleOrThrow(id, tx);
    assertDraft(before);

    const validFrom = resolveDate(data.validFrom, before.validFrom);
    const validTo = resolveDate(data.validTo, before.validTo);

    if (validTo && validTo < validFrom) {
      throw new AppError(
        "validTo must not be earlier than validFrom",
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        "INVALID_PERIOD"
      );
    }

    const updated = await tx.schedule.update({
      where: { id },
      data: {
        name: data.name ?? before.name,
        validFrom,
        validTo
      },
      include: scheduleInclude
    });

    await auditService.createLog(
      {
        actorId: user.id,
        action: "UPDATE",
        entityType: "Schedule",
        entityId: id,
        before,
        after: updated
      },
      tx
    );

    return updated;
  });
}

async function remove(id, user) {
  return prisma.$transaction(async (tx) => {
    const schedule = await tx.schedule.findUnique({
      where: { id },
      include: { items: true }
    });

    if (!schedule) {
      throw new AppError(
        "Schedule not found",
        HTTP_STATUS.NOT_FOUND,
        "SCHEDULE_NOT_FOUND"
      );
    }

    assertDraft(schedule);

    for (const item of schedule.items) {
      await auditService.createLog(
        {
          actorId: user.id,
          action: "DELETE",
          entityType: "ScheduleItem",
          entityId: item.id,
          before: item
        },
        tx
      );
    }

    await tx.scheduleItem.deleteMany({
      where: { scheduleId: id }
    });

    await tx.schedule.delete({
      where: { id }
    });

    await auditService.createLog(
      {
        actorId: user.id,
        action: "DELETE",
        entityType: "Schedule",
        entityId: id,
        before: schedule
      },
      tx
    );
  });
}

async function createItem(scheduleId, data, user) {
  const schedule = await findScheduleOrThrow(scheduleId);
  assertDraft(schedule);

  const item = {
    type: data.type,
    dayOfWeek: data.dayOfWeek,
    startTime: data.startTime,
    endTime: data.endTime,
    subjectId: data.subjectId ?? null,
    teacherId: data.teacherId ?? null,
    roomId: data.roomId ?? null
  };

  await validateItem(schedule, item);

  return prisma.$transaction(async (tx) => {
    const created = await tx.scheduleItem.create({
      data: {
        scheduleId,
        ...item
      },
      include: itemInclude
    });

    await auditService.createLog(
      {
        actorId: user.id,
        action: "CREATE",
        entityType: "ScheduleItem",
        entityId: created.id,
        after: created
      },
      tx
    );

    return created;
  });
}

async function updateItem(scheduleId, itemId, data, user) {
  const schedule = await findScheduleOrThrow(scheduleId);
  assertDraft(schedule);

  const existing = await prisma.scheduleItem.findFirst({
    where: {
      id: itemId,
      scheduleId
    }
  });

  if (!existing) {
    throw new AppError(
      "Schedule item not found",
      HTTP_STATUS.NOT_FOUND,
      "SCHEDULE_ITEM_NOT_FOUND"
    );
  }

  if (existing.type !== "LESSON" && (data.subjectId || data.teacherId)) {
    throw new AppError(
      "Only lessons can have a subject or a teacher",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "INVALID_ITEM_FIELDS"
    );
  }

  const item = {
    type: existing.type,
    dayOfWeek: data.dayOfWeek ?? existing.dayOfWeek,
    startTime: data.startTime ?? existing.startTime,
    endTime: data.endTime ?? existing.endTime,
    subjectId: data.subjectId ?? existing.subjectId,
    teacherId: data.teacherId ?? existing.teacherId,
    roomId: data.roomId ?? existing.roomId
  };

  if (toMinutes(item.endTime) <= toMinutes(item.startTime)) {
    throw new AppError(
      "endTime must be later than startTime",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "INVALID_TIME_RANGE"
    );
  }

  await validateItem(schedule, item, existing.id);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.scheduleItem.update({
      where: { id: itemId },
      data: item,
      include: itemInclude
    });

    await auditService.createLog(
      {
        actorId: user.id,
        action: "UPDATE",
        entityType: "ScheduleItem",
        entityId: itemId,
        before: existing,
        after: updated
      },
      tx
    );

    return updated;
  });
}

async function removeItem(scheduleId, itemId, user) {
  const schedule = await findScheduleOrThrow(scheduleId);
  assertDraft(schedule);

  return prisma.$transaction(async (tx) => {
    const item = await tx.scheduleItem.findFirst({
      where: {
        id: itemId,
        scheduleId
      }
    });

    if (!item) {
      throw new AppError(
        "Schedule item not found",
        HTTP_STATUS.NOT_FOUND,
        "SCHEDULE_ITEM_NOT_FOUND"
      );
    }

    await tx.scheduleItem.delete({
      where: { id: itemId }
    });

    await auditService.createLog(
      {
        actorId: user.id,
        action: "DELETE",
        entityType: "ScheduleItem",
        entityId: itemId,
        before: item
      },
      tx
    );
  });
}

async function cancelItem(scheduleId, itemId, { reason }, user) {
  const schedule = await findScheduleOrThrow(scheduleId);

  if (schedule.status !== "PUBLISHED") {
    throw new AppError(
      "Only items of a published schedule can be cancelled",
      HTTP_STATUS.CONFLICT,
      "SCHEDULE_NOT_PUBLISHED"
    );
  }

  return prisma.$transaction(async (tx) => {
    const before = await tx.scheduleItem.findFirst({
      where: {
        id: itemId,
        scheduleId
      }
    });

    if (!before) {
      throw new AppError(
        "Schedule item not found",
        HTTP_STATUS.NOT_FOUND,
        "SCHEDULE_ITEM_NOT_FOUND"
      );
    }

    if (before.status === "CANCELLED") {
      throw new AppError(
        "Schedule item is already cancelled",
        HTTP_STATUS.CONFLICT,
        "SCHEDULE_ITEM_ALREADY_CANCELLED"
      );
    }

    const updated = await tx.scheduleItem.update({
      where: { id: itemId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: reason
      },
      include: itemInclude
    });

    await auditService.createLog(
      {
        actorId: user.id,
        action: "CANCEL",
        entityType: "ScheduleItem",
        entityId: itemId,
        before,
        after: updated
      },
      tx
    );

    return updated;
  });
}

async function publish(id, user) {
  const schedule = await prisma.schedule.findUnique({
    where: { id },
    include: { items: true }
  });

  if (!schedule) {
    throw new AppError(
      "Schedule not found",
      HTTP_STATUS.NOT_FOUND,
      "SCHEDULE_NOT_FOUND"
    );
  }

  if (schedule.status === "PUBLISHED") {
    throw new AppError(
      "Schedule is already published",
      HTTP_STATUS.CONFLICT,
      "SCHEDULE_ALREADY_PUBLISHED"
    );
  }

  await requireActive(
    prisma.group,
    schedule.groupId,
    "GROUP_NOT_FOUND",
    "Group not found"
  );

  if (schedule.items.length === 0) {
    throw new AppError(
      "Schedule must contain at least one item",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "SCHEDULE_EMPTY"
    );
  }

  const publishedOfGroup = await prisma.schedule.findMany({
    where: {
      groupId: schedule.groupId,
      status: "PUBLISHED",
      id: { not: id }
    }
  });

  if (publishedOfGroup.some((other) => periodsOverlap(schedule, other))) {
    throw new AppError(
      "Group already has a published schedule for this period",
      HTTP_STATUS.CONFLICT,
      "SCHEDULE_PERIOD_OVERLAP"
    );
  }

  const otherItems = await loadOtherPublishedItems(
    schedule,
    schedule.items
  );

  for (const item of schedule.items) {
    assertDayRules(item);
    await assertReferences(item, schedule);
    assertNoConflicts(item, schedule.items, otherItems, item.id);
  }

  return prisma.$transaction(async (tx) => {
    const before = await tx.schedule.findUnique({
      where: { id },
      include: scheduleInclude
    });

    const updated = await tx.schedule.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date()
      },
      include: scheduleInclude
    });

    await auditService.createLog(
      {
        actorId: user.id,
        action: "UPDATE",
        entityType: "Schedule",
        entityId: id,
        before,
        after: updated
      },
      tx
    );

    return updated;
  });
}

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove,
  publish,
  createItem,
  updateItem,
  removeItem,
  cancelItem
};
