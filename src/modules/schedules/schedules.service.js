const prisma = require("../../config/prisma");
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

async function findScheduleOrThrow(id) {
  const schedule = await prisma.schedule.findUnique({ where: { id } });

  if (!schedule) {
    throw new AppError("Schedule not found", HTTP_STATUS.NOT_FOUND, "SCHEDULE_NOT_FOUND");
  }

  return schedule;
}

// Опублікований розклад не можна змінювати напряму.
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
  const record = await delegate.findFirst({ where: { id, status: "ACTIVE" } });

  if (!record) {
    throw new AppError(message, HTTP_STATUS.NOT_FOUND, code);
  }

  return record;
}

// Робочий день і режим дня (сон, харчування).
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

// Предмет, викладач і кімната мають існувати й бути активними.
// Основна кімната іншої групи недоступна, спеціалізовані кімнати доступні всім групам.
async function assertReferences(item, schedule) {
  if (item.subjectId) {
    await requireActive(prisma.subject, item.subjectId, "SUBJECT_NOT_FOUND", "Subject not found");
  }

  if (item.teacherId) {
    await requireActive(prisma.employee, item.teacherId, "EMPLOYEE_NOT_FOUND", "Teacher not found");
  }

  if (item.roomId) {
    await requireActive(prisma.room, item.roomId, "ROOM_NOT_FOUND", "Room not found");

    const reservedByOtherGroup = await prisma.group.findFirst({
      where: { mainRoomId: item.roomId, id: { not: schedule.groupId } }
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

// Заняття викладачів і кімнат в інших опублікованих розкладах, що діють у той самий період.
async function loadOtherPublishedItems(schedule, items) {
  const teacherIds = [...new Set(items.map((item) => item.teacherId).filter(Boolean))];
  const roomIds = [...new Set(items.map((item) => item.roomId).filter(Boolean))];
  const conditions = [];

  if (teacherIds.length > 0) conditions.push({ teacherId: { in: teacherIds } });
  if (roomIds.length > 0) conditions.push({ roomId: { in: roomIds } });

  if (conditions.length === 0) {
    return [];
  }

  const found = await prisma.scheduleItem.findMany({
    where: {
      scheduleId: { not: schedule.id },
      schedule: { status: "PUBLISHED" },
      OR: conditions
    },
    include: { schedule: { select: { validFrom: true, validTo: true } } }
  });

  return found.filter((item) => periodsOverlap(schedule, item.schedule));
}

function assertNoConflicts(item, ownItems, otherItems, excludeItemId = null) {
  if (findTimeOverlap(item, ownItems, excludeItemId)) {
    throw new AppError(
      "Group already has an item at this time",
      HTTP_STATUS.CONFLICT,
      "GROUP_TIME_CONFLICT"
    );
  }

  const allItems = [...ownItems, ...otherItems];

  if (findResourceConflict(item, allItems, "teacherId", excludeItemId)) {
    throw new AppError(
      "Teacher is already busy at this time",
      HTTP_STATUS.CONFLICT,
      "TEACHER_TIME_CONFLICT"
    );
  }

  if (findResourceConflict(item, allItems, "roomId", excludeItemId)) {
    throw new AppError(
      "Room is already occupied at this time",
      HTTP_STATUS.CONFLICT,
      "ROOM_TIME_CONFLICT"
    );
  }
}

async function validateItem(schedule, item, excludeItemId = null) {
  assertDayRules(item);
  await assertReferences(item, schedule);

  const ownItems = await prisma.scheduleItem.findMany({ where: { scheduleId: schedule.id } });
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
    throw new AppError("Schedule not found", HTTP_STATUS.NOT_FOUND, "SCHEDULE_NOT_FOUND");
  }

  return schedule;
}

async function create({ groupId, name, validFrom, validTo }) {
  await requireActive(prisma.group, groupId, "GROUP_NOT_FOUND", "Group not found");

  return prisma.schedule.create({
    data: {
      groupId,
      name,
      status: "DRAFT",
      validFrom: toUtcDate(validFrom),
      validTo: validTo ? toUtcDate(validTo) : null
    },
    include: scheduleInclude
  });
}

async function update(id, data) {
  const schedule = await findScheduleOrThrow(id);
  assertDraft(schedule);

  const validFrom = resolveDate(data.validFrom, schedule.validFrom);
  const validTo = resolveDate(data.validTo, schedule.validTo);

  if (validTo && validTo < validFrom) {
    throw new AppError(
      "validTo must not be earlier than validFrom",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "INVALID_PERIOD"
    );
  }

  return prisma.schedule.update({
    where: { id },
    data: {
      name: data.name ?? schedule.name,
      validFrom,
      validTo
    },
    include: scheduleInclude
  });
}

async function createItem(scheduleId, data) {
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

  return prisma.scheduleItem.create({
    data: { scheduleId, ...item },
    include: itemInclude
  });
}

async function updateItem(scheduleId, itemId, data) {
  const schedule = await findScheduleOrThrow(scheduleId);
  assertDraft(schedule);

  const existing = await prisma.scheduleItem.findFirst({ where: { id: itemId, scheduleId } });

  if (!existing) {
    throw new AppError("Schedule item not found", HTTP_STATUS.NOT_FOUND, "SCHEDULE_ITEM_NOT_FOUND");
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

  return prisma.scheduleItem.update({
    where: { id: itemId },
    data: item,
    include: itemInclude
  });
}

async function removeItem(scheduleId, itemId) {
  const schedule = await findScheduleOrThrow(scheduleId);
  assertDraft(schedule);

  const result = await prisma.scheduleItem.deleteMany({ where: { id: itemId, scheduleId } });

  if (result.count === 0) {
    throw new AppError("Schedule item not found", HTTP_STATUS.NOT_FOUND, "SCHEDULE_ITEM_NOT_FOUND");
  }
}

// Повна перевірка перед публікацією.
async function publish(id) {
  const schedule = await prisma.schedule.findUnique({
    where: { id },
    include: { items: true }
  });

  if (!schedule) {
    throw new AppError("Schedule not found", HTTP_STATUS.NOT_FOUND, "SCHEDULE_NOT_FOUND");
  }

  if (schedule.status === "PUBLISHED") {
    throw new AppError(
      "Schedule is already published",
      HTTP_STATUS.CONFLICT,
      "SCHEDULE_ALREADY_PUBLISHED"
    );
  }

  await requireActive(prisma.group, schedule.groupId, "GROUP_NOT_FOUND", "Group not found");

  if (schedule.items.length === 0) {
    throw new AppError(
      "Schedule must contain at least one item",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "SCHEDULE_EMPTY"
    );
  }

  // У групи не може бути двох опублікованих розкладів, що діють одночасно.
  const publishedOfGroup = await prisma.schedule.findMany({
    where: { groupId: schedule.groupId, status: "PUBLISHED", id: { not: id } }
  });

  if (publishedOfGroup.some((other) => periodsOverlap(schedule, other))) {
    throw new AppError(
      "Group already has a published schedule for this period",
      HTTP_STATUS.CONFLICT,
      "SCHEDULE_PERIOD_OVERLAP"
    );
  }

  const otherItems = await loadOtherPublishedItems(schedule, schedule.items);

  for (const item of schedule.items) {
    assertDayRules(item);
    await assertReferences(item, schedule);
    assertNoConflicts(item, schedule.items, otherItems, item.id);
  }

  return prisma.schedule.update({
    where: { id },
    data: { status: "PUBLISHED" },
    include: scheduleInclude
  });
}

module.exports = {
  getAll,
  getById,
  create,
  update,
  publish,
  createItem,
  updateItem,
  removeItem
};
