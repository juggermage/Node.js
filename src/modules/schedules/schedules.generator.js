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
  {
    type: "BREAKFAST",
    startTime: "08:30",
    endTime: "09:00"
  },
  {
    type: "LUNCH",
    startTime: "12:00",
    endTime: "12:30"
  },
  {
    type: "SLEEP",
    startTime: "13:00",
    endTime: "14:00"
  },
  {
    type: "SNACK",
    startTime: "15:00",
    endTime: "15:30"
  }
];

function fail(message, status, code) {
  throw new AppError(message, status, code);
}

function getAgeInMonths(birthDate) {
  const birth = new Date(birthDate);
  const now = new Date();

  let months = (now.getFullYear() - birth.getFullYear()) * 12 + now.getMonth() - birth.getMonth();

  if (now.getDate() < birth.getDate()) {
    months--;
  }

  return months;
}

async function generate({ groupId, name, validFrom, validTo }, user) {
const group = await prisma.group.findFirst({
  where: { id: groupId, status: "ACTIVE" },
  include: {
    mainRoom: true,
    enrollments: {
      include: { child: true }
    }
  }
});

  if (!group) {
    fail("Active group not found", HTTP_STATUS.NOT_FOUND, "GROUP_NOT_FOUND");
  }

  const children = group.enrollments
  .filter((item) => item.endDate === null)
  .map((item) => item.child);

  if (children.length === 0) {
    fail("Group has no enrolled children", HTTP_STATUS.UNPROCESSABLE_ENTITY, "GROUP_EMPTY");
  }

  if (children.length > group.capacity) {
    fail("Group enrollment exceeds its capacity", HTTP_STATUS.CONFLICT, "GROUP_CAPACITY_EXCEEDED");
  }

  const invalidAge = children.some((child) => {
    const age = getAgeInMonths(child.birthDate);

    return age < group.ageFromMonths || age > group.ageToMonths;
  });

  if (invalidAge) {
    fail(
      "Some children do not match the group's age range",
      HTTP_STATUS.CONFLICT,
      "GROUP_AGE_MISMATCH"
    );
  }

  const rooms = await prisma.room.findMany({
    where: {
      status: "ACTIVE",
      capacity: { gte: children.length }
    },
    orderBy: { capacity: "asc" }
  });

  const room = rooms.find((item) => item.id === group.mainRoomId) || rooms[0];

  if (!room) {
    fail(
      "No suitable room is available for this group",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "NO_AVAILABLE_ROOMS"
    );
  }

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
            dayOfWeek
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
            await schedulesService.createItem(
              schedule.id,
              {
                type: "LESSON",
                dayOfWeek,
                startTime: slot.startTime,
                endTime: slot.endTime,
                subjectId: subject.id,
                teacherId: teacher.id,
                roomId: room.id
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

module.exports = {
  generate
};