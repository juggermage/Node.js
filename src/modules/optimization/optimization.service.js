const prisma = require("../../config/prisma");
const AppError = require("../../utils/app-error");
const HTTP_STATUS = require("../../utils/http-status");

const ROOM_COST = 5000000n;

function fail(message, code) {
  throw new AppError(message, HTTP_STATUS.UNPROCESSABLE_ENTITY, code);
}

function period(from, to) {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start.toISOString().slice(0, 10) !== from ||
    end.toISOString().slice(0, 10) !== to
  ) {
    fail("Invalid date", "INVALID_DATE");
  }

  if (start > end) fail("Invalid period", "INVALID_PERIOD");

  const endExclusive = new Date(end);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  return { start, endExclusive };
}

function money(value) {
  return value.toString();
}

function sum(items, field) {
  return items.reduce((total, item) => total + BigInt(item[field] || 0), 0n);
}

function lineType(description) {
  const value = String(description || "")
    .trim()
    .toLowerCase();

  if (value.startsWith("навчання")) return "tuition";
  if (value.startsWith("харчування")) return "meals";

  return "other";
}

function addLines(result, lines) {
  for (const line of lines || []) {
    result[lineType(line.description)] += BigInt(line.amount || 0);
  }
}

function distributeAllocation(result, allocation) {
  const invoice = allocation.invoice;
  const lines = invoice?.lines || [];
  const invoiceAmount = BigInt(invoice?.amountDue || 0);
  const allocated = BigInt(allocation.amount || 0);

  if (invoiceAmount <= 0n || !lines.length || allocated <= 0n) return;

  const totalLines = lines.reduce((total, line) => total + BigInt(line.amount || 0), 0n);

  if (totalLines <= 0n) {
    result.other += allocated;
    return;
  }

  let distributed = 0n;

  lines.forEach((line, index) => {
    const amount =
      index === lines.length - 1
        ? allocated - distributed
        : (allocated * BigInt(line.amount || 0)) / totalLines;

    distributed += amount;
    result[lineType(line.description)] += amount;
  });
}

async function getCounts(start, endExclusive) {
  const [enrollments, employees, schedules] = await Promise.all([
    prisma.groupEnrollment.findMany({
      where: {
        startDate: { lt: endExclusive },
        OR: [{ endDate: null }, { endDate: { gte: start } }]
      },
      select: {
        childId: true,
        groupId: true
      }
    }),

    prisma.employee.findMany({
      where: {
        createdAt: { lt: endExclusive },
        OR: [{ archivedAt: null }, { archivedAt: { gte: start } }]
      },
      select: { id: true }
    }),

    prisma.schedule.findMany({
      where: {
        status: "PUBLISHED",
        validFrom: { lt: endExclusive },
        OR: [{ validTo: null }, { validTo: { gte: start } }]
      },
      select: {
        id: true,
        groupId: true
      }
    })
  ]);

  const childIds = [...new Set(enrollments.map((item) => item.childId))];
  const groupIds = [...new Set(enrollments.map((item) => item.groupId))];

  const [children, groups, items] = await Promise.all([
    childIds.length
      ? prisma.child.findMany({
          where: {
            id: { in: childIds },
            createdAt: { lt: endExclusive },
            OR: [{ archivedAt: null }, { archivedAt: { gte: start } }]
          },
          select: { id: true }
        })
      : [],

    groupIds.length
      ? prisma.group.findMany({
          where: {
            id: { in: groupIds },
            createdAt: { lt: endExclusive },
            OR: [{ archivedAt: null }, { archivedAt: { gte: start } }]
          },
          select: { id: true }
        })
      : [],

    schedules.length
      ? prisma.scheduleItem.findMany({
          where: {
            scheduleId: { in: schedules.map((item) => item.id) },
            status: "ACTIVE",
            roomId: { isSet: true },
            OR: [{ cancelledAt: null }, { cancelledAt: { gte: start } }]
          },
          select: {
            roomId: true,
            teacherId: true
          }
        })
      : []
  ]);

  const roomIds = [...new Set(items.map((item) => item.roomId).filter(Boolean))];

  const rooms = roomIds.length
    ? await prisma.room.findMany({
        where: {
          id: { in: roomIds },
          createdAt: { lt: endExclusive },
          OR: [{ archivedAt: null }, { archivedAt: { gte: start } }]
        },
        select: {
          id: true,
          capacity: true
        }
      })
    : [];

  const usedTeacherIds = [...new Set(items.map((item) => item.teacherId).filter(Boolean))];

  return {
    children: children.length,
    groups: groups.length,
    employees: employees.length,
    rooms: rooms.length,
    roomCapacity: rooms.reduce((total, room) => total + room.capacity, 0),
    scheduledTeachers: usedTeacherIds.length
  };
}

