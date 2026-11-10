const prisma = require("../../../config/prisma");
const auditService = require("../../audit/audit.service");
const AppError = require("../../../utils/app-error");
const HTTP_STATUS = require("../../../utils/http-status");

const DEFAULT_RATES = Object.freeze({
  2: 300,
  3: 400,
  4: 500,
  5: 600
});

const DAY_MS = 86400000;

function parseDay(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  const validFormat = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

  const date = validFormat ? new Date(`${value}T00:00:00.000Z`) : new Date(NaN);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new AppError("Invalid date", HTTP_STATUS.UNPROCESSABLE_ENTITY, "INVALID_DATE");
  }

  return date;
}

function checkAge(ageYears) {
  if (!Number.isInteger(ageYears) || ageYears < 2 || ageYears > 5) {
    throw new AppError(
      "Age category must be A2-A5",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "INVALID_AGE_CATEGORY"
    );
  }
}

function calculateAge(birthDate, date) {
  const birth = new Date(birthDate);

  if (Number.isNaN(birth.getTime()) || birth > date) {
    throw new AppError(
      "Invalid birth date",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "INVALID_BIRTH_DATE"
    );
  }

  let age = date.getUTCFullYear() - birth.getUTCFullYear();

  if (
    date.getUTCMonth() < birth.getUTCMonth() ||
    (date.getUTCMonth() === birth.getUTCMonth() && date.getUTCDate() < birth.getUTCDate())
  ) {
    age--;
  }

  return age;
}

function validatePeriod(start, end) {
  const from = parseDay(start);
  const to = parseDay(end);

  if (from > to) {
    throw new AppError(
      "Period start is after period end",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "INVALID_PERIOD"
    );
  }

  return {
    from,
    to,
    days: Math.round((to - from) / DAY_MS) + 1
  };
}

function calculateAmount(rate, attendedDays, maximumDays) {
  if (!Number.isInteger(attendedDays) || attendedDays < 0 || attendedDays > maximumDays) {
    throw new AppError(
      "Invalid attendance days",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "INVALID_ATTENDANCE_DAYS"
    );
  }

  if (typeof rate !== "bigint" && (!Number.isSafeInteger(rate) || rate <= 0)) {
    throw new AppError("Invalid meal rate", HTTP_STATUS.UNPROCESSABLE_ENTITY, "INVALID_MEAL_RATE");
  }

  const amount = BigInt(rate);

  if (amount <= 0n) {
    throw new AppError("Invalid meal rate", HTTP_STATUS.UNPROCESSABLE_ENTITY, "INVALID_MEAL_RATE");
  }

  return amount * BigInt(attendedDays);
}

function serializeRate(rate) {
  return {
    ...rate,
    amount: rate.amount.toString()
  };
}

async function getAllRates({ ageYears, category, onDate } = {}) {
  if (ageYears !== undefined) checkAge(ageYears);
  if (category !== undefined && !["A2", "A3", "A4", "A5"].includes(category)) {
    throw new AppError(
      "Invalid meal category",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "INVALID_MEAL_CATEGORY"
    );
  }

  const where = {};

  if (category !== undefined) where.category = category;
  else if (ageYears !== undefined) where.ageYears = ageYears;

  if (onDate) {
    const date = parseDay(onDate);

    where.validFrom = { lte: date };
    where.OR = [{ validTo: null }, { validTo: { gte: date } }];
  }

  const rates = await prisma.mealRate.findMany({
    where,
    orderBy: [{ ageYears: "asc" }, { validFrom: "desc" }]
  });

  return rates.map(serializeRate);
}

async function getApplicableRate(ageYears, onDate) {
  checkAge(ageYears);

  const date = parseDay(onDate);

  const rate = await prisma.mealRate.findFirst({
    where: {
      ageYears,
      validFrom: { lte: date },
      OR: [{ validTo: null }, { validTo: { gte: date } }]
    },
    orderBy: { validFrom: "desc" }
  });

  if (!rate) {
    throw new AppError("Meal rate not found", HTTP_STATUS.NOT_FOUND, "MEAL_RATE_NOT_FOUND");
  }

  return rate;
}

async function createRate({ ageYears, category, amount, validFrom, validTo = null }, user) {
  if (category !== undefined && !["A2", "A3", "A4", "A5"].includes(category)) {
    throw new AppError(
      "Invalid meal category",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "INVALID_MEAL_CATEGORY"
    );
  }
  if (category === undefined) checkAge(ageYears);
  if (category === undefined && ageYears === undefined) {
    throw new AppError(
      "Meal category is required",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "INVALID_MEAL_CATEGORY"
    );
  }
  const rateKey = category ? { category } : { ageYears };

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new AppError("Invalid meal rate", HTTP_STATUS.UNPROCESSABLE_ENTITY, "INVALID_MEAL_RATE");
  }

  const from = parseDay(validFrom);
  const to = validTo === null ? null : parseDay(validTo);

  if (to && to < from) {
    throw new AppError("Invalid rate period", HTTP_STATUS.UNPROCESSABLE_ENTITY, "INVALID_PERIOD");
  }

  const overlap = await prisma.mealRate.findFirst({
    where: {
      ...rateKey,
      validFrom: {
        lte: to || new Date("9999-12-31T00:00:00.000Z")
      },
      OR: [{ validTo: null }, { validTo: { gte: from } }]
    }
  });

  if (overlap) {
    throw new AppError("Overlapping meal rate", HTTP_STATUS.CONFLICT, "MEAL_RATE_CONFLICT");
  }

  return prisma.$transaction(async (tx) => {
    const rate = await tx.mealRate.create({
      data: {
        ...(ageYears !== undefined && { ageYears }),
        ...(category !== undefined && { category }),
        amount: BigInt(amount),
        validFrom: from,
        validTo: to
      }
    });

    await auditService.createLog(
      {
        actorId: user.id,
        action: "CREATE",
        entityType: "MealRate",
        entityId: rate.id,
        after: rate
      },
      tx
    );

    return serializeRate(rate);
  });
}

