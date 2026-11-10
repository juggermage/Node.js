const prisma = require("../../config/prisma");
const AppError = require("../../utils/app-error");
const HTTP_STATUS = require("../../utils/http-status");

const {
  getInvoicePaidAmount,
} = require("../billing/credit-balance.service");

const ROOM_COST_PER_MONTH = 50000n;
const INCOME_CATEGORIES = ["TUITION", "MEALS", "OTHER"];

function fail(
  message,
  status = HTTP_STATUS.UNPROCESSABLE_ENTITY,
  code = "INVALID_ANALYTICS_QUERY",
) {
  throw new AppError(message, status, code);
}

function parseDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    fail(
      "Invalid date. Expected YYYY-MM-DD",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "INVALID_DATE",
    );
  }
  return date;
}

function getPeriod(query) {
  let start;
  let end;
  if (query.from && query.to) {
    start = parseDate(query.from);
    end = parseDate(query.to);
  } else {
    const year = Number(query.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      fail(
        "A valid year is required",
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        "INVALID_YEAR",
      );
    }
    if (query.periodType === "MONTH") {
      const month = Number(query.month);
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        fail(
          "A valid month is required for MONTH reports",
          HTTP_STATUS.UNPROCESSABLE_ENTITY,
          "INVALID_MONTH",
        );
      }
      start = new Date(Date.UTC(year, month - 1, 1));
      end = new Date(Date.UTC(year, month, 0));
    } else if (query.periodType === "QUARTER") {
      const quarter = Number(query.quarter);
      if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
        fail(
          "A valid quarter is required for QUARTER reports",
          HTTP_STATUS.UNPROCESSABLE_ENTITY,
          "INVALID_QUARTER",
        );
      }
      start = new Date(Date.UTC(year, (quarter - 1) * 3, 1));
      end = new Date(Date.UTC(year, quarter * 3, 0));
    } else if (query.periodType === "YEAR") {
      start = new Date(Date.UTC(year, 0, 1));
      end = new Date(Date.UTC(year, 11, 31));
    } else {
      fail(
        "Specify from/to or periodType with year",
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        "PERIOD_REQUIRED",
      );
    }
  }
  if (start > end) {
    fail(
      "Period start must not be after period end",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "INVALID_PERIOD",
    );
  }
  const endExclusive = new Date(end);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return {
    start,
    end,
    endExclusive,
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

function amount(value) {
  return BigInt(value || 0);
}

function serialize(value) {
  return value.toString();
}

function calculateDifference(current, previous) {
  return (BigInt(current || 0) - BigInt(previous || 0)).toString();
}

function sum(items, field) {
  return items.reduce((total, item) => total + amount(item[field]), 0n);
}

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthRange(start, end) {
  const months = [];
  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
  );
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cursor <= last) {
    months.push({
      year: cursor.getUTCFullYear(),
      month: cursor.getUTCMonth() + 1,
      key: monthKey(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1),
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

function classifyInvoiceLine(line) {
  const text =
    `${line.description || ""} ${JSON.stringify(line.tariffSnapshot || {})}`.toLowerCase();
  if (text.includes("харч") || text.includes("meal") || text.includes("food"))
    return "MEALS";
  if (
    text.includes("навчан") ||
    text.includes("tuition") ||
    text.includes("річн")
  )
    return "TUITION";
  return "OTHER";
}

function allocateProportionally(total, lines) {
  const positiveLines = lines.filter((line) => amount(line.amount) > 0n);
  const lineTotal = positiveLines.reduce(
    (result, line) => result + amount(line.amount),
    0n,
  );
  if (lineTotal <= 0n) return { TUITION: 0n, MEALS: 0n, OTHER: total };
  const result = { TUITION: 0n, MEALS: 0n, OTHER: 0n };
  let allocated = 0n;
  positiveLines.forEach((line, index) => {
    const part =
      index === positiveLines.length - 1
        ? total - allocated
        : (total * amount(line.amount)) / lineTotal;
    result[classifyInvoiceLine(line)] += part;
    allocated += part;
  });
  return result;
}

function addTo(target, key, value) {
  target[key] = (target[key] || 0n) + value;
}

function lineAccrualForMonth(invoice, line, month) {
  const lineAmount = amount(line.amount);
  if (invoice.type !== "ANNUAL")
    return month.year === invoice.periodYear &&
      month.month === invoice.periodMonth
      ? lineAmount
      : 0n;
  if (classifyInvoiceLine(line) !== "TUITION")
    return month.year === invoice.periodYear &&
      month.month === invoice.periodMonth
      ? lineAmount
      : 0n;
  const firstMonth = invoice.periodMonth;
  const startIndex = invoice.periodYear * 12 + firstMonth - 1;
  const currentIndex = month.year * 12 + month.month - 1;
  const offset = currentIndex - startIndex;
  if (offset < 0 || offset >= 12) return 0n;
  const base = lineAmount / 12n;
  const remainder = lineAmount % 12n;
  return base + (offset === 11 ? remainder : 0n);
}

async function getInvoicesForAccrual(period) {
  return prisma.invoice.findMany({
    where: {
      status: { notIn: ["DRAFT", "CANCELLED"] },
      OR: [
        {
          type: "MONTHLY",
          periodYear: {
            gte: period.start.getUTCFullYear(),
            lte: period.end.getUTCFullYear(),
          },
        },
        {
          type: "ANNUAL",
          periodYear: {
            gte: period.start.getUTCFullYear() - 1,
            lte: period.end.getUTCFullYear(),
          },
        },
      ],
    },
    include: {
      lines: true,
      child: { select: { id: true } },
      allocations: {
        where: { payment: { status: "COMPLETED" } },
        select: {
          amount: true,
          payment: { select: { paidAt: true, status: true } },
        },
      },
    },
  });
}

function isMonthInPeriod(month, period) {
  const first = new Date(Date.UTC(month.year, month.month - 1, 1));
  const last = new Date(Date.UTC(month.year, month.month, 0));
  return first <= period.end && last >= period.start;
}

async function getAccruedIncome(period) {
  const invoices = await getInvoicesForAccrual(period);
  const categories = { TUITION: 0n, MEALS: 0n, OTHER: 0n };
  const byMonth = {};
  const months = monthRange(period.start, period.end);
  for (const invoice of invoices) {
    for (const month of months) {
      if (!isMonthInPeriod(month, period)) continue;
      for (const line of invoice.lines) {
        const value = lineAccrualForMonth(invoice, line, month);
        if (value <= 0n) continue;
        const category = classifyInvoiceLine(line);
        addTo(categories, category, value);
        if (!byMonth[month.key])
          byMonth[month.key] = { TUITION: 0n, MEALS: 0n, OTHER: 0n };
        addTo(byMonth[month.key], category, value);
      }
    }
  }
  const adjustmentMeta = prisma._runtimeDataModel?.models?.InvoiceAdjustment;
  if (prisma.invoiceAdjustment && adjustmentMeta && invoices.length) {
    const invoiceField = adjustmentMeta.fields.some(
      (field) => field.name === "invoiceId",
    )
      ? "invoiceId"
      : adjustmentMeta.fields.some(
            (field) => field.name === "originalInvoiceId",
          )
        ? "originalInvoiceId"
        : null;
    if (invoiceField) {
      const adjustments = await prisma.invoiceAdjustment.findMany({
        where: { createdAt: { gte: period.start, lt: period.endExclusive } },
        orderBy: { createdAt: "asc" },
      });
      const invoiceById = new Map(
        invoices.map((invoice) => [invoice.id, invoice]),
      );
      for (const adjustment of adjustments) {
        const invoice = invoiceById.get(adjustment[invoiceField]);
        if (!invoice) continue;
        const delta =
          amount(adjustment.adjustedAmount) - amount(adjustment.previousAmount);
        if (delta === 0n) continue;
        const split = allocateProportionally(delta, invoice.lines || []);
        const month = {
          year: adjustment.createdAt.getUTCFullYear(),
          month: adjustment.createdAt.getUTCMonth() + 1,
        };
        const key = monthKey(month.year, month.month);
        if (!byMonth[key]) byMonth[key] = { TUITION: 0n, MEALS: 0n, OTHER: 0n };
        for (const category of INCOME_CATEGORIES) {
          addTo(categories, category, split[category]);
          addTo(byMonth[key], category, split[category]);
        }
      }
    }
  }
  return { invoices, categories, byMonth };
}

async function getCashIncome(period) {
  const allocations = await prisma.paymentAllocation.findMany({
    where: {
      payment: {
        status: "COMPLETED",
        paidAt: { gte: period.start, lt: period.endExclusive },
      },
    },
    include: {
      payment: { select: { id: true, paidAt: true, amount: true } },
      invoice: { include: { lines: true } },
    },
  });
  const categories = { TUITION: 0n, MEALS: 0n, OTHER: 0n };
  for (const allocation of allocations) {
    const split = allocateProportionally(
      amount(allocation.amount),
      allocation.invoice.lines || [],
    );
    for (const category of INCOME_CATEGORIES)
      addTo(categories, category, split[category]);
  }
  const total = INCOME_CATEGORIES.reduce(
    (result, category) => result + categories[category],
    0n,
  );
  const paymentIds = new Set(allocations.map((item) => item.paymentId));
  return {
    categories,
    total,
    allocationCount: allocations.length,
    paymentCount: paymentIds.size,
  };
}

async function getExpenseData(period) {
  const [expenses, salaries] = await Promise.all([
    prisma.expense.findMany({
      where: { expenseDate: { gte: period.start, lt: period.endExclusive } },
      select: {
        id: true,
        amount: true,
        category: true,
        description: true,
        expenseDate: true,
        groupId: true,
      },
    }),
    prisma.salaryCalculation.findMany({
      where: {
        status: "PAID",
        paidAt: { gte: period.start, lt: period.endExclusive },
      },
      include: { employee: { select: { id: true, role: true } } },
    }),
  ]);
  const byCategory = {
    SALARIES: 0n,
    FOOD: 0n,
    UTILITIES: 0n,
    SUPPLIES: 0n,
    MAINTENANCE: 0n,
    OTHER: 0n,
  };
  for (const expense of expenses)
    addTo(byCategory, expense.category, amount(expense.amount));
  for (const salary of salaries)
    addTo(byCategory, "SALARIES", amount(salary.totalAmount));
  const salaryTotal = sum(salaries, "totalAmount");
  const otherTotal = sum(expenses, "amount");
  return {
    expenses,
    salaries,
    byCategory,
    salaryTotal,
    otherTotal,
    total: salaryTotal + otherTotal,
  };
}

async function getSummary(query) {
  const period = getPeriod(query);

  const [accrual, cash, expenseData, attendanceRecords, groups] =
    await Promise.all([
      getAccruedIncome(period),
      getCashIncome(period),
      getExpenseData(period),
      prisma.attendance.findMany({
        where: { date: { gte: period.start, lt: period.endExclusive } },
        select: { status: true },
      }),
      prisma.group.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, mainRoomId: true },
      }),
    ]);

  const accruedTotal = INCOME_CATEGORIES.reduce(
    (total, category) => total + accrual.categories[category],
    0n,
  );

  const operatingProfit = accruedTotal - expenseData.total;

  const usedRooms = new Set(
    groups.map((group) => group.mainRoomId).filter(Boolean),
  ).size;

  const modelProfit =
    operatingProfit -
    ROOM_COST_PER_MONTH *
      BigInt(usedRooms) *
      BigInt(monthRange(period.start, period.end).length);

  const debtReport = await getDebtsReport(query);

  const invoiceCount = accrual.invoices.length;

  const paidInvoices = accrual.invoices.filter(
    (invoice) => invoice.status === "PAID",
  ).length;

  const unpaidInvoices = accrual.invoices.filter((invoice) =>
    ["ISSUED", "PARTIALLY_PAID"].includes(invoice.status),
  ).length;

  const outstandingBalance = BigInt(debtReport.netOutstanding);

  const attendance = {
    total: attendanceRecords.length,
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
  };

  for (const record of attendanceRecords) {
    if (record.status === "PRESENT") attendance.present++;
    if (record.status === "ABSENT") attendance.absent++;
    if (record.status === "LATE") attendance.late++;
    if (record.status === "EXCUSED") attendance.excused++;
  }

  const summary = {
    period: {
      from: period.from,
      to: period.to,
    },
    invoices: {
      count: invoiceCount,
      paidCount: paidInvoices,
      unpaidCount: unpaidInvoices,
      accruedAmount: serialize(accruedTotal),
      outstandingBalance: serialize(outstandingBalance),
    },
    income: {
      accrued: serialize(accruedTotal),
      received: serialize(cash.total),
      accruedByCategory: serializeMap(accrual.categories),
      receivedByCategory: serializeMap(cash.categories),
    },
    expenses: {
      total: serialize(expenseData.total),
      salaries: serialize(expenseData.salaryTotal),
      operating: serialize(expenseData.otherTotal),
      byCategory: serializeMap(expenseData.byCategory),
    },
    profitability: {
      operatingProfit: serialize(operatingProfit),
      usedRooms,
      imputedRoomCostPerMonth: serialize(ROOM_COST_PER_MONTH),
      modelProfit: serialize(modelProfit),
    },
    payments: {
      count: cash.paymentCount,
      allocatedTransactions: cash.allocationCount,
    },
    attendance,
    currency: "UAH",
  };

  let comparison = null;
  let changes = null;

  if (query.compareFrom && query.compareTo) {
    comparison = await getSummary({
      from: query.compareFrom,
      to: query.compareTo,
    });

    changes = {
      invoices: {
        count: summary.invoices.count - comparison.invoices.count,
        paidCount: summary.invoices.paidCount - comparison.invoices.paidCount,
        unpaidCount:
          summary.invoices.unpaidCount - comparison.invoices.unpaidCount,
        accruedAmount: calculateDifference(
          summary.invoices.accruedAmount,
          comparison.invoices.accruedAmount,
        ),
        outstandingBalance: calculateDifference(
          summary.invoices.outstandingBalance,
          comparison.invoices.outstandingBalance,
        ),
      },
      income: {
        accrued: calculateDifference(
          summary.income.accrued,
          comparison.income.accrued,
        ),
        received: calculateDifference(
          summary.income.received,
          comparison.income.received,
        ),
        accruedByCategory: Object.fromEntries(
          INCOME_CATEGORIES.map((category) => [
            category,
            calculateDifference(
              summary.income.accruedByCategory[category],
              comparison.income.accruedByCategory[category],
            ),
          ]),
        ),
        receivedByCategory: Object.fromEntries(
          INCOME_CATEGORIES.map((category) => [
            category,
            calculateDifference(
              summary.income.receivedByCategory[category],
              comparison.income.receivedByCategory[category],
            ),
          ]),
        ),
      },
      expenses: {
        total: calculateDifference(
          summary.expenses.total,
          comparison.expenses.total,
        ),
        salaries: calculateDifference(
          summary.expenses.salaries,
          comparison.expenses.salaries,
        ),
        operating: calculateDifference(
          summary.expenses.operating,
          comparison.expenses.operating,
        ),
        byCategory: Object.fromEntries(
          Object.keys(summary.expenses.byCategory).map((category) => [
            category,
            calculateDifference(
              summary.expenses.byCategory[category],
              comparison.expenses.byCategory[category],
            ),
          ]),
        ),
      },
      profitability: {
        operatingProfit: calculateDifference(
          summary.profitability.operatingProfit,
          comparison.profitability.operatingProfit,
        ),
        modelProfit: calculateDifference(
          summary.profitability.modelProfit,
          comparison.profitability.modelProfit,
        ),
        usedRooms:
          summary.profitability.usedRooms - comparison.profitability.usedRooms,
      },
      payments: {
        count: summary.payments.count - comparison.payments.count,
        allocatedTransactions:
          summary.payments.allocatedTransactions -
          comparison.payments.allocatedTransactions,
      },
      attendance: {
        total: summary.attendance.total - comparison.attendance.total,
        present: summary.attendance.present - comparison.attendance.present,
        absent: summary.attendance.absent - comparison.attendance.absent,
        late: summary.attendance.late - comparison.attendance.late,
        excused: summary.attendance.excused - comparison.attendance.excused,
      },
    };
  }

  return {
    ...summary,
    comparison,
    changes,
  };
}

