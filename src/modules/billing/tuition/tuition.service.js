const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/app-error");
const HTTP_STATUS = require("../../../utils/http-status");
const auditService = require("../../audit/audit.service");

const DEFAULT_TUITION_RATE = 15000;
const ANNUAL_PREPAYMENT_DISCOUNT = 12;
const ALLOWED_DISCOUNTS = [10, 20, 30];
const DAY_MS = 86400000;

function fail(message, status, code) {
  throw new AppError(message, status, code);
}

function parseDay(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  const validFormat = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

  const date = validFormat ? new Date(`${value}T00:00:00.000Z`) : new Date(NaN);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    fail("Invalid date", HTTP_STATUS.UNPROCESSABLE_ENTITY, "INVALID_DATE");
  }

  return date;
}

function validatePeriod(start, end) {
  const from = parseDay(start);
  const to = parseDay(end);

  if (from > to) {
    fail("Period start is after period end", HTTP_STATUS.UNPROCESSABLE_ENTITY, "INVALID_PERIOD");
  }

  return {
    from,
    to,
    days: Math.round((to - from) / DAY_MS) + 1
  };
}

function roundPercentage(amount, percentage) {
  return (amount * BigInt(100 - percentage) + 50n) / 100n;
}

function serializeRate(rate) {
  return {
    ...rate,
    amount: rate.amount.toString()
  };
}

function serializeDiscount(discount) {
  return {
    id: discount.id,
    name: discount.name,
    percentage: discount.percentage
  };
}

async function getAllRates({ onDate } = {}) {
  const where = {};

  if (onDate) {
    const date = parseDay(onDate);

    where.validFrom = {
      lte: date
    };

    where.OR = [{ validTo: null }, { validTo: { gte: date } }];
  }

  const rates = await prisma.tuitionRate.findMany({
    where,
    orderBy: {
      validFrom: "desc"
    }
  });

  return rates.map(serializeRate);
}

async function getApplicableRate(onDate) {
  const date = parseDay(onDate);

  const rate = await prisma.tuitionRate.findFirst({
    where: {
      validFrom: {
        lte: date
      },
      OR: [{ validTo: null }, { validTo: { gte: date } }]
    },
    orderBy: {
      validFrom: "desc"
    }
  });

  if (!rate) {
    fail("Tuition rate not found", HTTP_STATUS.NOT_FOUND, "TUITION_RATE_NOT_FOUND");
  }

  return rate;
}

async function getRateForPeriod(from, to) {
  const rate = await getApplicableRate(from);

  if (rate.validFrom > from || (rate.validTo && rate.validTo < to)) {
    fail("Rate changes during period", HTTP_STATUS.CONFLICT, "RATE_PERIOD_CONFLICT");
  }

  return rate;
}

async function createRate({ name, amount, validFrom, validTo = null }, actorId) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    fail("Invalid tuition rate", HTTP_STATUS.UNPROCESSABLE_ENTITY, "INVALID_TUITION_RATE");
  }

  const normalizedName = name.trim();

  if (!normalizedName) {
    fail("Rate name is required", HTTP_STATUS.UNPROCESSABLE_ENTITY, "INVALID_RATE_NAME");
  }

  const from = parseDay(validFrom);
  const to = validTo === null ? null : parseDay(validTo);

  if (to && to < from) {
    fail("Invalid rate period", HTTP_STATUS.UNPROCESSABLE_ENTITY, "INVALID_PERIOD");
  }

  return prisma.$transaction(async (tx) => {
    const overlap = await tx.tuitionRate.findFirst({
      where: {
        validFrom: {
          lte: to || new Date("9999-12-31T00:00:00.000Z")
        },
        OR: [{ validTo: null }, { validTo: { gte: from } }]
      }
    });

    if (overlap) {
      fail("Overlapping tuition rate", HTTP_STATUS.CONFLICT, "TUITION_RATE_CONFLICT");
    }

    const rate = await tx.tuitionRate.create({
      data: {
        name: normalizedName,
        amount: BigInt(amount),
        validFrom: from,
        validTo: to
      }
    });

    await auditService.createLog(
      {
        actorId,
        action: "CREATE",
        entityType: "TuitionRate",
        entityId: rate.id,
        after: rate
      },
      tx
    );

    return serializeRate(rate);
  });
}

