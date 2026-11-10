const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/app-error");
const HTTP_STATUS = require("../../../utils/http-status");
const auditService = require("../../audit/audit.service");
const creditService = require("../credit-balance.service");

function fail(message, status, code) {
  throw new AppError(message, status, code);
}

async function getLatestAdjustment(tx, invoiceId) {
  return tx.invoiceAdjustment.findFirst({
    where: { originalInvoiceId: invoiceId },
    orderBy: { createdAt: "desc" }
  });
}

async function updateInvoiceStatus(tx, invoiceId) {
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.status === "CANCELLED" || invoice.status === "DRAFT") return invoice;

  const [amountDue, paidAmount] = await Promise.all([
    creditService.getEffectiveInvoiceAmount(tx, invoice),
    creditService.getInvoicePaidAmount(tx, invoiceId)
  ]);
  const status = paidAmount >= amountDue ? "PAID" : paidAmount > 0n ? "PARTIALLY_PAID" : "ISSUED";
  return tx.invoice.update({ where: { id: invoiceId }, data: { status } });
}

async function getCashPaid(tx, invoiceId) {
  const allocations = await tx.paymentAllocation.findMany({
    where: { invoiceId, payment: { status: "COMPLETED" } },
    select: { amount: true }
  });
  return allocations.reduce((sum, item) => sum + item.amount, 0n);
}

async function restoreAppliedCreditForReduction(
  tx,
  invoiceId,
  payerId,
  adjustmentId,
  amount,
  actorId
) {
  let remaining = amount;
  const applications = await tx.creditBalanceTransaction.findMany({
    where: { invoiceId, type: "APPLY_TO_INVOICE" },
    orderBy: { createdAt: "desc" }
  });

  for (const application of applications) {
    if (remaining <= 0n) break;
    const reversals = await tx.creditBalanceTransaction.findMany({
      where: { reversalOfId: application.id, type: "CREDIT_APPLICATION_REVERSAL" },
      select: { amountDelta: true }
    });
    const alreadyRestored = reversals.reduce((sum, item) => sum + item.amountDelta, 0n);
    const stillApplied = -application.amountDelta - alreadyRestored;
    if (stillApplied <= 0n) continue;

    const restore = stillApplied < remaining ? stillApplied : remaining;
    await creditService.postTransaction(tx, {
      parentId: payerId,
      type: "CREDIT_APPLICATION_REVERSAL",
      amountDelta: restore,
      invoiceId,
      sourceTransactionId: application.sourceTransactionId,
      adjustmentId,
      reversalOfId: application.id,
      idempotencyKey: `adjustment-${adjustmentId}-restore-${application.id}`,
      actorId,
      description: `Restore credit after invoice adjustment ${adjustmentId}`
    });
    remaining -= restore;
  }

  return remaining;
}

