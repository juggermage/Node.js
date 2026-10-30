const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/app-error");
const HTTP_STATUS = require("../../../utils/http-status");

const ROLE_RATES = {
  MANAGER: {
    type: "FIXED",
    baseAmount: 80000,
    perChildAmount: 0,
    childThreshold: null,
    extraChildBonusAmount: 0
  },
  TEACHER: {
    type: "FIXED",
    baseAmount: 40000,
    perChildAmount: 0,
    childThreshold: null,
    extraChildBonusAmount: 0
  },
  EDUCATOR: {
    type: "MIXED",
    baseAmount: 0,
    perChildAmount: 2000,
    childThreshold: 12,
    extraChildBonusAmount: 5000
  },
  ASSISTANT: {
    type: "MIXED",
    baseAmount: 20000,
    perChildAmount: 0,
    childThreshold: 12,
    extraChildBonusAmount: 3000
  }
};

function fail(message, status, code) {
  throw new AppError(message, status, code);
}

function toNumber(value) {
  return Number(value);
}

function serializeRate(rate) {
  return {
    ...rate,
    baseAmount: toNumber(rate.baseAmount),
    perChildAmount: toNumber(rate.perChildAmount),
    extraChildBonusAmount: toNumber(rate.extraChildBonusAmount)
  };
}

function serializeCalculation(calculation) {
  return {
    ...calculation,
    baseAmount: toNumber(calculation.baseAmount),
    perChildTotal: toNumber(calculation.perChildTotal),
    bonusAmount: toNumber(calculation.bonusAmount),
    totalAmount: toNumber(calculation.totalAmount)
  };
}

function getPeriodBounds(year, month) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    fail("Invalid period year", HTTP_STATUS.UNPROCESSABLE_ENTITY, "INVALID_PERIOD_YEAR");
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    fail("Invalid period month", HTTP_STATUS.UNPROCESSABLE_ENTITY, "INVALID_PERIOD_MONTH");
  }

  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1))
  };
}

function calculateSalary(role, rate, childrenCount = 0) {
  if (!Number.isInteger(childrenCount) || childrenCount < 0) {
    fail(
      "Children count must be a non-negative integer",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "INVALID_CHILDREN_COUNT"
    );
  }

  const baseAmount = toNumber(rate.baseAmount);
  const perChildAmount = toNumber(rate.perChildAmount);
  const extraChildBonusAmount = toNumber(rate.extraChildBonusAmount);
  const threshold = rate.childThreshold ?? 0;

  if (
    ![baseAmount, perChildAmount, extraChildBonusAmount].every(
      (value) => Number.isSafeInteger(value) && value >= 0
    )
  ) {
    fail("Invalid salary rate", HTTP_STATUS.UNPROCESSABLE_ENTITY, "INVALID_SALARY_RATE");
  }

  if (role === "MANAGER" || role === "TEACHER") {
    return {
      childrenCount: 0,
      baseAmount,
      perChildTotal: 0,
      extraChildrenCount: 0,
      bonusAmount: 0,
      totalAmount: baseAmount
    };
  }

  if (role !== "EDUCATOR" && role !== "ASSISTANT") {
    fail("Unsupported employee role", HTTP_STATUS.UNPROCESSABLE_ENTITY, "UNSUPPORTED_ROLE");
  }

  const perChildTotal = perChildAmount * childrenCount;
  const extraChildrenCount = Math.max(0, childrenCount - threshold);
  const bonusAmount = extraChildrenCount * extraChildBonusAmount;
  const totalAmount = baseAmount + perChildTotal + bonusAmount;

  if (![perChildTotal, bonusAmount, totalAmount].every(Number.isSafeInteger)) {
    fail(
      "Calculated salary exceeds the safe integer range",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "SALARY_AMOUNT_OVERFLOW"
    );
  }

  return {
    childrenCount,
    baseAmount,
    perChildTotal,
    extraChildrenCount,
    bonusAmount,
    totalAmount
  };
}

async function getRates({ employeeId } = {}) {
  const rates = await prisma.salaryRate.findMany({
    where: employeeId ? { employeeId } : {},
    include: { employee: true },
    orderBy: [{ validFrom: "desc" }]
  });

  return rates.map(serializeRate);
}

