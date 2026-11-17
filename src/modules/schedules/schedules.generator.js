const prisma = require("../../config/prisma");
const AppError = require("../../utils/app-error");
const HTTP_STATUS = require("../../utils/http-status");
const schedulesService = require("./schedules.service");
const { WORKING_DAYS } = require("./schedules.config");

const LESSON_SLOTS = [
  { startTime: "09:00", endTime: "09:40" },
  { startTime: "09:50", endTime: "10:30" },
  { startTime: "10:40", endTime: "11:20" },
  { startTime: "14:00", endTime: "14:40" }
];

const DAILY_ROUTINE = [
  { type: "BREAKFAST", startTime: "08:30", endTime: "09:00" },
  { type: "FREE_TIME", startTime: "09:40", endTime: "09:50" },
  { type: "FREE_TIME", startTime: "10:30", endTime: "10:40" },
  { type: "FREE_TIME", startTime: "11:20", endTime: "12:00" },
  { type: "LUNCH", startTime: "12:00", endTime: "12:30" },
  { type: "FREE_TIME", startTime: "12:30", endTime: "13:00" },
  { type: "SLEEP", startTime: "13:00", endTime: "14:00" },
  { type: "FREE_TIME", startTime: "14:40", endTime: "15:00" },
  { type: "SNACK", startTime: "15:00", endTime: "15:30" }
];

const SUBJECT_ROOM_RULES = [
  { match: /математ|логік/i, purpose: "SPECIALIST_MATH_LOGIC" },
  { match: /мовленн|англій|мова/i, purpose: "SPECIALIST_LANGUAGE" },
  { match: /пізнан|світ|природ/i, purpose: "SPECIALIST_WORLD_DISCOVERY" },
  { match: /мистецтв|творч|малюван/i, purpose: "SPECIALIST_ARTS" },
  { match: /музик/i, purpose: "SPECIALIST_MUSIC" },
  { match: /танц/i, purpose: "SPECIALIST_DANCE" },
  { match: /фізич|спорт/i, purpose: "SPECIALIST_SPORTS" },
  { match: /конструюван|робототех/i, purpose: "SPECIALIST_ROBOTICS" }
];

function getRoomPurpose(subjectName) {
  return SUBJECT_ROOM_RULES.find((rule) => rule.match.test(subjectName))?.purpose || null;
}

function fail(message, status, code) {
  throw new AppError(message, status, code);
}


async function getCurrentEnrollments() {
  const enrollments = await prisma.groupEnrollment.findMany({
    where: {
      OR: [{ endDate: null }, { endDate: { isSet: false } }],
      child: { status: "ACTIVE" },
      group: { status: "ACTIVE" }
    },
    include: { child: true }
  });

  const current = new Map();

  for (const enrollment of enrollments) {
    const previous = current.get(enrollment.childId);
    if (!previous || new Date(enrollment.startDate) > new Date(previous.startDate)) {
      current.set(enrollment.childId, enrollment);
    }
  }

  return [...current.values()];
}

function getAgeInMonths(birthDate, referenceDate = new Date()) {
  const birth = new Date(birthDate);
  const now = new Date(referenceDate);

  let months = (now.getFullYear() - birth.getFullYear()) * 12 + now.getMonth() - birth.getMonth();

  if (now.getDate() < birth.getDate()) {
    months--;
  }

  return months;
}