function serializeMap(map) {
  return Object.fromEntries(
    Object.entries(map).map(([key, value]) => [key, serialize(value)]),
  );
}

async function getIncomeReport(query) {
  const period = getPeriod(query);
  const [accrual, cash] = await Promise.all([
    getAccruedIncome(period),
    getCashIncome(period),
  ]);
  const accruedTotal = INCOME_CATEGORIES.reduce(
    (total, category) => total + accrual.categories[category],
    0n,
  );
  const comparison =
    query.compareFrom && query.compareTo
      ? await getIncomeReport({ from: query.compareFrom, to: query.compareTo })
      : null;
  return {
    period: { from: period.from, to: period.to },
    comparison,
    accrued: {
      total: serialize(accruedTotal),
      byCategory: serializeMap(accrual.categories),
      byMonth: Object.fromEntries(
        Object.entries(accrual.byMonth).map(([key, value]) => [
          key,
          serializeMap(value),
        ]),
      ),
    },
    received: {
      total: serialize(cash.total),
      byCategory: serializeMap(cash.categories),
      paymentCount: cash.paymentCount,
    },
    note: "Річна передоплата за навчання визнається рівними частинами протягом 12 місяців; переплати не вважаються доходом до розподілу на рахунок.",
    currency: "UAH",
  };
}