async function create(invoiceId, { reason, adjustedAmount }, actorId) {
  const targetAmount = BigInt(adjustedAmount);
  if (targetAmount < 0n) {
    fail(
      "Adjusted amount cannot be negative",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "INVALID_ADJUSTED_AMOUNT"
    );
  }
  if (!reason || reason.trim().length < 5) {
    fail(
      "Adjustment reason must contain at least 5 characters",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "INVALID_ADJUSTMENT_REASON"
    );
  }

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) fail("Invoice not found", HTTP_STATUS.NOT_FOUND, "INVOICE_NOT_FOUND");
    if (["DRAFT", "CANCELLED"].includes(invoice.status)) {
      fail("Only issued invoices can be adjusted", HTTP_STATUS.CONFLICT, "INVOICE_NOT_ADJUSTABLE");
    }

    const latest = await getLatestAdjustment(tx, invoiceId);
    const previousAmount = latest ? latest.adjustedAmount : invoice.amountDue;
    if (targetAmount === previousAmount) {
      fail(
        "Adjusted amount must differ from current amount",
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        "NO_ADJUSTMENT_CHANGE"
      );
    }

    const [cashPaid, creditPaid] = await Promise.all([
      getCashPaid(tx, invoiceId),
      creditService.getInvoiceCreditPaidAmount(tx, invoiceId)
    ]);
    const paidAmount = cashPaid + creditPaid;
    const previousExcess = paidAmount > previousAmount ? paidAmount - previousAmount : 0n;
    const nextExcess = paidAmount > targetAmount ? paidAmount - targetAmount : 0n;
    const newExcess = nextExcess > previousExcess ? nextExcess - previousExcess : 0n;

    const adjustment = await tx.invoiceAdjustment.create({
      data: {
        originalInvoiceId: invoiceId,
        payerId: invoice.payerId,
        reason: reason.trim(),
        previousAmount,
        adjustedAmount: targetAmount,
        createdById: actorId || null
      }
    });

    let remainingExcess = newExcess;
    if (remainingExcess > 0n && creditPaid > 0n) {
      const restoreAmount = remainingExcess < creditPaid ? remainingExcess : creditPaid;
      remainingExcess = await restoreAppliedCreditForReduction(
        tx,
        invoiceId,
        invoice.payerId,
        adjustment.id,
        restoreAmount,
        actorId
      );
    }

    if (remainingExcess > 0n) {
      const allocations = await tx.paymentAllocation.findMany({
        where: { invoiceId, payment: { status: "COMPLETED" } },
        include: { payment: true },
        orderBy: { createdAt: "desc" }
      });

      for (const allocation of allocations) {
        if (remainingExcess <= 0n) break;
        const existingCredits = await tx.creditBalanceTransaction.findMany({
          where: {
            invoiceId,
            paymentId: allocation.paymentId,
            type: { in: ["ADJUSTMENT_CREDIT", "REVERSAL"] }
          },
          select: { amountDelta: true }
        });
        const alreadyCredited = existingCredits.reduce((sum, item) => sum + item.amountDelta, 0n);
        const capacity = allocation.amount - alreadyCredited;
        if (capacity <= 0n) continue;
        const creditAmount = capacity < remainingExcess ? capacity : remainingExcess;

        await creditService.postTransaction(tx, {
          parentId: invoice.payerId,
          type: "ADJUSTMENT_CREDIT",
          amountDelta: creditAmount,
          invoiceId,
          paymentId: allocation.paymentId,
          adjustmentId: adjustment.id,
          idempotencyKey: `invoice-adjustment-credit:${adjustment.id}:${allocation.id}`,
          actorId,
          description: `Credit created by invoice adjustment ${adjustment.id}`
        });
        remainingExcess -= creditAmount;
      }

      if (remainingExcess > 0n) {
        fail(
          "Unable to attribute the adjustment credit to completed payment allocations",
          HTTP_STATUS.CONFLICT,
          "ADJUSTMENT_CREDIT_ALLOCATION_MISMATCH"
        );
      }
    }

    const updatedInvoice = await updateInvoiceStatus(tx, invoiceId);
    await auditService.createLog(
      {
        actorId,
        action: "UPDATE",
        entityType: "InvoiceAdjustment",
        entityId: adjustment.id,
        before: { invoiceId, amountDue: previousAmount, status: invoice.status },
        after: {
          adjustment,
          amountDue: targetAmount,
          status: updatedInvoice.status,
          creditIssued: newExcess
        }
      },
      tx
    );

    return {
      ...adjustment,
      previousAmount: previousAmount.toString(),
      adjustedAmount: targetAmount.toString(),
      delta: (targetAmount - previousAmount).toString(),
      creditIssued: newExcess.toString(),
      invoiceStatus: updatedInvoice.status
    };
  });
}

async function getHistory(invoiceId, user) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { payer: true }
  });
  if (!invoice) fail("Invoice not found", HTTP_STATUS.NOT_FOUND, "INVOICE_NOT_FOUND");
  if (user.role === "PARENT" && invoice.payer.userId !== user.id) {
    fail("You do not have permission to access this invoice", HTTP_STATUS.FORBIDDEN, "FORBIDDEN");
  }

  const adjustments = await prisma.invoiceAdjustment.findMany({
    where: { originalInvoiceId: invoiceId },
    orderBy: { createdAt: "asc" }
  });
  return adjustments.map((item) => ({
    ...item,
    previousAmount: item.previousAmount.toString(),
    adjustedAmount: item.adjustedAmount.toString(),
    delta: (item.adjustedAmount - item.previousAmount).toString()
  }));
}

