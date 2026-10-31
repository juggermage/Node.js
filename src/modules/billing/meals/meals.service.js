const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/app-error");
const HTTP_STATUS = require("../../../utils/http-status");

const DEFAULT_RATES = Object.freeze({ 2: 300, 3: 400, 4: 500, 5: 600 });
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
  return new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function checkAge(ageYears) {
  if (!Number.isInteger(ageYears) || ageYears < 2 || ageYears > 5) {
    throw new AppError("Age category must be A2-A5", HTTP_STATUS.UNPROCESSABLE_ENTITY, "INVALID_AGE_CATEGORY");
  }
}

function calculateAge(birthDate, date) {
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime()) || birth > date) throw new AppError("Invalid birth date", 422, "INVALID_BIRTH_DATE");
  let age = date.getUTCFullYear() - birth.getUTCFullYear();
  if (date.getUTCMonth() < birth.getUTCMonth() || (date.getUTCMonth() === birth.getUTCMonth() && date.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

function validatePeriod(start, end) {
  const from = parseDay(start);
  const to = parseDay(end);
  if (from > to) throw new AppError("Period start is after period end", 422, "INVALID_PERIOD");
  return { from, to, days: Math.round((to - from) / DAY_MS) + 1 };
}

function calculateAmount(rate, attendedDays, maximumDays) {
  if (!Number.isInteger(attendedDays) || attendedDays < 0 || attendedDays > maximumDays) {
    throw new AppError("Invalid attendance days", 422, "INVALID_ATTENDANCE_DAYS");
  }
  if (typeof rate !== "bigint" && (!Number.isSafeInteger(rate) || rate <= 0)) {
    throw new AppError("Invalid meal rate", 422, "INVALID_MEAL_RATE");
  }
  const amount = BigInt(rate);
  if (amount <= 0n) throw new AppError("Invalid meal rate", 422, "INVALID_MEAL_RATE");
  return amount * BigInt(attendedDays);
}

function serializeRate(rate) {
  return { ...rate, amount: rate.amount.toString() };
}

async function getAllRates({ ageYears, onDate } = {}) {
  if (ageYears !== undefined) checkAge(ageYears);
  const where = {};
  if (ageYears !== undefined) where.ageYears = ageYears;
  if (onDate) {
    const date = parseDay(onDate);
    where.validFrom = { lte: date };
    where.OR = [{ validTo: null }, { validTo: { gte: date } }];
  }
  const rates = await prisma.mealRate.findMany({ where, orderBy: [{ ageYears: "asc" }, { validFrom: "desc" }] });
  return rates.map(serializeRate);
}

async function getApplicableRate(ageYears, onDate) {
  checkAge(ageYears);
  const date = parseDay(onDate);
  const rate = await prisma.mealRate.findFirst({
    where: { ageYears, validFrom: { lte: date }, OR: [{ validTo: null }, { validTo: { gte: date } }] },
    orderBy: { validFrom: "desc" }
  });
  if (!rate) throw new AppError("Meal rate not found", 404, "MEAL_RATE_NOT_FOUND");
  return rate;
}

async function createRate({ ageYears, amount, validFrom, validTo = null }) {
  checkAge(ageYears);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new AppError("Invalid meal rate", 422, "INVALID_MEAL_RATE");
  const from = parseDay(validFrom);
  const to = validTo === null ? null : parseDay(validTo);
  if (to && to < from) throw new AppError("Invalid rate period", 422, "INVALID_PERIOD");
  const overlap = await prisma.mealRate.findFirst({
    where: { ageYears, validFrom: { lte: to || new Date("9999-12-31T00:00:00.000Z") }, OR: [{ validTo: null }, { validTo: { gte: from } }] }
  });
  if (overlap) throw new AppError("Overlapping meal rate", 409, "MEAL_RATE_CONFLICT");
  const rate = await prisma.mealRate.create({ data: { ageYears, amount: BigInt(amount), validFrom: from, validTo: to } });
  return serializeRate(rate);
}

async function calculateMealCost({ childId, periodStart, periodEnd, attendedDays, ageYears }) {
  const { from, to, days } = validatePeriod(periodStart, periodEnd);
  if (!Number.isInteger(attendedDays) || attendedDays < 0 || attendedDays > days) throw new AppError("Invalid attendance days", 422, "INVALID_ATTENDANCE_DAYS");
  const child = await prisma.child.findUnique({ where: { id: childId }, select: { id: true, birthDate: true, status: true } });
  if (!child || child.status === "ARCHIVED") throw new AppError("Child not found", 404, "CHILD_NOT_FOUND");
  const actualAge = calculateAge(child.birthDate, from);
  if (ageYears !== undefined && ageYears !== actualAge) throw new AppError("Age category does not match child", 422, "AGE_CATEGORY_MISMATCH");
  const category = actualAge;
  checkAge(category);
  const rate = await getApplicableRate(category, from);
  if (parseDay(rate.validFrom) > from || (rate.validTo && parseDay(rate.validTo) < to)) throw new AppError("Rate changes during period", 409, "RATE_PERIOD_CONFLICT");
  const total = calculateAmount(rate.amount, attendedDays, days);
  return { childId, ageYears: category, periodStart: from.toISOString().slice(0, 10), periodEnd: to.toISOString().slice(0, 10), attendedDays, rateId: rate.id, dailyRate: rate.amount.toString(), total: total.toString(), currency: "UAH" };
}

module.exports = { DEFAULT_RATES, calculateAge, validatePeriod, calculateAmount, getAllRates, getApplicableRate, createRate, calculateMealCost };