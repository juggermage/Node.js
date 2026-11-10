const prisma = require("../../config/prisma");
const AppError = require("../../utils/app-error");
const HTTP_STATUS = require("../../utils/http-status");
const auditService = require("../audit/audit.service");

function fail(message, status, code) {
  throw new AppError(message, status, code);
}

async function ensureBalance(tx, parentId) {
  return tx.creditBalance.upsert({
    where: { parentId },
    create: { parentId, balance: 0n },
    update: {}
  });
}

async function postTransaction(tx, data) {
  const existing = await tx.creditBalanceTransaction.findUnique({
    where: { idempotencyKey: data.idempotencyKey }
  });
  if (existing) return existing;

  const balance = await ensureBalance(tx, data.parentId);
  const amountDelta = BigInt(data.amountDelta);
  const nextBalance = balance.balance + amountDelta;

  if (nextBalance < 0n) {
    fail("Credit balance is insufficient", HTTP_STATUS.CONFLICT, "INSUFFICIENT_CREDIT_BALANCE");
  }

  const updatedBalance = await tx.creditBalance.update({
    where: { id: balance.id },
    data: { balance: nextBalance }
  });

  const transaction = await tx.creditBalanceTransaction.create({
    data: {
      balanceId: balance.id,
      parentId: data.parentId,
      type: data.type,
      amountDelta,
      balanceAfter: updatedBalance.balance,
      paymentId: data.paymentId || null,
      invoiceId: data.invoiceId || null,
      sourceTransactionId: data.sourceTransactionId || null,
      adjustmentId: data.adjustmentId || null,
      reversalOfId: data.reversalOfId || null,
      idempotencyKey: data.idempotencyKey,
      description: data.description || null
    }
  });

  await auditService.createLog(
    {
      actorId: data.actorId || null,
      action:
        data.type === "REVERSAL" || data.type === "CREDIT_APPLICATION_REVERSAL"
          ? "CANCEL"
          : "PAYMENT",
      entityType: "CreditBalanceTransaction",
      entityId: transaction.id,
      before: { balance: balance.balance },
      after: transaction
    },
    tx
  );

  return transaction;
}

async function getInvoiceCreditPaidAmount(tx, invoiceId, endExclusive) {
  const entries = await tx.creditBalanceTransaction.findMany({
    where: {
      invoiceId,
      type: { in: ["APPLY_TO_INVOICE", "CREDIT_APPLICATION_REVERSAL"] },
      ...(endExclusive ? { createdAt: { lt: endExclusive } } : {})
    },
    select: { amountDelta: true }
  });

  const signed = entries.reduce((sum, entry) => sum + entry.amountDelta, 0n);
  return -signed;
}

async function getInvoicePaidAmount(tx, invoiceId, endExclusive) {
  const [allocations, adjustmentCredits] = await Promise.all([
    tx.paymentAllocation.findMany({
      where: {
        invoiceId,
        payment: {
          status: "COMPLETED",
          ...(endExclusive ? { paidAt: { lt: endExclusive } } : {})
        }
      },
      select: { amount: true }
    }),
    tx.creditBalanceTransaction.findMany({
      where: {
        invoiceId,
        type: { in: ["ADJUSTMENT_CREDIT", "REVERSAL"] },
        ...(endExclusive ? { createdAt: { lt: endExclusive } } : {})
      },
      select: { amountDelta: true, type: true, sourceTransactionId: true }
    })
  ]);

  const cashPaid = allocations.reduce((sum, item) => sum + item.amount, 0n);
  const adjustmentCredit = adjustmentCredits.reduce((sum, item) => sum + item.amountDelta, 0n);
  const creditPaid = await getInvoiceCreditPaidAmount(tx, invoiceId, endExclusive);
  const adjustedCashPaid = cashPaid - adjustmentCredit;

  return (adjustedCashPaid > 0n ? adjustedCashPaid : 0n) + creditPaid;
}