async function getReport({ from, to }) {
  const { start, endExclusive } = period(from, to);

  const [invoices, payments, salaries, expenses, resources] = await Promise.all([
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
      include: { lines: true }
    }),

    prisma.payment.findMany({
      where: {
        status: "COMPLETED",
        paidAt: {
          gte: start,
          lt: endExclusive
        }
      },
      include: {
        allocations: {
          include: {
            invoice: {
              include: { lines: true }
            }
          }
        }
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
      select: { totalAmount: true }
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
        category: true
      }
    }),

    getCounts(start, endExclusive)
  ]);

  const accrued = {
    tuition: 0n,
    meals: 0n,
    other: 0n
  };

  invoices.forEach((invoice) => addLines(accrued, invoice.lines));

  const receivedByType = {
    tuition: 0n,
    meals: 0n,
    other: 0n
  };

  payments.forEach((payment) =>
    payment.allocations.forEach((allocation) => distributeAllocation(receivedByType, allocation))
  );

  const received = sum(payments, "amount");
  const salaryCost = sum(salaries, "totalAmount");

  const foodCost = sum(
    expenses.filter((item) => item.category === "FOOD"),
    "amount"
  );

  const otherCost = sum(
    expenses.filter((item) => item.category !== "FOOD"),
    "amount"
  );

  const totalCost = salaryCost + foodCost + otherCost;

  const accruedTotal = accrued.tuition + accrued.meals + accrued.other;

  const receivedClassified = receivedByType.tuition + receivedByType.meals + receivedByType.other;

  const roomCost = ROOM_COST * BigInt(resources.rooms);

  const totalExpenseCategories = {};

  expenses.forEach((expense) => {
    const key = String(expense.category || "OTHER").toLowerCase();

    totalExpenseCategories[key] = (totalExpenseCategories[key] || 0n) + BigInt(expense.amount || 0);
  });

  return {
    period: { from, to },
    currency: "UAH",
    moneyUnit: "kopecks",

    revenue: {
      accrued: {
        tuition: money(accrued.tuition),
        meals: money(accrued.meals),
        other: money(accrued.other),
        total: money(accruedTotal)
      },

      received: {
        tuition: money(receivedByType.tuition),
        meals: money(receivedByType.meals),
        other: money(receivedByType.other),
        total: money(received),
        unclassifiedDifference: money(received - receivedClassified)
      }
    },

    expenses: {
      salaries: money(salaryCost),
      food: money(foodCost),
      other: money(otherCost),

      byCategory: Object.fromEntries(
        Object.entries(totalExpenseCategories).map(([key, value]) => [key, money(value)])
      ),

      total: money(totalCost)
    },

    resources: {
      ...resources,

      childrenPerGroup: resources.groups
        ? Number((resources.children / resources.groups).toFixed(2))
        : 0,

      childrenPerRoom: resources.rooms
        ? Number((resources.children / resources.rooms).toFixed(2))
        : 0
    },

    profit: {
      actualOperating: money(received - totalCost),
      accruedOperating: money(accruedTotal - totalCost),
      modelBeforeRoomNormative: money(accruedTotal - totalCost),
      roomNormativeCostPerRoom: money(ROOM_COST),
      totalRoomNormativeCost: money(roomCost),
      model: money(accruedTotal - totalCost - roomCost)
    }
  };
}