async function getExpensesReport(query) {
  const period = getPeriod(query);
  const data = await getExpenseData(period);
  const comparison =
    query.compareFrom && query.compareTo
      ? await getExpensesReport({
          from: query.compareFrom,
          to: query.compareTo,
        })
      : null;
  return {
    period: { from: period.from, to: period.to },
    comparison,
    total: serialize(data.total),
    salaries: serialize(data.salaryTotal),
    operational: serialize(data.otherTotal),
    byCategory: serializeMap(data.byCategory),
    records: {
      salaryCalculations: data.salaries.length,
      operationalExpenses: data.expenses.length,
    },
    note: "Фактична собівартість харчування враховується через витрати категорії FOOD і не змішується з оплатою харчування батьками.",
    currency: "UAH",
  };
}

async function getDebtsReport(query) {
  const period = getPeriod(query);
  const invoices = await prisma.invoice.findMany({
    where: {
      issuedAt: { lt: period.endExclusive },
      status: { notIn: ["DRAFT", "CANCELLED"] },
    },
    include: {
      payer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
        },
      },
      allocations: {
        where: {
          payment: { status: "COMPLETED", paidAt: { lt: period.endExclusive } },
        },
        select: { amount: true },
      },
    },
  });

  const adjustmentMeta = prisma._runtimeDataModel?.models?.InvoiceAdjustment;
  const adjustmentByInvoice = new Map();
  if (prisma.invoiceAdjustment && adjustmentMeta && invoices.length) {
    const invoiceField = adjustmentMeta.fields.some(
      (field) => field.name === "invoiceId",
    )
      ? "invoiceId"
      : adjustmentMeta.fields.some(
            (field) => field.name === "originalInvoiceId",
          )
        ? "originalInvoiceId"
        : null;
    if (invoiceField) {
      const adjustments = await prisma.invoiceAdjustment.findMany({
        where: {
          [invoiceField]: { in: invoices.map((invoice) => invoice.id) },
          createdAt: { lt: period.endExclusive },
        },
        orderBy: { createdAt: "desc" },
      });
      for (const adjustment of adjustments) {
        const invoiceId = adjustment[invoiceField];
        if (!adjustmentByInvoice.has(invoiceId))
          adjustmentByInvoice.set(invoiceId, adjustment);
      }
    }
  }

  const parentIds = [...new Set(invoices.map((invoice) => invoice.payerId))];
  const creditByParent = new Map();
  if (prisma.creditBalance && parentIds.length) {
    const credits = await prisma.creditBalance.findMany({
      where: { parentId: { in: parentIds } },
      select: { parentId: true, balance: true },
    });
    for (const credit of credits)
      creditByParent.set(credit.parentId, amount(credit.balance));
  }

  const parentMap = new Map();
  for (const invoice of invoices) {
    const paid = await getInvoicePaidAmount(
      prisma,
      invoice.id,
      period.endExclusive,
    );
    const adjustment = adjustmentByInvoice.get(invoice.id);
    const due = adjustment
      ? amount(adjustment.adjustedAmount)
      : amount(invoice.amountDue);
    const outstanding = due - paid;
    if (outstanding <= 0n) continue;
    const parent = invoice.payer;
    if (!parentMap.has(parent.id))
      parentMap.set(parent.id, {
        parent,
        invoiceCount: 0,
        outstanding: 0n,
        invoices: [],
      });
    const item = parentMap.get(parent.id);
    item.invoiceCount++;
    item.outstanding += outstanding;
    item.invoices.push({
      invoiceId: invoice.id,
      childId: invoice.childId,
      periodYear: invoice.periodYear,
      periodMonth: invoice.periodMonth,
      status: invoice.status,
      amountDue: serialize(due),
      paidAmount: serialize(paid),
      outstanding: serialize(outstanding),
    });
  }

  const parents = [...parentMap.values()]
    .sort((a, b) =>
      a.outstanding > b.outstanding
        ? -1
        : a.outstanding < b.outstanding
          ? 1
          : 0,
    )
    .map((item) => {
      const credit = creditByParent.get(item.parent.id) || 0n;
      const netOutstanding =
        item.outstanding > credit ? item.outstanding - credit : 0n;
      return {
        ...item.parent,
        invoiceCount: item.invoiceCount,
        outstanding: serialize(item.outstanding),
        availableCredit: serialize(credit),
        netOutstanding: serialize(netOutstanding),
        invoices: item.invoices,
      };
    });
  const total = [...parentMap.values()].reduce(
    (result, item) => result + item.outstanding,
    0n,
  );
  const totalCredit = [...creditByParent.values()].reduce(
    (result, value) => result + value,
    0n,
  );
  return {
    period: { from: period.from, to: period.to },
    parentCount: parents.length,
    invoiceCount: parents.reduce(
      (totalCount, item) => totalCount + item.invoiceCount,
      0,
    ),
    totalOutstanding: serialize(total),
    totalAvailableCredit: serialize(totalCredit),
    netOutstanding: serialize(total > totalCredit ? total - totalCredit : 0n),
    parents,
    currency: "UAH",
  };
}