async function cancel(adjustmentId, actorId) {
  return prisma.$transaction(async (tx) => {
    const adjustment = await tx.invoiceAdjustment.findUnique({ where: { id: adjustmentId } });
    if (!adjustment) fail("Adjustment not found", HTTP_STATUS.NOT_FOUND, "ADJUSTMENT_NOT_FOUND");
    if (adjustment.reversedFromId) {
      fail(
        "A reversal document cannot be cancelled",
        HTTP_STATUS.CONFLICT,
        "ADJUSTMENT_REVERSAL_NOT_CANCELLABLE"
      );
    }
    const existingReversal = await tx.invoiceAdjustment.findFirst({
      where: { reversedFromId: adjustment.id }
    });
    if (existingReversal) {
      fail("Adjustment is already cancelled", HTTP_STATUS.CONFLICT, "ADJUSTMENT_ALREADY_CANCELLED");
    }

    const latest = await getLatestAdjustment(tx, adjustment.originalInvoiceId);
    if (!latest || latest.id !== adjustment.id) {
      fail(
        "Only the latest adjustment can be cancelled",
        HTTP_STATUS.CONFLICT,
        "ONLY_LATEST_ADJUSTMENT_CAN_BE_CANCELLED"
      );
    }

    const invoice = await tx.invoice.findUnique({ where: { id: adjustment.originalInvoiceId } });
    const creditEntries = await tx.creditBalanceTransaction.findMany({
      where: { adjustmentId: adjustment.id }
    });

    for (const entry of creditEntries) {
      if (entry.type === "ADJUSTMENT_CREDIT") {
        await creditService.reverseSource(tx, entry, actorId);
      } else if (entry.type === "CREDIT_APPLICATION_REVERSAL") {
        const related = await tx.creditBalanceTransaction.findMany({
          where: {
            sourceTransactionId: entry.sourceTransactionId,
            type: { in: ["APPLY_TO_INVOICE", "CREDIT_APPLICATION_REVERSAL"] }
          },
          select: { amountDelta: true }
        });
        const sourceBalance = related.reduce((sum, item) => sum + item.amountDelta, 0n);
        const source = await tx.creditBalanceTransaction.findUnique({
          where: { id: entry.sourceTransactionId }
        });
        const sourcePayment = source?.paymentId
          ? await tx.payment.findUnique({ where: { id: source.paymentId } })
          : null;
        if (sourcePayment?.status === "CANCELLED") continue;
        const availableFromSource = (source?.amountDelta || 0n) + sourceBalance;
        if (availableFromSource < entry.amountDelta) {
          fail(
            "Credit released by this adjustment has already been used. Reverse the later credit operation first.",
            HTTP_STATUS.CONFLICT,
            "ADJUSTMENT_CREDIT_ALREADY_USED"
          );
        }
        await creditService.postTransaction(tx, {
          parentId: invoice.payerId,
          type: "APPLY_TO_INVOICE",
          amountDelta: -entry.amountDelta,
          invoiceId: invoice.id,
          sourceTransactionId: entry.sourceTransactionId,
          idempotencyKey: `cancel-adjustment-reapply:${adjustment.id}:${entry.id}`,
          actorId,
          description: `Reapply credit after adjustment cancellation ${adjustment.id}`
        });
      }
    }

    const reversal = await tx.invoiceAdjustment.create({
      data: {
        originalInvoiceId: adjustment.originalInvoiceId,
        payerId: adjustment.payerId,
        reason: `Сторнування коригування ${adjustment.id}`,
        previousAmount: adjustment.adjustedAmount,
        adjustedAmount: adjustment.previousAmount,
        createdById: actorId || null,
        reversedFromId: adjustment.id
      }
    });

    const updatedInvoice = await updateInvoiceStatus(tx, invoice.id);
    await auditService.createLog(
      {
        actorId,
        action: "CANCEL",
        entityType: "InvoiceAdjustment",
        entityId: reversal.id,
        before: adjustment,
        after: reversal
      },
      tx
    );

    return {
      ...reversal,
      previousAmount: reversal.previousAmount.toString(),
      adjustedAmount: reversal.adjustedAmount.toString(),
      delta: (reversal.adjustedAmount - reversal.previousAmount).toString(),
      invoiceStatus: updatedInvoice.status
    };
  });
}

module.exports = { create, getHistory, cancel };
