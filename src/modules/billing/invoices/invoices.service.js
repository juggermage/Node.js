const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/app-error");
const HTTP_STATUS = require("../../../utils/http-status");
const tuitionService = require("../tuition/tuition.service");
const mealsService = require("../meals/meals.service");
const auditService = require("../../audit/audit.service");

function fail(message, status, code) {
  throw new AppError(message, status, code);
}

function periodBounds(year, month) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    fail("Invalid period year", HTTP_STATUS.UNPROCESSABLE_ENTITY, "INVALID_PERIOD_YEAR");
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    fail("Invalid period month", HTTP_STATUS.UNPROCESSABLE_ENTITY, "INVALID_PERIOD_MONTH");
  }

  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 0))
  };
}

function parseDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    fail("Invalid date", HTTP_STATUS.UNPROCESSABLE_ENTITY, "INVALID_DATE");
  }

  return date;
}

function serializeInvoice(invoice, paidAmount = 0n) {
  const { allocations, ...data } = invoice;
  const amountDue = BigInt(invoice.amountDue);
  const balance = amountDue - paidAmount;

  return {
    ...data,
    amountDue: amountDue.toString(),
    paidAmount: paidAmount.toString(),
    outstandingBalance: (balance > 0n ? balance : 0n).toString(),
    lines: (invoice.lines || []).map((line) => ({
      ...line,
      unitAmount: line.unitAmount.toString(),
      amount: line.amount.toString()
    }))
  };
}

function getPaidAmountFromAllocations(allocations = []) {
  return allocations.reduce(
    (sum, allocation) => sum + BigInt(allocation.amount),
    0n
  );
}

async function getPaidAmount(tx, invoiceId) {
  const allocations = await tx.paymentAllocation.findMany({
    where: {
      invoiceId,
      payment: {
        status: "COMPLETED"
      }
    },
    select: {
      amount: true
    }
  });

  return getPaidAmountFromAllocations(allocations);
}

async function getChildAndPayer(tx, childId, payerId) {
  const [child, parent, relationship] = await Promise.all([
    tx.child.findUnique({
      where: { id: childId }
    }),
    tx.parent.findUnique({
      where: { id: payerId }
    }),
    tx.childParent.findFirst({
      where: {
        childId,
        parentId: payerId,
        endDate: null
      }
    })
  ]);

  if (!child || child.status !== "ACTIVE") {
    fail("Active child not found", HTTP_STATUS.NOT_FOUND, "CHILD_NOT_FOUND");
  }

  if (!parent || parent.status !== "ACTIVE") {
    fail("Active payer not found", HTTP_STATUS.NOT_FOUND, "PAYER_NOT_FOUND");
  }

  if (!relationship) {
    fail(
      "Payer is not an active parent or guardian of this child",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "PAYER_NOT_RELATED_TO_CHILD"
    );
  }

  return { child, parent };
}

async function createInvoice(data, type) {
  const { start, end } = periodBounds(data.periodYear, data.periodMonth);

  if (data.dueDate) {
    parseDate(data.dueDate);
  }

  if (
    type === "MONTHLY" &&
    data.attendedDays > end.getUTCDate()
  ) {
    fail(
      "Attended days exceed the number of days in the month",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "INVALID_ATTENDED_DAYS"
    );
  }

  try {
    const invoice = await prisma.$transaction(async (tx) => {
      const existing = await tx.invoice.findFirst({
        where: {
          childId: data.childId,
          periodYear: data.periodYear,
          periodMonth: data.periodMonth,
          type
        }
      });

      if (existing) {
        fail(
          "Invoice already exists for this period",
          HTTP_STATUS.CONFLICT,
          "INVOICE_ALREADY_EXISTS"
        );
      }

      await getChildAndPayer(tx, data.childId, data.payerId);

      const tuition = type === "MONTHLY"
        ? await tuitionService.calculateMonthlyTuitionCost({
            childId: data.childId,
            periodStart: start.toISOString().slice(0, 10),
            periodEnd: end.toISOString().slice(0, 10)
          })
        : await tuitionService.calculateAnnualTuitionCost({
            childId: data.childId,
            periodStart: start.toISOString().slice(0, 10)
          });

      const lines = [];
      const tuitionAmount = BigInt(tuition.total);

      lines.push({
        description: type === "ANNUAL"
          ? "Навчання — річна передоплата"
          : "Навчання",
        quantity: 1,
        unitAmount: tuitionAmount,
        amount: tuitionAmount,
        tariffSnapshot: tuition
      });

      if (type === "MONTHLY") {
        const meals = await mealsService.calculateMealCost({
          childId: data.childId,
          periodStart: start.toISOString().slice(0, 10),
          periodEnd: end.toISOString().slice(0, 10),
          attendedDays: data.attendedDays
        });

        const mealAmount = BigInt(meals.total);
        const dailyRate = BigInt(meals.dailyRate);

        lines.push({
          description: "Харчування",
          quantity: data.attendedDays,
          unitAmount: dailyRate,
          amount: mealAmount,
          tariffSnapshot: meals
        });
      }

      const amountDue = lines.reduce(
        (sum, line) => sum + line.amount,
        0n
      );

      const createdInvoice = await tx.invoice.create({
        data: {
          childId: data.childId,
          payerId: data.payerId,
          periodYear: data.periodYear,
          periodMonth: data.periodMonth,
          type,
          amountDue,
          status: "ISSUED",
          issuedAt: new Date(),
          dueDate: data.dueDate ? parseDate(data.dueDate) : null,
          lines: {
            create: lines
          }
        },
        include: {
          child: true,
          payer: true,
          lines: true
        }
      });

      await auditService.createLog({
        action: "CREATE",
        entityType: "Invoice",
        entityId: createdInvoice.id,
        before: null,
        after: {
          childId: createdInvoice.childId,
          payerId: createdInvoice.payerId,
          periodYear: createdInvoice.periodYear,
          periodMonth: createdInvoice.periodMonth,
          type: createdInvoice.type,
          amountDue: createdInvoice.amountDue.toString(),
          status: createdInvoice.status
        }
      }, tx);

      return createdInvoice;
    });

    return serializeInvoice(invoice);
  } catch (error) {
    if (error.code === "P2002") {
      fail(
        "Invoice already exists for this period",
        HTTP_STATUS.CONFLICT,
        "INVOICE_ALREADY_EXISTS"
      );
    }

    throw error;
  }
}