async function getProfitabilityReport(query) {
  const period = getPeriod(query);
  const [accrual, expenseData, groups] = await Promise.all([
    getAccruedIncome(period),
    getExpenseData(period),
    prisma.group.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, mainRoomId: true },
    }),
  ]);
  const revenue = INCOME_CATEGORIES.reduce(
    (total, category) => total + accrual.categories[category],
    0n,
  );
  const operatingProfit = revenue - expenseData.total;
  const usedRooms = new Set(
    groups.map((group) => group.mainRoomId).filter(Boolean),
  ).size;
  const roomCost =
    ROOM_COST_PER_MONTH *
    BigInt(usedRooms) *
    BigInt(monthRange(period.start, period.end).length);
  const comparison =
    query.compareFrom && query.compareTo
      ? await getProfitabilityReport({
          from: query.compareFrom,
          to: query.compareTo,
        })
      : null;
  return {
    period: { from: period.from, to: period.to },
    comparison,
    revenue: serialize(revenue),
    actualExpenses: serialize(expenseData.total),
    operatingProfit: serialize(operatingProfit),
    model: {
      usedRooms,
      roomCostPerRoomPerMonth: serialize(ROOM_COST_PER_MONTH),
      totalImputedRoomCost: serialize(roomCost),
      modelProfit: serialize(operatingProfit - roomCost),
    },
    formula:
      "OperatingProfit = AccruedRevenue - ActualExpenses; ModelProfit = OperatingProfit - 50000 * UsedRooms * MonthsInPeriod",
    currency: "UAH",
  };
}

