const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/app-error");
const HTTP_STATUS = require("../../../utils/http-status");
const auditService = require("../../audit/audit.service");
const creditService = require("../credit-balance.service");

function fail(message, status, code) {
  throw new AppError(message, status, code);
}

function forbid() {
  fail("You do not have permission to access this payment", HTTP_STATUS.FORBIDDEN, "FORBIDDEN");
}

async function getParentId(user) {
  const parent = await prisma.parent.findUnique({
    where: {
      userId: user.id
    },
    select: {
      id: true
    }
  });

  if (!parent) {
    fail("Parent profile not found", HTTP_STATUS.NOT_FOUND, "PARENT_NOT_FOUND");
  }

  return parent.id;
}

async function serializePayment(payment) {
  const allocations = await Promise.all(
    (payment.allocations || []).map(async (allocation) => {
      const serialized = {
        ...allocation,
        amount: Number(allocation.amount)
      };

      if (allocation.invoice) {
        const currentInvoice = await prisma.invoice.findUnique({
          where: { id: allocation.invoiceId }
        });

        if (currentInvoice) {
          const balance = await calculateInvoiceBalance(prisma, allocation.invoiceId);
          serialized.invoice = {
            ...currentInvoice,
            amountDue: balance.amountDue.toString(),
            paidAmount: balance.paidAmount.toString(),
            outstandingBalance: balance.balance.toString()
          };
        }
      }

      return serialized;
    })
  );

  return {
    ...payment,
    amount: Number(payment.amount),
    allocations
  };
}

async function calculateInvoiceBalance(tx, invoiceId) {
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) fail("Invoice not found", HTTP_STATUS.NOT_FOUND, "INVOICE_NOT_FOUND");

  const allocations = await tx.paymentAllocation.findMany({
    where: { invoiceId, payment: { status: "COMPLETED" } },
    select: { amount: true }
  });
  const cashPaid = allocations.reduce((sum, item) => sum + item.amount, 0n);
  const amountDue = tx.invoiceAdjustment
    ? await creditService.getEffectiveInvoiceAmount(tx, invoice)
    : invoice.amountDue;
  const creditPaid = tx.creditBalanceTransaction
    ? await creditService.getInvoiceCreditPaidAmount(tx, invoiceId)
    : 0n;
  const adjustmentCredits = tx.creditBalanceTransaction
    ? await tx.creditBalanceTransaction.findMany({
        where: { invoiceId, type: { in: ["ADJUSTMENT_CREDIT", "REVERSAL"] } },
        select: { amountDelta: true }
      })
    : [];
  const issuedCredit = adjustmentCredits.reduce((sum, item) => sum + item.amountDelta, 0n);
  const effectiveCashPaid = cashPaid - issuedCredit > 0n ? cashPaid - issuedCredit : 0n;
  const paidAmount = effectiveCashPaid + creditPaid;
  const balance = amountDue > paidAmount ? amountDue - paidAmount : 0n;

  return { invoice, paidAmount, balance, amountDue };
}

async function updateInvoiceStatus(tx, invoiceId) {
  const { invoice, paidAmount, balance, amountDue } = await calculateInvoiceBalance(tx, invoiceId);

  if (invoice.status === "DRAFT" || invoice.status === "CANCELLED") {
    return {
      invoice,
      paidAmount,
      balance
    };
  }

  let status = "ISSUED";

  if (paidAmount >= amountDue) {
    status = "PAID";
  } else if (paidAmount > 0n) {
    status = "PARTIALLY_PAID";
  }

  const updatedInvoice = await tx.invoice.update({
    where: {
      id: invoiceId
    },
    data: {
      status
    }
  });

  return {
    invoice: updatedInvoice,
    paidAmount,
    balance
  };
}