async function ensureChildAccess(childId, periodStart, periodEnd, user) {
  if (!user || user.role !== "PARENT") {
    return;
  }

  const parent = await prisma.parent.findFirst({
    where: {
      userId: user.id,
      status: "ACTIVE"
    },
    select: {
      id: true
    }
  });

  if (!parent) {
    throw new AppError(
      "Parent profile not found",
      HTTP_STATUS.FORBIDDEN,
      "PARENT_PROFILE_NOT_FOUND"
    );
  }

  const relation = await prisma.childParent.findFirst({
    where: {
      childId,
      parentId: parent.id,
      startDate: { lte: periodEnd },
      OR: [{ endDate: null }, { endDate: { gte: periodStart } }]
    }
  });

  if (!relation) {
    throw new AppError(
      "You do not have access to this child",
      HTTP_STATUS.FORBIDDEN,
      "CHILD_ACCESS_DENIED"
    );
  }
}

async function calculateMealCost({ childId, periodStart, periodEnd, ageYears }, user) {
  const { from, to } = validatePeriod(periodStart, periodEnd);

  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: {
      id: true,
      birthDate: true,
      status: true
    }
  });

  if (!child || child.status !== "ACTIVE") {
    throw new AppError("Active child not found", HTTP_STATUS.NOT_FOUND, "CHILD_NOT_FOUND");
  }

  await ensureChildAccess(childId, from, to, user);

  const attendanceRecords = await prisma.attendance.findMany({
    where: { childId, date: { gte: from, lte: to }, status: { in: ["PRESENT", "LATE"] } },
    select: { date: true },
    orderBy: { date: "asc" }
  });

  const enrollments = await prisma.groupEnrollment.findMany({
    where: {
      childId,
      startDate: { lte: to },
      OR: [{ endDate: { isSet: false } }, { endDate: { gte: from } }]
    },
    include: { group: { select: { id: true, name: true, mealCategory: true } } },
    orderBy: { startDate: "asc" }
  });

  const rates = await prisma.mealRate.findMany({
    where: {
      validFrom: { lte: to },
      OR: [{ validTo: null }, { validTo: { gte: from } }]
    },
    orderBy: { validFrom: "desc" }
  });

  const breakdown = new Map();

  for (const attendance of attendanceRecords) {
    const attendanceDate = parseDay(attendance.date);
    const enrollment = enrollments.find((item) => {
      const startDate = parseDay(item.startDate);
      const endDate = item.endDate ? parseDay(item.endDate) : null;
      return startDate <= attendanceDate && (!endDate || endDate >= attendanceDate);
    });

    if (!enrollment || !enrollment.group?.mealCategory) {
      throw new AppError(
        `Meal category is not configured for the child's group on ${attendanceDate.toISOString().slice(0, 10)}`,
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        "MEAL_CATEGORY_NOT_CONFIGURED"
      );
    }

    const category = enrollment.group.mealCategory;
    const categoryAge = Number(category.slice(1));
    if (ageYears !== undefined && ageYears !== categoryAge) {
      throw new AppError(
        "Age category is determined by the child's group and does not match the requested value",
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        "MEAL_CATEGORY_MISMATCH"
      );
    }

    const rate = rates.find((item) => {
      const validFrom = parseDay(item.validFrom);
      const validTo = item.validTo ? parseDay(item.validTo) : null;
      const matchesCategory = item.category
        ? item.category === category
        : item.ageYears === categoryAge;
      return (
        matchesCategory && validFrom <= attendanceDate && (!validTo || validTo >= attendanceDate)
      );
    });

    if (!rate) {
      throw new AppError(
        `Meal rate ${category} not found for ${attendanceDate.toISOString().slice(0, 10)}`,
        HTTP_STATUS.NOT_FOUND,
        "MEAL_RATE_NOT_FOUND"
      );
    }

    const key = `${enrollment.groupId}:${rate.id}`;
    if (!breakdown.has(key)) {
      breakdown.set(key, {
        groupId: enrollment.groupId,
        groupName: enrollment.group.name,
        category,
        rateId: rate.id,
        ageYears: categoryAge,
        dailyRate: BigInt(rate.amount),
        attendedDays: 0,
        amount: 0n,
        validFrom: rate.validFrom,
        validTo: rate.validTo
      });
    }

    const item = breakdown.get(key);
    item.attendedDays += 1;
    item.amount += BigInt(rate.amount);
  }

  const rateBreakdown = Array.from(breakdown.values()).map((item) => ({
    ...item,
    dailyRate: item.dailyRate.toString(),
    amount: item.amount.toString()
  }));
  const total = rateBreakdown.reduce((sum, item) => sum + BigInt(item.amount), 0n);

  return {
    childId,
    periodStart: from.toISOString().slice(0, 10),
    periodEnd: to.toISOString().slice(0, 10),
    attendedDays: attendanceRecords.length,
    dailyRate: rateBreakdown.length === 1 ? rateBreakdown[0].dailyRate : null,
    rateId: rateBreakdown.length === 1 ? rateBreakdown[0].rateId : null,
    rateBreakdown,
    total: total.toString(),
    currency: "UAH",
    analyticsExpenseCategory: "FOOD"
  };
}

module.exports = {
  DEFAULT_RATES,
  calculateAge,
  validatePeriod,
  calculateAmount,
  getAllRates,
  getApplicableRate,
  createRate,
  calculateMealCost
};