function calculateScenario(scenario, base, report) {
  const children = BigInt(scenario.children);
  const groups = BigInt(scenario.groups);
  const employees = BigInt(scenario.employees);
  const rooms = BigInt(scenario.rooms);

  const baseChildren = BigInt(base.children);
  const baseGroups = BigInt(base.groups);
  const baseEmployees = BigInt(base.employees);

  const perChildTuition = baseChildren ? BigInt(report.revenue.accrued.tuition) / baseChildren : 0n;

  const perChildMeals = baseChildren ? BigInt(report.revenue.accrued.meals) / baseChildren : 0n;

  const foodPerChild = baseChildren ? BigInt(report.expenses.food) / baseChildren : 0n;

  const salaryPerEmployee = baseEmployees ? BigInt(report.expenses.salaries) / baseEmployees : 0n;

  const otherPerGroup = baseGroups ? BigInt(report.expenses.other) / baseGroups : 0n;

  const tuition = perChildTuition * children;
  const meals = perChildMeals * children;
  const food = foodPerChild * children;
  const salaries = salaryPerEmployee * employees;
  const other = otherPerGroup * groups;

  const roomNormative = ROOM_COST * rooms;

  const totalRevenue = tuition + meals;
  const operatingExpenses = food + salaries + other;
  const totalExpenses = operatingExpenses + roomNormative;
  const modelProfit = totalRevenue - totalExpenses;

  const averageRoomCapacity = base.rooms ? Math.floor((base.roomCapacity || 0) / base.rooms) : 0;

  const capacityShortfall = Number(rooms) * averageRoomCapacity;

  const childrenPerGroup =
    groups > 0n ? Number(children) / Number(groups) : children > 0n ? Infinity : 0;

  const childrenPerRoom =
    rooms > 0n ? Number(children) / Number(rooms) : children > 0n ? Infinity : 0;

  const warnings = [];

  if (children > 0n && groups === 0n) {
    warnings.push("Неможливо розмістити дітей без груп");
  }

  if (children > 0n && rooms === 0n) {
    warnings.push("Для дітей не передбачено приміщень");
  }

  if (children > 0n && employees === 0n) {
    warnings.push("Для роботи закладу не передбачено працівників");
  }

  if (averageRoomCapacity > 0 && rooms > 0n && Number(children) > capacityShortfall) {
    warnings.push("Кількість дітей перевищує орієнтовну базову місткість приміщень");
  }

  if (groups > children && children > 0n) {
    warnings.push("Кількість груп перевищує кількість дітей");
  }

  return {
    name: scenario.name,

    configuration: {
      children: scenario.children,
      groups: scenario.groups,
      employees: scenario.employees,
      rooms: scenario.rooms
    },

    indicators: {
      childrenPerGroup: Number.isFinite(childrenPerGroup)
        ? Number(childrenPerGroup.toFixed(2))
        : null,

      childrenPerRoom: Number.isFinite(childrenPerRoom) ? Number(childrenPerRoom.toFixed(2)) : null,

      employeesPerGroup:
        groups > 0n ? Number((Number(employees) / Number(groups)).toFixed(2)) : null
    },

    revenue: {
      tuition: money(tuition),
      meals: money(meals),
      total: money(totalRevenue)
    },

    expenses: {
      food: money(food),
      salaries: money(salaries),
      other: money(other),
      operating: money(operatingExpenses),
      roomNormative: money(roomNormative),
      total: money(totalExpenses)
    },

    modelProfit: money(modelProfit),
    warnings
  };
}

async function compareScenarios({ from, to, scenarios }) {
  const report = await getReport({ from, to });

  const results = scenarios.map((item) => calculateScenario(item, report.resources, report));

  results.sort((a, b) => {
    const x = BigInt(a.modelProfit);
    const y = BigInt(b.modelProfit);

    return x === y ? 0 : x > y ? -1 : 1;
  });

  const baselineProfit = BigInt(report.profit.model);

  const ranked = results.map((scenario, index) => {
    const difference = BigInt(scenario.modelProfit) - baselineProfit;

    return {
      ...scenario,
      rank: index + 1,
      differenceFromCurrent: money(difference),
      betterThanCurrent: difference > 0n
    };
  });

  return {
    period: report.period,
    currency: report.currency,
    moneyUnit: report.moneyUnit,

    baseline: {
      ...report.resources,
      modelProfit: report.profit.model
    },

    roomNormativeCostPerRoom: money(ROOM_COST),
    scenarios: ranked,

    mostProfitable: ranked.find((item) => item.warnings.length === 0) || ranked[0] || null
  };
}

module.exports = {
  ROOM_NORMATIVE_COST: ROOM_COST,
  getReport,
  compareScenarios
};