async function getApplicableDiscount(childId, from, to) {
  const assignments = await prisma.childDiscount.findMany({
    where: {
      childId,
      validFrom: {
        lte: to
      },
      OR: [{ validTo: null }, { validTo: { gte: from } }],
      discount: {
        isActive: true
      }
    },
    include: {
      discount: true
    }
  });

  const applicable = assignments.filter(({ discount, validFrom, validTo }) => {
    return (
      discount.type === "PERCENTAGE" &&
      ALLOWED_DISCOUNTS.includes(discount.percentage) &&
      validFrom <= from &&
      (!validTo || validTo >= to)
    );
  });

  if (applicable.length > 1) {
    fail(
      "More than one applicable discount assigned to child",
      HTTP_STATUS.CONFLICT,
      "MULTIPLE_DISCOUNTS"
    );
  }

  return applicable.length ? applicable[0].discount : null;
}

async function getActiveChild(childId) {
  const child = await prisma.child.findUnique({
    where: {
      id: childId
    },
    select: {
      id: true,
      status: true
    }
  });

  if (!child || child.status !== "ACTIVE") {
    fail("Active child not found", HTTP_STATUS.NOT_FOUND, "CHILD_NOT_FOUND");
  }

  return child;
}

function calculateDiscountedAmount(baseAmount, discountPercentage) {
  if (!ALLOWED_DISCOUNTS.includes(discountPercentage)) {
    fail("Invalid discount value", HTTP_STATUS.UNPROCESSABLE_ENTITY, "INVALID_DISCOUNT_VALUE");
  }

  return roundPercentage(baseAmount, discountPercentage);
}

function buildCalculation({
  childId,
  rate,
  periodStart,
  periodEnd,
  months,
  discount,
  annualPrepayment
}) {
  const monthlyAmount = rate.amount;
  const baseAmount = monthlyAmount * BigInt(months);

  const regularDiscountPercentage = discount ? discount.percentage : 0;

  const afterRegularDiscount = regularDiscountPercentage
    ? calculateDiscountedAmount(baseAmount, regularDiscountPercentage)
    : baseAmount;

  const annualDiscountAmount = annualPrepayment
    ? afterRegularDiscount - roundPercentage(afterRegularDiscount, ANNUAL_PREPAYMENT_DISCOUNT)
    : 0n;

  const total = afterRegularDiscount - annualDiscountAmount;

  return {
    childId,
    rate: serializeRate(rate),
    periodStart: periodStart.toISOString().slice(0, 10),
    periodEnd: periodEnd.toISOString().slice(0, 10),
    months,
    monthlyAmount: monthlyAmount.toString(),
    baseAmount: baseAmount.toString(),
    discount: discount
      ? {
          ...serializeDiscount(discount),
          amount: (baseAmount - afterRegularDiscount).toString()
        }
      : null,
    annualPrepaymentDiscount: annualPrepayment
      ? {
          percentage: ANNUAL_PREPAYMENT_DISCOUNT,
          amount: annualDiscountAmount.toString()
        }
      : null,
    total: total.toString(),
    currency: "UAH"
  };
}

async function calculateMonthlyTuitionCost({ childId, periodStart, periodEnd }) {
  const { from, to } = validatePeriod(periodStart, periodEnd);

  await getActiveChild(childId);

  const isFullMonth =
    from.getUTCDate() === 1 &&
    to.getUTCDate() ===
      new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() + 1, 0)).getUTCDate() &&
    from.getUTCMonth() === to.getUTCMonth() &&
    from.getUTCFullYear() === to.getUTCFullYear();

  if (!isFullMonth) {
    fail(
      "Tuition calculation requires a full calendar month",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "INVALID_TUITION_PERIOD"
    );
  }

  const rate = await getRateForPeriod(from, to);
  const discount = await getApplicableDiscount(childId, from, to);

  return buildCalculation({
    childId,
    rate,
    periodStart: from,
    periodEnd: to,
    months: 1,
    discount,
    annualPrepayment: false
  });
}

async function calculateAnnualTuitionCost({ childId, periodStart }) {
  const from = parseDay(periodStart);

  if (from.getUTCDate() !== 1) {
    fail(
      "Annual period must start on the first day of a month",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "INVALID_TUITION_PERIOD"
    );
  }

  const to = new Date(Date.UTC(from.getUTCFullYear() + 1, from.getUTCMonth(), 0));

  await getActiveChild(childId);

  const rate = await getRateForPeriod(from, to);
  const discount = await getApplicableDiscount(childId, from, to);

  return buildCalculation({
    childId,
    rate,
    periodStart: from,
    periodEnd: to,
    months: 12,
    discount,
    annualPrepayment: true
  });
}

module.exports = {
  DEFAULT_TUITION_RATE,
  ANNUAL_PREPAYMENT_DISCOUNT,
  getAllRates,
  getApplicableRate,
  createRate,
  calculateMonthlyTuitionCost,
  calculateAnnualTuitionCost,
  validatePeriod,
  roundPercentage
};
