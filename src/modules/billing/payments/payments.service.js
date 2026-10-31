const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/app-error");
const HTTP_STATUS = require("../../../utils/http-status");

function fail(message, status, code) {
  throw new AppError(message, status, code);
}

async function serializePayment(payment) {
  const allocations = await Promise.all(
    (payment.allocations || []).map(async (allocation) => {
      const serialized = { ...allocation, amount: Number(allocation.amount) };

      if (allocation.invoice) {
        const [currentInvoice, invoiceAllocations] = await Promise.all([
          prisma.invoice.findUnique({ where: { id: allocation.invoiceId } }),
          prisma.paymentAllocation.findMany({
            where: {
              invoiceId: allocation.invoiceId,
              payment: { status: "COMPLETED" }
            },
            select: { amount: true }
          })
        ]);
        const paidAmount = invoiceAllocations.reduce((sum, item) => sum + item.amount, 0n);
        const amountDue = currentInvoice.amountDue;

        serialized.invoice = {
          ...currentInvoice,
          amountDue: Number(amountDue),
          paidAmount: Number(paidAmount),
          outstandingBalance: Number(amountDue - paidAmount)
        };
      }

      return serialized;
    })
  );

  return { ...payment, amount: Number(payment.amount), allocations };
}

async function calculateInvoiceBalance(tx, invoiceId) {
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });

  if (!invoice) {
    fail("Invoice not found", HTTP_STATUS.NOT_FOUND, "INVOICE_NOT_FOUND");
  }

  const allocations = await tx.paymentAllocation.findMany({
    where: {
      invoiceId,
      payment: { status: "COMPLETED" }
    },
    select: { amount: true }
  });

  const paidAmount = allocations.reduce((sum, item) => sum + item.amount, 0n);
  const amountDue = invoice.amountDue;
  const balance = amountDue - paidAmount;

  return { invoice, paidAmount, balance };
}

async function updateInvoiceStatus(tx, invoiceId) {
  const { invoice, paidAmount, balance } = await calculateInvoiceBalance(tx, invoiceId);

  if (invoice.status === "DRAFT" || invoice.status === "CANCELLED") {
    return { invoice, paidAmount, balance };
  }

  let status = "ISSUED";

  if (paidAmount >= invoice.amountDue) {
    status = "PAID";
  } else if (paidAmount > 0n) {
    status = "PARTIALLY_PAID";
  }

  const updatedInvoice = await tx.invoice.update({
    where: { id: invoiceId },
    data: { status }
  });

  return { invoice: updatedInvoice, paidAmount, balance };
}

async function create(data) {
  try {
    const payment = await prisma.$transaction(async (tx) => {
      const existingPayment = await tx.payment.findUnique({
        where: { idempotencyKey: data.idempotencyKey }
      });

      if (existingPayment) {
        fail(
          "Payment with this idempotency key already exists",
          HTTP_STATUS.CONFLICT,
          "DUPLICATE_PAYMENT"
        );
      }

      const payer = await tx.parent.findUnique({ where: { id: data.payerId } });

      if (!payer) {
        fail("Payer not found", HTTP_STATUS.NOT_FOUND, "PAYER_NOT_FOUND");
      }

      const invoiceIds = data.allocations.map((item) => item.invoiceId);
      const invoices = await tx.invoice.findMany({ where: { id: { in: invoiceIds } } });

      if (invoices.length !== invoiceIds.length) {
        fail("One or more invoices were not found", HTTP_STATUS.NOT_FOUND, "INVOICE_NOT_FOUND");
      }

      const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));

      for (const allocation of data.allocations) {
        const invoice = invoiceById.get(allocation.invoiceId);

        if (invoice.payerId !== data.payerId) {
          fail(
            "Payment payer must match every invoice payer",
            HTTP_STATUS.UNPROCESSABLE_ENTITY,
            "PAYER_MISMATCH"
          );
        }

        if (invoice.status !== "ISSUED" && invoice.status !== "PARTIALLY_PAID") {
          fail(
            "Only issued or partially paid invoices can receive payments",
            HTTP_STATUS.UNPROCESSABLE_ENTITY,
            "INVOICE_NOT_PAYABLE"
          );
        }

        const { balance } = await calculateInvoiceBalance(tx, invoice.id);

        if (BigInt(allocation.amount) > balance) {
          fail(
            "Allocation exceeds the invoice outstanding balance",
            HTTP_STATUS.UNPROCESSABLE_ENTITY,
            "ALLOCATION_EXCEEDS_BALANCE"
          );
        }
      }

      const createdPayment = await tx.payment.create({
        data: {
          payerId: data.payerId,
          idempotencyKey: data.idempotencyKey,
          amount: BigInt(data.amount),
          method: data.method,
          status: "COMPLETED",
          paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
          allocations: {
            create: data.allocations.map((allocation) => ({
              invoiceId: allocation.invoiceId,
              amount: BigInt(allocation.amount)
            }))
          }
        },
        include: {
          allocations: { include: { invoice: true } }
        }
      });

      for (const invoiceId of invoiceIds) {
        await updateInvoiceStatus(tx, invoiceId);
      }

      return createdPayment;
    });

    return serializePayment(payment);
  } catch (error) {
    if (error.code === "P2002") {
      fail(
        "Payment with this idempotency key already exists",
        HTTP_STATUS.CONFLICT,
        "DUPLICATE_PAYMENT"
      );
    }

    throw error;
  }
}

async function getAll(filters = {}) {
  const where = {};

  if (filters.payerId) where.payerId = filters.payerId;
  if (filters.status) where.status = filters.status;
  if (filters.from || filters.to) {
    where.paidAt = {};
    if (filters.from) where.paidAt.gte = new Date(filters.from);
    if (filters.to) where.paidAt.lte = new Date(filters.to);
  }

  const payments = await prisma.payment.findMany({
    where,
    include: { allocations: { include: { invoice: true } } },
    orderBy: { createdAt: "desc" }
  });

  return Promise.all(payments.map(serializePayment));
}

async function getById(id) {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { allocations: { include: { invoice: true } }, payer: true }
  });

  if (!payment) {
    fail("Payment not found", HTTP_STATUS.NOT_FOUND, "PAYMENT_NOT_FOUND");
  }

  return serializePayment(payment);
}

async function cancel(id) {
  const payment = await prisma.$transaction(async (tx) => {
    const existingPayment = await tx.payment.findUnique({
      where: { id },
      include: { allocations: true }
    });

    if (!existingPayment) {
      fail("Payment not found", HTTP_STATUS.NOT_FOUND, "PAYMENT_NOT_FOUND");
    }

    if (existingPayment.status === "CANCELLED") {
      fail("Payment is already cancelled", HTTP_STATUS.CONFLICT, "PAYMENT_ALREADY_CANCELLED");
    }

    if (existingPayment.status !== "COMPLETED") {
      fail(
        "Only completed payments can be cancelled",
        HTTP_STATUS.CONFLICT,
        "PAYMENT_NOT_COMPLETED"
      );
    }

    const updatedPayment = await tx.payment.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: { allocations: { include: { invoice: true } } }
    });

    const invoiceIds = [...new Set(existingPayment.allocations.map((item) => item.invoiceId))];

    for (const invoiceId of invoiceIds) {
      await updateInvoiceStatus(tx, invoiceId);
    }

    return updatedPayment;
  });

  return serializePayment(payment);
}

module.exports = { create, getAll, getById, cancel };