async function createRate({ employeeId, validFrom, validTo = null }) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });

  if (!employee || employee.status !== "ACTIVE") {
    fail("Active employee not found", HTTP_STATUS.NOT_FOUND, "EMPLOYEE_NOT_FOUND");
  }

  const roleRate = ROLE_RATES[employee.role];

  if (!roleRate) {
    fail("Unsupported employee role", HTTP_STATUS.UNPROCESSABLE_ENTITY, "UNSUPPORTED_ROLE");
  }

  const startDate = new Date(validFrom);
  const endDate = validTo ? new Date(validTo) : null;

  if (Number.isNaN(startDate.getTime()) || (endDate && endDate <= startDate)) {
    fail("Invalid salary rate dates", HTTP_STATUS.UNPROCESSABLE_ENTITY, "INVALID_RATE_DATES");
  }

  return prisma.$transaction(async (tx) => {
    const overlappingRates = await tx.salaryRate.findMany({
      where: {
        employeeId,
        validFrom: { lt: endDate || new Date("9999-12-31T00:00:00.000Z") },
        OR: [{ validTo: null }, { validTo: { gt: startDate } }]
      },
      orderBy: { validFrom: "desc" }
    });

    const futureOrConflictingRate = overlappingRates.find((rate) => rate.validFrom >= startDate);

    if (futureOrConflictingRate) {
      fail(
        "Salary rate overlaps with an existing rate",
        HTTP_STATUS.CONFLICT,
        "SALARY_RATE_OVERLAP"
      );
    }

    const previousOpenRate = overlappingRates.find(
      (rate) => rate.validFrom < startDate && rate.validTo === null
    );

    if (previousOpenRate) {
      await tx.salaryRate.update({
        where: { id: previousOpenRate.id },
        data: { validTo: startDate }
      });
    }

    const rate = await tx.salaryRate.create({
      data: {
        employeeId,
        type: roleRate.type,
        baseAmount: BigInt(roleRate.baseAmount),
        perChildAmount: BigInt(roleRate.perChildAmount),
        childThreshold: roleRate.childThreshold,
        extraChildBonusAmount: BigInt(roleRate.extraChildBonusAmount),
        validFrom: startDate,
        validTo: endDate
      },
      include: { employee: true }
    });

    return serializeRate(rate);
  });
}

async function getEmployeeRate(tx, employeeId, periodStart) {
  const rate = await tx.salaryRate.findFirst({
    where: {
      employeeId,
      validFrom: { lte: periodStart },
      OR: [{ validTo: null }, { validTo: { gt: periodStart } }]
    },
    orderBy: { validFrom: "desc" }
  });

  if (!rate) {
    fail(
      "Salary rate not found for the calculation period",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "SALARY_RATE_NOT_FOUND"
    );
  }

  return rate;
}

async function getChildrenCount(tx, groupId, periodStart) {
  return tx.groupEnrollment.count({
    where: {
      groupId,
      startDate: { lte: periodStart },
      OR: [{ endDate: null }, { endDate: { gt: periodStart } }]
    }
  });
}

async function getEmployeeChildrenCount(tx, employee, periodStart) {
  if (employee.role === "MANAGER" || employee.role === "TEACHER") {
    return 0;
  }

  const assignments = await tx.staffAssignment.findMany({
    where: {
      employeeId: employee.id,
      role: employee.role,
      startDate: { lte: periodStart },
      OR: [{ endDate: null }, { endDate: { gt: periodStart } }]
    }
  });

  if (assignments.length === 0) {
    fail(
      "Staff assignment not found for the calculation period",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "STAFF_ASSIGNMENT_NOT_FOUND"
    );
  }

  if (assignments.length > 1) {
    fail(
      "Employee has multiple active group assignments for the calculation period",
      HTTP_STATUS.CONFLICT,
      "MULTIPLE_STAFF_ASSIGNMENTS"
    );
  }

  return getChildrenCount(tx, assignments[0].groupId, periodStart);
}