async function getGroupReport(query) {
  const period = getPeriod(query);
  const [
    accrual,
    expenses,
    salaries,
    groups,
    enrollments,
    receivedAllocations,
  ] = await Promise.all([
    getAccruedIncome(period),
    prisma.expense.findMany({
      where: { expenseDate: { gte: period.start, lt: period.endExclusive } },
      select: { amount: true, category: true, groupId: true },
    }),
    prisma.salaryCalculation.findMany({
      where: {
        status: "PAID",
        paidAt: { gte: period.start, lt: period.endExclusive },
      },
      include: { employee: { select: { id: true } } },
    }),
    prisma.group.findMany({
      select: { id: true, name: true, mainRoomId: true },
    }),
    prisma.groupEnrollment.findMany({
      where: {
        startDate: { lt: period.endExclusive },
        OR: [{ endDate: null }, { endDate: { gte: period.start } }],
      },
      select: { childId: true, groupId: true, startDate: true, endDate: true },
    }),
    prisma.paymentAllocation.findMany({
      where: {
        payment: {
          status: "COMPLETED",
          paidAt: { gte: period.start, lt: period.endExclusive },
        },
      },
      include: { invoice: { select: { childId: true } } },
    }),
  ]);
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const findGroupForChildAt = (childId, date) => {
    const matches = enrollments
      .filter(
        (item) =>
          item.childId === childId &&
          item.startDate <= date &&
          (!item.endDate || item.endDate >= date),
      )
      .sort((a, b) => b.startDate - a.startDate);
    return matches[0]?.groupId || "WITHOUT_GROUP";
  };
  const result = new Map();
  const ensure = (groupId) => {
    if (!result.has(groupId)) {
      const group = groupById.get(groupId);
      result.set(groupId, {
        groupId,
        groupName: group?.name || "Без групи",
        invoiceCount: 0,
        accruedIncome: 0n,
        expenses: 0n,
        salaryExpenses: 0n,
        operationalExpenses: 0n,
        receivedIncome: 0n,
        outstandingBalance: 0n,
      });
    }
    return result.get(groupId);
  };
  for (const invoice of accrual.invoices) {
    const invoiceStart = new Date(
      Date.UTC(invoice.periodYear, invoice.periodMonth - 1, 1),
    );
    let invoiceAccrued = 0n;
    for (const line of invoice.lines) {
      for (const month of monthRange(period.start, period.end)) {
        invoiceAccrued += lineAccrualForMonth(invoice, line, month);
      }
    }
    if (invoiceAccrued <= 0n) continue;
    const group = ensure(findGroupForChildAt(invoice.childId, invoiceStart));
    group.invoiceCount++;
    group.accruedIncome += invoiceAccrued;
    const paid = await getInvoicePaidAmount(
      prisma,
      invoice.id,
      period.endExclusive,
    );

    const balance = amount(invoice.amountDue) - paid;

    if (balance > 0n) {
      group.outstandingBalance += balance;
    }
  }
  for (const allocation of receivedAllocations) {
    const invoice = accrual.invoices.find(
      (item) => item.id === allocation.invoiceId,
    );
    const invoiceDate = invoice
      ? new Date(Date.UTC(invoice.periodYear, invoice.periodMonth - 1, 1))
      : period.start;
    const group = ensure(
      findGroupForChildAt(allocation.invoice.childId, invoiceDate),
    );
    group.receivedIncome += amount(allocation.amount);
  }
  const groupExpensesSupported = true;
  for (const expense of expenses) {
    const group = ensure(
      groupExpensesSupported && expense.groupId
        ? expense.groupId
        : "UNALLOCATED_EXPENSES",
    );
    group.expenses += amount(expense.amount);
    group.operationalExpenses += amount(expense.amount);
  }
  const assignments = await prisma.staffAssignment.findMany({
    where: {
      startDate: { lt: period.endExclusive },
      OR: [{ endDate: null }, { endDate: { gte: period.start } }],
    },
    select: { employeeId: true, groupId: true },
  });
  const assignmentByEmployee = new Map(
    assignments.map((assignment) => [
      assignment.employeeId,
      assignment.groupId,
    ]),
  );
  for (const salary of salaries) {
    const groupId =
      assignmentByEmployee.get(salary.employeeId) || "UNALLOCATED_SALARIES";
    const group = ensure(groupId);
    group.expenses += amount(salary.totalAmount);
    group.salaryExpenses += amount(salary.totalAmount);
  }
  const comparison =
    query.compareFrom && query.compareTo
      ? await getGroupReport({ from: query.compareFrom, to: query.compareTo })
      : null;
  return {
    period: { from: period.from, to: period.to },
    comparison,
    groups: [...result.values()]
      .map((group) => ({
        ...group,
        accruedIncome: serialize(group.accruedIncome),
        receivedIncome: serialize(group.receivedIncome),
        expenses: serialize(group.expenses),
        salaryExpenses: serialize(group.salaryExpenses),
        operationalExpenses: serialize(group.operationalExpenses),
        outstandingBalance: serialize(group.outstandingBalance),
        profit: serialize(group.accruedIncome - group.expenses),
      }))
      .sort((a, b) =>
        BigInt(a.profit) > BigInt(b.profit)
          ? -1
          : BigInt(a.profit) < BigInt(b.profit)
            ? 1
            : 0,
      ),
    notes: [
      groupExpensesSupported
        ? "Операційні витрати розподілено за groupId."
        : "Для розподілу операційних витрат за групами додайте nullable Expense.groupId; без нього вони показані окремо як нерозподілені.",
      "Зарплати розподіляються за активним закріпленням працівника за групою; зарплати без такого закріплення показані окремо.",
    ],
    currency: "UAH",
  };
}