async function generate({ groupId, name, validFrom, validTo }, user) {
  const group = await prisma.group.findFirst({
    where: { id: groupId, status: "ACTIVE" },
    include: { mainRoom: true }
  });

  if (!group) {
    fail("Active group not found", HTTP_STATUS.NOT_FOUND, "GROUP_NOT_FOUND");
  }

  const periodStart = new Date(`${validFrom}T00:00:00.000Z`);
  const periodEnd = validTo ? new Date(`${validTo}T23:59:59.999Z`) : new Date("9999-12-31T23:59:59.999Z");
  const existingSchedule = await prisma.schedule.findFirst({
    where: {
      groupId,
      status: { in: ["DRAFT", "PUBLISHED"] },
      validFrom: { lte: periodEnd },
      OR: [{ validTo: null }, { validTo: { gte: periodStart } }]
    }
  });

  if (existingSchedule) {
    fail(
      "Для цієї групи вже існує розклад у вибраному періоді. Спочатку завершіть або видаліть попередню чернетку.",
      HTTP_STATUS.CONFLICT,
      "SCHEDULE_ALREADY_EXISTS"
    );
  }

  const currentEnrollments = await getCurrentEnrollments();
  const children = currentEnrollments
    .filter((enrollment) => enrollment.groupId === group.id)
    .map((enrollment) => enrollment.child);

  if (children.length === 0) {
    fail("Group has no enrolled children", HTTP_STATUS.UNPROCESSABLE_ENTITY, "GROUP_EMPTY");
  }

  if (children.length > group.capacity) {
    fail("Group enrollment exceeds its capacity", HTTP_STATUS.CONFLICT, "GROUP_CAPACITY_EXCEEDED");
  }

  const invalidAge = children.some((child) => {
    const age = getAgeInMonths(child.birthDate, validFrom);

    return age < group.ageFromMonths || age > group.ageToMonths;
  });

  if (invalidAge) {
    fail(
      "Some children do not match the group's age range",
      HTTP_STATUS.CONFLICT,
      "GROUP_AGE_MISMATCH"
    );
  }

  const room = group.mainRoom;

  if (!room || room.status !== "ACTIVE" || room.capacity < children.length) {
    fail(
      "No suitable room is available for this group",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "NO_AVAILABLE_ROOMS"
    );
  }

  const specialistRooms = await prisma.room.findMany({
    where: {
      status: "ACTIVE",
      purpose: { in: SUBJECT_ROOM_RULES.map((rule) => rule.purpose) },
      capacity: { gte: children.length }
    }
  });
  const roomsByPurpose = new Map(specialistRooms.map((specialistRoom) => [specialistRoom.purpose, specialistRoom]));

  const teachers = await prisma.employee.findMany({
    where: {
      role: "TEACHER",
      status: "ACTIVE",
      subjects: {
        some: {
          subject: { status: "ACTIVE" }
        }
      }
    },
    include: {
      subjects: {
        include: {
          subject: true
        }
      }
    }
  });

  const availableTeachers = teachers
    .map((teacher) => ({
      ...teacher,
      activeSubjects: teacher.subjects
        .filter((item) => item.subject.status === "ACTIVE")
        .map((item) => item.subject)
    }))
    .filter((teacher) => teacher.activeSubjects.length > 0);

  if (availableTeachers.length === 0) {
    fail(
      "No active teachers with assigned subjects",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "NO_AVAILABLE_TEACHERS"
    );
  }

  const schedule = await schedulesService.create(
    {
      groupId,
      name: name || `Автоматичний розклад — ${group.name}`,
      validFrom,
      validTo: validTo ?? null
    },
    user
  );

  const teacherLoads = new Map(availableTeachers.map((teacher) => [teacher.id, 0]));

  let subjectIndex = 0;

  try {
    for (const dayOfWeek of WORKING_DAYS) {
      for (const routine of DAILY_ROUTINE) {
        await schedulesService.createItem(
          schedule.id,
          {
            ...routine,
            dayOfWeek,
            roomId: room.id
          },
          user
        );
      }
      for (const slot of LESSON_SLOTS) {
        const candidates = [...availableTeachers].sort(
          (a, b) => teacherLoads.get(a.id) - teacherLoads.get(b.id)
        );

        let created = false;

        for (const teacher of candidates) {
          const subject = teacher.activeSubjects[subjectIndex % teacher.activeSubjects.length];

          try {
            const roomPurpose = getRoomPurpose(subject.name);
            const lessonRoom = roomPurpose ? roomsByPurpose.get(roomPurpose) : null;

            if (!lessonRoom) {
              continue;
            }

            await schedulesService.createItem(
              schedule.id,
              {
                type: "LESSON",
                dayOfWeek,
                startTime: slot.startTime,
                endTime: slot.endTime,
                subjectId: subject.id,
                teacherId: teacher.id,
                roomId: lessonRoom.id
              },
              user
            );

            teacherLoads.set(teacher.id, teacherLoads.get(teacher.id) + 1);

            subjectIndex++;
            created = true;
            break;
          } catch (error) {
            if (error.code !== "SCHEDULE_CONFLICT") {
              throw error;
            }
          }
        }

        if (!created) {
          fail(
            `No available teacher for ${dayOfWeek} at ${slot.startTime}`,
            HTTP_STATUS.CONFLICT,
            "SCHEDULE_GENERATION_CONFLICT"
          );
        }
      }
    }

      return schedulesService.getById(schedule.id);
  } catch (error) {
    await schedulesService.remove(schedule.id, user).catch(() => {});
    throw error;
  }
}

