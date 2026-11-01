const prisma = require("../../config/prisma");
const AppError = require("../../utils/app-error");
const HTTP_STATUS = require("../../utils/http-status");

function fail(message, status, code) {
  throw new AppError(message, status, code);
}

function parseDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    fail("Invalid date", HTTP_STATUS.UNPROCESSABLE_ENTITY, "INVALID_DATE");
  }

  return date;
}

function getPeriod(from, to) {
  const start = parseDate(from);
  const end = parseDate(to);

  if (start > end) {
    fail("Period start is after period end", HTTP_STATUS.UNPROCESSABLE_ENTITY, "INVALID_PERIOD");
  }

  const endExclusive = new Date(end);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  return {
    start,
    end,
    endExclusive
  };
}

function sumBigInt(items, field) {
  return items.reduce((sum, item) => sum + BigInt(item[field]), 0n);
}

function serializeAmount(value) {
  return value.toString();
}

async function getSummary({ from, to }) {
  const { start, endExclusive } = getPeriod(from, to);

  const [invoices, payments, salaries, expenses] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        issuedAt: {
          gte: start,
          lt: endExclusive
        },
        status: {
          notIn: ["DRAFT", "CANCELLED"]
        }
      },
      include: {
        allocations: {
          where: {
            payment: {
              status: "COMPLETED"
            }
          },
          select: {
            amount: true
          }
        }
      }
    }),

    prisma.payment.findMany({
      where: {
        status: "COMPLETED",
        paidAt: {
          gte: start,
          lt: endExclusive
        }
      },
      select: {
        amount: true,
        paidAt: true
      }
    }),

    prisma.salaryCalculation.findMany({
      where: {
        status: "PAID",
        paidAt: {
          gte: start,
          lt: endExclusive
        }
      },
      select: {
        totalAmount: true,
        paidAt: true
      }
    }),

    prisma.expense.findMany({
      where: {
        expenseDate: {
          gte: start,
          lt: endExclusive
        }
      },
      select: {
        amount: true,
        expenseDate: true,
        category: true
      }
    })
  ]);

  const accruedAmount = sumBigInt(invoices, "amountDue");
  const receivedAmount = sumBigInt(payments, "amount");
  const salaryExpenses = sumBigInt(salaries, "totalAmount");
  const otherExpenses = sumBigInt(expenses, "amount");

  const totalExpenses = salaryExpenses + otherExpenses;
  const operatingProfit = receivedAmount - totalExpenses;

  let outstandingBalance = 0n;

  for (const invoice of invoices) {
    const paid = invoice.allocations.reduce((sum, allocation) => sum + allocation.amount, 0n);

    const balance = invoice.amountDue - paid;

    if (balance > 0n) {
      outstandingBalance += balance;
    }
  }

  const expensesByCategory = {};

  for (const expense of expenses) {
    expensesByCategory[expense.category] =
      (expensesByCategory[expense.category] || 0n) + expense.amount;
  }

  return {
    period: {
      from,
      to
    },
    invoices: {
      count: invoices.length,
      accruedAmount: serializeAmount(accruedAmount),
      outstandingBalance: serializeAmount(outstandingBalance)
    },
    payments: {
      count: payments.length,
      receivedAmount: serializeAmount(receivedAmount)
    },
    expenses: {
      salaries: serializeAmount(salaryExpenses),
      other: serializeAmount(otherExpenses),
      total: serializeAmount(totalExpenses),
      byCategory: Object.fromEntries(
        Object.entries(expensesByCategory).map(([category, amount]) => [
          category,
          serializeAmount(amount)
        ])
      )
    },
    operatingProfit: serializeAmount(operatingProfit),
    currency: "UAH"
  };
}

function getInvoicePeriod(invoice) {
  const start = new Date(Date.UTC(invoice.periodYear, invoice.periodMonth - 1, 1));

  const end =
    invoice.type === "ANNUAL"
      ? new Date(Date.UTC(invoice.periodYear + 1, invoice.periodMonth - 1, 0))
      : new Date(Date.UTC(invoice.periodYear, invoice.periodMonth, 0));

  return { start, end };
}

async function getGroupReport({ from, to }) {
  const { start, endExclusive } = getPeriod(from, to);

  const invoices = await prisma.invoice.findMany({
    where: {
      issuedAt: {
        gte: start,
        lt: endExclusive
      },
      status: {
        notIn: ["DRAFT", "CANCELLED"]
      }
    },
    include: {
      allocations: {
        where: {
          payment: {
            status: "COMPLETED"
          }
        },
        select: {
          amount: true
        }
      }
    }
  });

  const childIds = [...new Set(invoices.map((invoice) => invoice.childId))];

  const enrollments = childIds.length
    ? await prisma.groupEnrollment.findMany({
        where: {
          childId: {
            in: childIds
          }
        },
        include: {
          group: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: {
          startDate: "desc"
        }
      })
    : [];

  const groups = new Map();

  for (const invoice of invoices) {
    const { start: periodStart, end: periodEnd } = getInvoicePeriod(invoice);

    const enrollment = enrollments.find((item) => {
      return (
        item.childId === invoice.childId &&
        item.startDate <= periodEnd &&
        (!item.endDate || item.endDate >= periodStart)
      );
    });

    const groupId = enrollment?.group?.id || "WITHOUT_GROUP";
    const groupName = enrollment?.group?.name || "Без групи";

    if (!groups.has(groupId)) {
      groups.set(groupId, {
        groupId,
        groupName,
        invoiceCount: 0,
        accruedAmount: 0n,
        receivedAmount: 0n,
        outstandingBalance: 0n
      });
    }

    const group = groups.get(groupId);

    const paid = invoice.allocations.reduce((sum, allocation) => sum + allocation.amount, 0n);

    const balance = invoice.amountDue - paid;

    group.invoiceCount++;
    group.accruedAmount += invoice.amountDue;
    group.receivedAmount += paid;
    group.outstandingBalance += balance > 0n ? balance : 0n;
  }

  return {
    period: {
      from,
      to
    },
    groups: [...groups.values()].map((group) => ({
      groupId: group.groupId,
      groupName: group.groupName,
      invoiceCount: group.invoiceCount,
      accruedAmount: serializeAmount(group.accruedAmount),
      receivedAmount: serializeAmount(group.receivedAmount),
      outstandingBalance: serializeAmount(group.outstandingBalance)
    })),
    currency: "UAH"
  };
}

module.exports = {
  getSummary,
  getGroupReport
};