async function calculateEmployeeSalary(tx, employee, periodYear, periodMonth, periodStart) {
  const rate = await getEmployeeRate(tx, employee.id, periodStart);
  const childrenCount = await getEmployeeChildrenCount(tx, employee, periodStart);
  const result = calculateSalary(employee.role, rate, childrenCount);

  const rateSnapshot = {
    rateId: rate.id,
    type: rate.type,
    baseAmount: toNumber(rate.baseAmount),
    perChildAmount: toNumber(rate.perChildAmount),
    childThreshold: rate.childThreshold,
    extraChildBonusAmount: toNumber(rate.extraChildBonusAmount),
    validFrom: rate.validFrom.toISOString(),
    validTo: rate.validTo ? rate.validTo.toISOString() : null
  };

  const calculation = await tx.salaryCalculation.create({
    data: {
      employeeId: employee.id,
      periodYear,
      periodMonth,
      childrenCount: result.childrenCount,
      baseAmount: BigInt(result.baseAmount),
      perChildTotal: BigInt(result.perChildTotal),
      extraChildrenCount: result.extraChildrenCount,
      bonusAmount: BigInt(result.bonusAmount),
      totalAmount: BigInt(result.totalAmount),
      rateSnapshot,
      status: "DRAFT"
    },
    include: { employee: true }
  });

  return serializeCalculation(calculation);
}

async function createCalculations({ periodYear, periodMonth, employeeId }) {
  const { start } = getPeriodBounds(periodYear, periodMonth);

  try {
    return await prisma.$transaction(async (tx) => {
      const employees = await tx.employee.findMany({
        where: {
          status: "ACTIVE",
          ...(employeeId ? { id: employeeId } : {})
        },
        orderBy: [{ role: "asc" }, { lastName: "asc" }, { firstName: "asc" }]
      });

      if (employeeId && employees.length === 0) {
        fail("Active employee not found", HTTP_STATUS.NOT_FOUND, "EMPLOYEE_NOT_FOUND");
      }

      const calculations = [];

      for (const employee of employees) {
        calculations.push(
          await calculateEmployeeSalary(tx, employee, periodYear, periodMonth, start)
        );
      }

      return calculations;
    });
  } catch (error) {
    if (error.code === "P2002") {
      fail(
        "Salary calculation already exists for this employee and period",
        HTTP_STATUS.CONFLICT,
        "SALARY_CALCULATION_EXISTS"
      );
    }

    throw error;
  }
}

async function getCalculations(query = {}) {
  const where = {};

  if (query.employeeId) where.employeeId = query.employeeId;
  if (query.periodYear !== undefined) where.periodYear = Number(query.periodYear);
  if (query.periodMonth !== undefined) where.periodMonth = Number(query.periodMonth);
  if (query.status) where.status = query.status;

  const calculations = await prisma.salaryCalculation.findMany({
    where,
    include: { employee: true },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }, { calculatedAt: "desc" }]
  });

  return calculations.map(serializeCalculation);
}

async function getCalculationById(id) {
  const calculation = await prisma.salaryCalculation.findUnique({
    where: { id },
    include: { employee: true }
  });

  if (!calculation) {
    fail("Salary calculation not found", HTTP_STATUS.NOT_FOUND, "SALARY_CALCULATION_NOT_FOUND");
  }

  return serializeCalculation(calculation);
}

async function cancelCalculation(id) {
  const calculation = await prisma.salaryCalculation.findUnique({ where: { id } });

  if (!calculation) {
    fail("Salary calculation not found", HTTP_STATUS.NOT_FOUND, "SALARY_CALCULATION_NOT_FOUND");
  }

  if (calculation.status === "PAID") {
    fail(
      "Paid salary calculation cannot be cancelled",
      HTTP_STATUS.CONFLICT,
      "PAID_CALCULATION_CANNOT_BE_CANCELLED"
    );
  }

  if (calculation.status === "CANCELLED") {
    fail(
      "Salary calculation is already cancelled",
      HTTP_STATUS.CONFLICT,
      "SALARY_CALCULATION_ALREADY_CANCELLED"
    );
  }

  const updated = await prisma.salaryCalculation.update({
    where: { id },
    data: { status: "CANCELLED" },
    include: { employee: true }
  });

  return serializeCalculation(updated);
}

module.exports = {
  getRates,
  createRate,
  createCalculations,
  getCalculations,
  getCalculationById,
  cancelCalculation
};
