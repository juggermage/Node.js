const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/app-error");
const HTTP_STATUS = require("../../../utils/http-status");
const auditService = require("../../audit/audit.service");

function toUtcDate(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function serialize(expense) {
  return {
    ...expense,
    amount: Number(expense.amount)
  };
}

async function getAll({ category, groupId, from, to } = {}) {
  const where = {};

  if (category) {
    where.category = category;
  }

  if (groupId) {
    where.groupId = groupId;
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
  const expense = await prisma.expense.findUnique({
    where: { id }
  });

  if (!expense) {
    throw new AppError("Expense not found", HTTP_STATUS.NOT_FOUND, "EXPENSE_NOT_FOUND");
  }

  return serialize(expense);
}

async function create({ category, description, amount, expenseDate, groupId }, actorId) {
  return prisma.$transaction(async (tx) => {
    if (groupId) {
      const group = await tx.group.findUnique({ where: { id: groupId } });
      if (!group) {
        throw new AppError("Group not found", HTTP_STATUS.NOT_FOUND, "GROUP_NOT_FOUND");
      }
    }

    const expense = await tx.expense.create({
      data: {
        ...(groupId ? { group: { connect: { id: groupId } } } : {}),
        category,
        description,
        amount: BigInt(amount),
        expenseDate: toUtcDate(expenseDate)
      }
    });

    await auditService.createLog(
      {
        actorId,
        action: "CREATE",
        entityType: "Expense",
        entityId: expense.id,
        after: expense
      },
      tx
    );

    return serialize(expense);
  });
}

module.exports = {
  getAll,
  getById,
  create
};