async function create(data, user) {
  try {
    const payment = await prisma.$transaction(async (tx) => {
      if (!Array.isArray(data.allocations) || data.allocations.length === 0) {
        fail(
          "At least one invoice allocation is required",
          HTTP_STATUS.UNPROCESSABLE_ENTITY,
          "INVALID_ALLOCATIONS"
        );
      }

      const paymentAmount = BigInt(data.amount);

      if (paymentAmount <= 0n) {
        fail(
          "Payment amount must be positive",
          HTTP_STATUS.UNPROCESSABLE_ENTITY,
          "INVALID_PAYMENT_AMOUNT"
        );
      }

      const allocationTotal = data.allocations.reduce((sum, item) => {
        const amount = BigInt(item.amount);

        if (amount <= 0n) {
          fail(
            "Allocation amount must be positive",
            HTTP_STATUS.UNPROCESSABLE_ENTITY,
            "INVALID_ALLOCATION_AMOUNT"
          );
        }

        return sum + amount;
      }, 0n);

      if (allocationTotal > paymentAmount) {
        fail(
          "The sum of allocations cannot exceed the payment amount",
          HTTP_STATUS.UNPROCESSABLE_ENTITY,
          "ALLOCATION_TOTAL_EXCEEDS_PAYMENT"
        );
      }

      const invoiceIds = data.allocations.map((item) => item.invoiceId);

      if (new Set(invoiceIds).size !== invoiceIds.length) {
        fail(
          "Each invoice can only be allocated once per payment",
          HTTP_STATUS.UNPROCESSABLE_ENTITY,
          "DUPLICATE_INVOICE_ALLOCATION"
        );
      }

      const existingPayment = await tx.payment.findUnique({
        where: {
          idempotencyKey: data.idempotencyKey
        }
      });

      if (existingPayment) {
        fail(
          "Payment with this idempotency key already exists",
          HTTP_STATUS.CONFLICT,
          "DUPLICATE_PAYMENT"
        );
      }

      const payer = await tx.parent.findUnique({
        where: {
          id: data.payerId
        }
      });

      if (!payer) {
        fail("Payer not found", HTTP_STATUS.NOT_FOUND, "PAYER_NOT_FOUND");
      }

      if (user.role === "PARENT" && payer.userId !== user.id) {
        forbid();
      }

      if (payer.status !== "ACTIVE") {
        fail("Payer is not active", HTTP_STATUS.UNPROCESSABLE_ENTITY, "PAYER_NOT_ACTIVE");
      }

      const invoices = await tx.invoice.findMany({
        where: {
          id: {
            in: invoiceIds
          }
        }
      });

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
          amount: paymentAmount,
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
          allocations: {
            include: {
              invoice: true
            }
          }
        }
      });

      for (const invoiceId of invoiceIds) {
        await updateInvoiceStatus(tx, invoiceId);
      }

      const overpayment = paymentAmount - allocationTotal;
      let overpaymentTransaction = null;
      if (overpayment > 0n) {
        overpaymentTransaction = await creditService.postTransaction(tx, {
          parentId: data.payerId,
          type: "OVERPAYMENT",
          amountDelta: overpayment,
          paymentId: createdPayment.id,
          idempotencyKey: `payment-overpayment:${createdPayment.id}`,
          actorId: user.id,
          description: `Payment overpayment ${createdPayment.id}`
        });
      }

      await auditService.createLog(
        {
          actorId: user.id,
          action: "PAYMENT",
          entityType: "Payment",
          entityId: createdPayment.id,
          before: null,
          after: {
            amount: createdPayment.amount,
            method: createdPayment.method,
            status: createdPayment.status,
            paidAt: createdPayment.paidAt,
            payerId: createdPayment.payerId,
            allocations: createdPayment.allocations.map((item) => ({
              invoiceId: item.invoiceId,
              amount: item.amount
            })),
            overpayment: overpayment.toString(),
            creditTransactionId: overpaymentTransaction?.id || null
          }
        },
        tx
      );

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

async function getAll(filters = {}, user) {
  const where = {};

  if (user.role === "PARENT") {
    where.payerId = await getParentId(user);
  } else if (filters.payerId) {
    where.payerId = filters.payerId;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.from || filters.to) {
    where.paidAt = {};

    if (filters.from) {
      where.paidAt.gte = new Date(filters.from);
    }

    if (filters.to) {
      where.paidAt.lte = new Date(filters.to);
    }
  }

  const payments = await prisma.payment.findMany({
    where,
    include: {
      allocations: {
        include: {
          invoice: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  return Promise.all(payments.map(serializePayment));
}

async function getById(id, user) {
  const payment = await prisma.payment.findUnique({
    where: {
      id
    },
    include: {
      allocations: {
        include: {
          invoice: true
        }
      },
      payer: true
    }
  });

  if (!payment) {
    fail("Payment not found", HTTP_STATUS.NOT_FOUND, "PAYMENT_NOT_FOUND");
  }

  if (user.role === "PARENT" && payment.payer.userId !== user.id) {
    forbid();
  }

  return serializePayment(payment);
}

async function cancel(id, user) {
  const payment = await prisma.$transaction(async (tx) => {
    const existingPayment = await tx.payment.findUnique({
      where: {
        id
      },
      include: {
        allocations: true
      }
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
      where: {
        id
      },
      data: {
        status: "CANCELLED"
      },
      include: {
        allocations: {
          include: {
            invoice: true
          }
        }
      }
    });

    const invoiceIds = [...new Set(existingPayment.allocations.map((item) => item.invoiceId))];
    if (tx.creditBalanceTransaction) {
      const affectedByCredit = await creditService.reversePaymentCredits(tx, id, user.id);
      invoiceIds.push(...affectedByCredit);
    }

    for (const invoiceId of [...new Set(invoiceIds)]) {
      await updateInvoiceStatus(tx, invoiceId);
    }

    await auditService.createLog(
      {
        actorId: user.id,
        action: "CANCEL",
        entityType: "Payment",
        entityId: updatedPayment.id,
        before: {
          status: existingPayment.status
        },
        after: {
          status: updatedPayment.status
        }
      },
      tx
    );

    return updatedPayment;
  });

  return serializePayment(payment);
}

async function applyCredit(data, user) {
  const parentId = user.role === "PARENT" ? await getParentId(user) : data.payerId;
  if (!parentId) fail("Payer is required", HTTP_STATUS.UNPROCESSABLE_ENTITY, "PAYER_REQUIRED");
  if (user.role === "PARENT" && data.payerId && data.payerId !== parentId) forbid();

  return prisma.$transaction(async (tx) => {
    const payer = await tx.parent.findUnique({ where: { id: parentId } });
    if (!payer) fail("Payer not found", HTTP_STATUS.NOT_FOUND, "PAYER_NOT_FOUND");
    if (payer.status !== "ACTIVE") {
      fail("Payer is not active", HTTP_STATUS.UNPROCESSABLE_ENTITY, "PAYER_NOT_ACTIVE");
    }

    const result = await creditService.applyCredit(tx, {
      parentId,
      invoiceId: data.invoiceId,
      amount: data.amount,
      idempotencyKey: data.idempotencyKey,
      actorId: user.id
    });
    await updateInvoiceStatus(tx, data.invoiceId);
    return {
      invoiceId: data.invoiceId,
      appliedAmount: result.appliedAmount.toString(),
      balance: result.balance.toString(),
      transactions: result.transactions.map((item) => ({
        ...item,
        amountDelta: item.amountDelta.toString(),
        balanceAfter: item.balanceAfter.toString()
      }))
    };
  });
}

async function getCreditBalance(user, requestedPayerId) {
  let parentId = requestedPayerId;
  if (user.role === "PARENT") {
    parentId = await getParentId(user);
    if (requestedPayerId && requestedPayerId !== parentId) forbid();
  }
  if (!parentId) fail("Payer is required", HTTP_STATUS.UNPROCESSABLE_ENTITY, "PAYER_REQUIRED");
  return creditService.getBalance(parentId);
}

module.exports = {
  create,
  getAll,
  getById,
  cancel,
  applyCredit,
  getCreditBalance,
  calculateInvoiceBalance,
  updateInvoiceStatus
};