async function getEffectiveInvoiceAmount(tx, invoice) {
  const adjustment = await tx.invoiceAdjustment.findFirst({
    where: { originalInvoiceId: invoice.id },
    orderBy: { createdAt: "desc" }
  });
  return adjustment ? adjustment.adjustedAmount : invoice.amountDue;
}

async function getInvoiceOutstanding(tx, invoice) {
  const [amountDue, paidAmount] = await Promise.all([
    getEffectiveInvoiceAmount(tx, invoice),
    getInvoicePaidAmount(tx, invoice.id)
  ]);
  return {
    amountDue,
    paidAmount,
    outstanding: amountDue > paidAmount ? amountDue - paidAmount : 0n
  };
}

async function applyCredit(tx, { parentId, invoiceId, amount, idempotencyKey, actorId }) {
  const duplicate = await tx.creditBalanceTransaction.findFirst({
    where: { idempotencyKey: { startsWith: `${idempotencyKey}:` } }
  });
  if (duplicate) {
    fail("Credit application already exists", HTTP_STATUS.CONFLICT, "DUPLICATE_CREDIT_OPERATION");
  }

  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.payerId !== parentId) {
    fail("Invoice not found for this payer", HTTP_STATUS.NOT_FOUND, "INVOICE_NOT_FOUND");
  }
  if (!["ISSUED", "PARTIALLY_PAID"].includes(invoice.status)) {
    fail("Invoice is not payable", HTTP_STATUS.CONFLICT, "INVOICE_NOT_PAYABLE");
  }

  const balance = await ensureBalance(tx, parentId);
  const { outstanding } = await getInvoiceOutstanding(tx, invoice);
  if (outstanding <= 0n) {
    fail("Invoice has no outstanding balance", HTTP_STATUS.CONFLICT, "INVOICE_ALREADY_PAID");
  }

  const requested =
    amount === undefined || amount === null
      ? balance.balance < outstanding
        ? balance.balance
        : outstanding
      : BigInt(amount);

  if (requested <= 0n || requested > balance.balance || requested > outstanding) {
    fail(
      "Requested amount exceeds available credit or invoice balance",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "INVALID_CREDIT_AMOUNT"
    );
  }

  const sources = await tx.creditBalanceTransaction.findMany({
    where: { parentId, type: { in: ["OVERPAYMENT", "ADJUSTMENT_CREDIT"] } },
    orderBy: { createdAt: "asc" }
  });

  let remaining = requested;
  const created = [];

  for (const source of sources) {
    if (remaining <= 0n) break;

    const related = await tx.creditBalanceTransaction.findMany({
      where: {
        OR: [{ id: source.id }, { sourceTransactionId: source.id }]
      },
      select: { amountDelta: true }
    });
    const sourceAvailable = related.reduce((sum, item) => sum + item.amountDelta, 0n);
    if (sourceAvailable <= 0n) continue;

    const applied = sourceAvailable < remaining ? sourceAvailable : remaining;
    const entry = await postTransaction(tx, {
      parentId,
      type: "APPLY_TO_INVOICE",
      amountDelta: -applied,
      invoiceId,
      sourceTransactionId: source.id,
      idempotencyKey: `${idempotencyKey}:${source.id}`,
      actorId,
      description: `Credit applied to invoice ${invoiceId}`
    });
    created.push(entry);
    remaining -= applied;
  }

  if (remaining !== 0n) {
    fail("Credit ledger does not match balance", HTTP_STATUS.CONFLICT, "CREDIT_LEDGER_MISMATCH");
  }

  return { appliedAmount: requested, balance: balance.balance - requested, transactions: created };
}