async function createMonthly(data) {
  return createInvoice(data, "MONTHLY");
}

async function createAnnual(data) {
  return createInvoice(data, "ANNUAL");
}

async function getAll(filters = {}) {
  const where = {};

  if (filters.childId) {
    where.childId = filters.childId;
  }

  if (filters.payerId) {
    where.payerId = filters.payerId;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.type) {
    where.type = filters.type;
  }

  if (filters.periodYear !== undefined) {
    where.periodYear = Number(filters.periodYear);
  }

  if (filters.periodMonth !== undefined) {
    where.periodMonth = Number(filters.periodMonth);
  }

  const invoices = await prisma.invoice.findMany({
    where,
    include: {
      child: true,
      payer: true,
      lines: true,
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
    },
    orderBy: [
      { periodYear: "desc" },
      { periodMonth: "desc" },
      { createdAt: "desc" }
    ]
  });

  return invoices.map((invoice) => {
    const paidAmount = getPaidAmountFromAllocations(invoice.allocations);

    return serializeInvoice(invoice, paidAmount);
  });
}

async function getById(id) {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      child: true,
      payer: true,
      lines: true,
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

  if (!invoice) {
    fail("Invoice not found", HTTP_STATUS.NOT_FOUND, "INVOICE_NOT_FOUND");
  }

  const paidAmount = getPaidAmountFromAllocations(invoice.allocations);

  return serializeInvoice(invoice, paidAmount);
}

async function cancel(id) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id },
      include: {
        lines: true
      }
    });

    if (!invoice) {
      fail("Invoice not found", HTTP_STATUS.NOT_FOUND, "INVOICE_NOT_FOUND");
    }

    if (invoice.status === "CANCELLED") {
      fail(
        "Invoice is already cancelled",
        HTTP_STATUS.CONFLICT,
        "INVOICE_ALREADY_CANCELLED"
      );
    }

    if (
      invoice.status === "PAID" ||
      invoice.status === "PARTIALLY_PAID"
    ) {
      fail(
        "Paid or partially paid invoice cannot be cancelled",
        HTTP_STATUS.CONFLICT,
        "INVOICE_HAS_PAYMENTS"
      );
    }

    const paidAmount = await getPaidAmount(tx, id);

    if (paidAmount > 0n) {
      fail(
        "Invoice has completed payments",
        HTTP_STATUS.CONFLICT,
        "INVOICE_HAS_PAYMENTS"
      );
    }

    const updatedInvoice = await tx.invoice.update({
      where: { id },
      data: {
        status: "CANCELLED"
      },
      include: {
        child: true,
        payer: true,
        lines: true
      }
    });

    await auditService.createLog({
      action: "CANCEL",
      entityType: "Invoice",
      entityId: id,
      before: {
        status: invoice.status
      },
      after: {
        status: updatedInvoice.status
      }
    }, tx);

    return serializeInvoice(updatedInvoice);
  });
}

module.exports = {
  createMonthly,
  createAnnual,
  getAll,
  getById,
  cancel
};