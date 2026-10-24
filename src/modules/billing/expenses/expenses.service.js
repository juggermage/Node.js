const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/app-error");
const HTTP_STATUS = require("../../../utils/http-status");

function toUtcDate(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

// amount у базі має тип BigInt, а JSON.stringify не вміє працювати з BigInt.
function serialize(expense) {
  return { ...expense, amount: Number(expense.amount) };
}

async function getAll({ category, from, to } = {}) {
  const where = {};

  if (category) {
    where.category = category;
  }

  if (from || to) {
    where.expenseDate = {};

    if (from) {
      where.expenseDate.gte = toUtcDate(from);
    }

    if (to) {
      const nextDay = toUtcDate(to);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      where.expenseDate.lt = nextDay;
    }
  }

  const expenses = await prisma.expense.findMany({
    where,
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }]
  });

  return expenses.map(serialize);
}

async function getById(id) {
  const expense = await prisma.expense.findUnique({ where: { id } });

  if (!expense) {
    throw new AppError("Expense not found", HTTP_STATUS.NOT_FOUND, "EXPENSE_NOT_FOUND");
  }

  return serialize(expense);
}

async function create({ category, description, amount, expenseDate }) {
  const expense = await prisma.expense.create({
    data: {
      category,
      description,
      amount: BigInt(amount),
      expenseDate: toUtcDate(expenseDate)
    }
  });

  return serialize(expense);
}

module.exports = {
  getAll,
  getById,
  create
};