async function reverseSource(tx, source, actorId) {
  const existingReversal = await tx.creditBalanceTransaction.findFirst({
    where: { reversalOfId: source.id, type: "REVERSAL" }
  });
  if (existingReversal) return [];

  const applications = await tx.creditBalanceTransaction.findMany({
    where: { sourceTransactionId: source.id, type: "APPLY_TO_INVOICE" }
  });
  const affectedInvoiceIds = [];

  for (const application of applications) {
    const applicationReversals = await tx.creditBalanceTransaction.findMany({
      where: { reversalOfId: application.id, type: "CREDIT_APPLICATION_REVERSAL" }
    });
    const alreadyReversed = applicationReversals.reduce((sum, item) => sum + item.amountDelta, 0n);
    const toRestore = -application.amountDelta - alreadyReversed;
    if (toRestore <= 0n) continue;

    await postTransaction(tx, {
      parentId: source.parentId,
      type: "CREDIT_APPLICATION_REVERSAL",
      amountDelta: toRestore,
      invoiceId: application.invoiceId,
      sourceTransactionId: source.id,
      reversalOfId: application.id,
      idempotencyKey: `credit-application-reversal:${application.id}:${applicationReversals.length + 1}`,
      actorId,
      description: `Restore credit application for invoice ${application.invoiceId}`
    });
    if (application.invoiceId) affectedInvoiceIds.push(application.invoiceId);
  }

  const related = await tx.creditBalanceTransaction.findMany({
    where: { OR: [{ id: source.id }, { sourceTransactionId: source.id }] },
    select: { amountDelta: true }
  });
  const remainingSourceBalance = related.reduce((sum, item) => sum + item.amountDelta, 0n);

  if (remainingSourceBalance > 0n) {
    await postTransaction(tx, {
      parentId: source.parentId,
      type: "REVERSAL",
      amountDelta: -remainingSourceBalance,
      paymentId: source.paymentId,
      invoiceId: source.invoiceId,
      sourceTransactionId: source.id,
      reversalOfId: source.id,
      idempotencyKey: `credit-source-reversal:${source.id}`,
      actorId,
      description: `Reverse credit source ${source.id}`
    });
  }

  return affectedInvoiceIds;
}

async function reversePaymentCredits(tx, paymentId, actorId) {
  const sources = await tx.creditBalanceTransaction.findMany({
    where: { paymentId, type: { in: ["OVERPAYMENT", "ADJUSTMENT_CREDIT"] } }
  });
  const affected = [];
  for (const source of sources) {
    affected.push(...(await reverseSource(tx, source, actorId)));
  }
  return affected;
}

async function restoreInvoiceCreditApplications(tx, invoiceId, actorId) {
  const applications = await tx.creditBalanceTransaction.findMany({
    where: { invoiceId, type: "APPLY_TO_INVOICE" }
  });
  for (const application of applications) {
    const reversals = await tx.creditBalanceTransaction.findMany({
      where: { reversalOfId: application.id, type: "CREDIT_APPLICATION_REVERSAL" },
      select: { amountDelta: true }
    });
    const restored = reversals.reduce((sum, item) => sum + item.amountDelta, 0n);
    const remaining = -application.amountDelta - restored;
    if (remaining <= 0n) continue;
    await postTransaction(tx, {
      parentId: application.parentId,
      type: "CREDIT_APPLICATION_REVERSAL",
      amountDelta: remaining,
      invoiceId,
      sourceTransactionId: application.sourceTransactionId,
      reversalOfId: application.id,
      idempotencyKey: `cancel-invoice-credit-application:${invoiceId}:${application.id}`,
      actorId,
      description: `Restore credit after invoice ${invoiceId} cancellation`
    });
  }
}

async function getBalance(parentId) {
  const balance = await prisma.creditBalance.findUnique({ where: { parentId } });
  const transactions = await prisma.creditBalanceTransaction.findMany({
    where: { parentId },
    orderBy: { createdAt: "desc" },
    take: 100
  });
  return {
    parentId,
    balance: (balance?.balance || 0n).toString(),
    transactions: transactions.map((item) => ({
      ...item,
      amountDelta: item.amountDelta.toString(),
      balanceAfter: item.balanceAfter.toString()
    }))
  };
}

module.exports = {
  ensureBalance,
  postTransaction,
  getInvoiceCreditPaidAmount,
  getEffectiveInvoiceAmount,
  getInvoicePaidAmount,
  getInvoiceOutstanding,
  applyCredit,
  reverseSource,
  reversePaymentCredits,
  restoreInvoiceCreditApplications,
  getBalance
};