async function generateAll({ validFrom, validTo }, user) {
  const groups = await prisma.group.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" }
  });
  const currentEnrollments = await getCurrentEnrollments();
  const enrolledGroupIds = new Set(currentEnrollments.map((item) => item.groupId));
  const populatedGroups = groups.filter((group) => enrolledGroupIds.has(group.id));
  const skippedGroups = groups
    .filter((group) => !enrolledGroupIds.has(group.id))
    .map((group) => ({ groupId: group.id, groupName: group.name, reason: "Немає активних зарахованих дітей" }));

  if (populatedGroups.length === 0) {
    const demoChildrenCount = await prisma.child.count({
      where: { status: "ACTIVE", childCode: { startsWith: "DEMO-CH-" } }
    });
    fail(
      `Не знайдено активних зарахувань дітей у групи. Активних груп: ${groups.length}; активних DEMO-CH дітей: ${demoChildrenCount}. Перевірте розділ «Групи» або виконайте npm run db:repair:demo-enrollments для відновлення демонстраційних зарахувань.`,
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "NO_POPULATED_GROUPS"
    );
  }

  const groupIds = populatedGroups.map((group) => group.id);
  const periodStart = new Date(`${validFrom}T00:00:00.000Z`);
  const periodEnd = validTo ? new Date(`${validTo}T23:59:59.999Z`) : null;
  const existing = await prisma.schedule.findMany({
    where: {
      groupId: { in: groupIds },
      status: { in: ["DRAFT", "PUBLISHED"] },
      validFrom: periodEnd ? { lte: periodEnd } : { lte: new Date("9999-12-31T23:59:59.999Z") },
      OR: [
        { validTo: null },
        { validTo: { gte: periodStart } }
      ]
    },
    include: { group: { select: { id: true, name: true } } }
  });

  if (existing.length > 0) {
    const names = [...new Set(existing.map((item) => item.group?.name || item.groupId))];
    fail(
      `Для таких груп уже існує розклад у вибраному періоді: ${names.join(", ")}. Спочатку завершіть або видаліть попередні чернетки.`,
      HTTP_STATUS.CONFLICT,
      "SCHEDULE_ALREADY_EXISTS"
    );
  }

  const generated = [];

  try {
    for (const group of populatedGroups) {
      const schedule = await generate(
        {
          groupId: group.id,
          validFrom,
          validTo,
          name: `Автоматичний розклад — ${group.name}`
        },
        user
      );
      generated.push(schedule);
    }
  } catch (error) {
    for (const schedule of generated.reverse()) {
      await schedulesService.remove(schedule.id, user).catch(() => {});
    }
    throw error;
  }

  return {
    groupsGenerated: generated.length,
    groupsSkipped: skippedGroups.length,
    totalItems: generated.reduce((total, schedule) => total + (schedule.items?.length || 0), 0),
    validFrom,
    validTo: validTo ?? null,
    schedules: generated,
    skippedGroups
  };
}

module.exports = {
  generate,
  generateAll
};