async function getAttendanceReport(query) {
  const period = getPeriod(query);
  const attendanceRecords = await prisma.attendance.findMany({
    where: { date: { gte: period.start, lt: period.endExclusive } },
    include: {
      child: {
        include: {
          enrollments: {
            include: { group: { select: { id: true, name: true } } },
            orderBy: { startDate: "desc" },
          },
        },
      },
    },
    orderBy: { date: "asc" },
  });
  const groups = new Map();
  const summary = { total: 0, present: 0, absent: 0, late: 0, excused: 0 };
  for (const record of attendanceRecords) {
    const enrollment = record.child.enrollments.find(
      (item) =>
        item.startDate <= record.date &&
        (!item.endDate || item.endDate >= record.date),
    );
    const groupId = enrollment?.group?.id || "WITHOUT_GROUP";
    const groupName = enrollment?.group?.name || "Без групи";
    if (query.groupId && groupId !== query.groupId) continue;
    if (!groups.has(groupId))
      groups.set(groupId, {
        groupId,
        groupName,
        total: 0,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
      });
    const group = groups.get(groupId);
    summary.total++;
    group.total++;
    if (record.status === "PRESENT") {
      summary.present++;
      group.present++;
    }
    if (record.status === "ABSENT") {
      summary.absent++;
      group.absent++;
    }
    if (record.status === "LATE") {
      summary.late++;
      group.late++;
    }
    if (record.status === "EXCUSED") {
      summary.excused++;
      group.excused++;
    }
  }
  return {
    period: { from: period.from, to: period.to },
    summary,
    groups: [...groups.values()],
  };
}

module.exports = {
  getSummary,
  getIncomeReport,
  getExpensesReport,
  getDebtsReport,
  getProfitabilityReport,
  getGroupReport,
  getAttendanceReport,
};
