const prisma = require("../../src/config/prisma");
const auditService = require("../../src/modules/audit/audit.service");
const paymentsService = require("../../src/modules/billing/payments/payments.service");

jest.mock("../../src/config/prisma", () => ({
  $transaction: jest.fn(),
  payment: {
    findMany: jest.fn(),
    findUnique: jest.fn()
  }
}));

jest.mock("../../src/modules/audit/audit.service", () => ({
  createLog: jest.fn().mockResolvedValue({})
}));

const invoice = {
  id: "invoice-1",
  payerId: "parent-1",
  status: "ISSUED",
  amountDue: 1000n
};

const paymentData = {
  payerId: "parent-1",
  idempotencyKey: "key-123",
  amount: 500,
  method: "CASH",
  allocations: [{ invoiceId: "invoice-1", amount: 500 }]
};

const createdPayment = {
  id: "payment-1",
  payerId: "parent-1",
  amount: 500n,
  method: "CASH",
  status: "COMPLETED",
  paidAt: new Date("2026-10-31"),
  allocations: [
    {
      invoiceId: "invoice-1",
      amount: 500n,
      invoice: null
    }
  ]
};

let tx;

beforeEach(() => {
  jest.clearAllMocks();

  tx = {
    payment: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(createdPayment),
      update: jest.fn()
    },
    parent: {
      findUnique: jest.fn().mockResolvedValue({ id: "parent-1" })
    },
    invoice: {
      findMany: jest.fn().mockResolvedValue([invoice]),
      findUnique: jest.fn().mockResolvedValue(invoice),
      update: jest.fn().mockResolvedValue(invoice)
    },
    paymentAllocation: {
      findMany: jest.fn().mockResolvedValue([])
    }
  };

  prisma.$transaction.mockImplementation((callback) => callback(tx));
});

describe("Payments service", () => {
  describe("create", () => {
    test("creates a payment successfully", async () => {
      const result = await paymentsService.create(paymentData);

      expect(tx.payment.create).toHaveBeenCalled();
      expect(tx.invoice.update).toHaveBeenCalledWith({
        where: { id: "invoice-1" },
        data: { status: "ISSUED" }
      });
      expect(auditService.createLog).toHaveBeenCalled();
      expect(result.amount).toBe(500);
      expect(result.status).toBe("COMPLETED");
    });

    test("rejects duplicate idempotency key", async () => {
      tx.payment.findUnique.mockResolvedValue({ id: "existing-payment" });

      await expect(paymentsService.create(paymentData)).rejects.toMatchObject({
        code: "DUPLICATE_PAYMENT"
      });

      expect(tx.payment.create).not.toHaveBeenCalled();
    });

    test("rejects payment when payer does not exist", async () => {
      tx.parent.findUnique.mockResolvedValue(null);

      await expect(paymentsService.create(paymentData)).rejects.toMatchObject({
        code: "PAYER_NOT_FOUND"
      });
    });

    test("rejects payment when invoice does not exist", async () => {
      tx.invoice.findMany.mockResolvedValue([]);

      await expect(paymentsService.create(paymentData)).rejects.toMatchObject({
        code: "INVOICE_NOT_FOUND"
      });
    });

    test("rejects payment when payer does not match invoice payer", async () => {
      tx.invoice.findMany.mockResolvedValue([{ ...invoice, payerId: "another-parent" }]);

      await expect(paymentsService.create(paymentData)).rejects.toMatchObject({
        code: "PAYER_MISMATCH"
      });
    });

    test("rejects payment for an invoice that is not payable", async () => {
      tx.invoice.findMany.mockResolvedValue([{ ...invoice, status: "DRAFT" }]);

      await expect(paymentsService.create(paymentData)).rejects.toMatchObject({
        code: "INVOICE_NOT_PAYABLE"
      });
    });

    test("rejects allocation exceeding outstanding balance", async () => {
      tx.paymentAllocation.findMany.mockResolvedValue([{ amount: 800n }]);

      await expect(
        paymentsService.create({
          ...paymentData,
          allocations: [{ invoiceId: "invoice-1", amount: 300 }]
        })
      ).rejects.toMatchObject({
        code: "ALLOCATION_EXCEEDS_BALANCE"
      });
    });
  });

  describe("getAll", () => {
    test("returns payments with filters", async () => {
      prisma.payment.findMany.mockResolvedValue([createdPayment]);

      const result = await paymentsService.getAll({
        payerId: "parent-1",
        status: "COMPLETED",
        from: "2026-10-01",
        to: "2026-10-31"
      });

      expect(prisma.payment.findMany).toHaveBeenCalledWith({
        where: {
          payerId: "parent-1",
          status: "COMPLETED",
          paidAt: {
            gte: new Date("2026-10-01"),
            lte: new Date("2026-10-31")
          }
        },
        include: { allocations: { include: { invoice: true } } },
        orderBy: { createdAt: "desc" }
      });

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(500);
    });
  });

  describe("getById", () => {
    test("returns payment by ID", async () => {
      prisma.payment.findUnique.mockResolvedValue(createdPayment);

      const result = await paymentsService.getById("payment-1");

      expect(result.id).toBe("payment-1");
      expect(result.amount).toBe(500);
    });

    test("rejects when payment does not exist", async () => {
      prisma.payment.findUnique.mockResolvedValue(null);

      await expect(paymentsService.getById("missing")).rejects.toMatchObject({
        code: "PAYMENT_NOT_FOUND"
      });
    });
  });

  describe("cancel", () => {
    test("cancels a completed payment", async () => {
      const cancelledPayment = {
        ...createdPayment,
        status: "CANCELLED"
      };

      tx.payment.findUnique.mockResolvedValue({
        ...createdPayment,
        allocations: [{ invoiceId: "invoice-1" }]
      });

      tx.payment.update.mockResolvedValue(cancelledPayment);

      const result = await paymentsService.cancel("payment-1");

      expect(tx.payment.update).toHaveBeenCalledWith({
        where: { id: "payment-1" },
        data: { status: "CANCELLED" },
        include: { allocations: { include: { invoice: true } } }
      });

      expect(auditService.createLog).toHaveBeenCalled();
      expect(result.status).toBe("CANCELLED");
    });

    test("rejects when payment does not exist", async () => {
      tx.payment.findUnique.mockResolvedValue(null);

      await expect(paymentsService.cancel("missing")).rejects.toMatchObject({
        code: "PAYMENT_NOT_FOUND"
      });
    });

    test("rejects when payment is already cancelled", async () => {
      tx.payment.findUnique.mockResolvedValue({
        ...createdPayment,
        status: "CANCELLED",
        allocations: []
      });

      await expect(paymentsService.cancel("payment-1")).rejects.toMatchObject({
        code: "PAYMENT_ALREADY_CANCELLED"
      });
    });

    test("rejects when payment is not completed", async () => {
      tx.payment.findUnique.mockResolvedValue({
        ...createdPayment,
        status: "PENDING",
        allocations: []
      });

      await expect(paymentsService.cancel("payment-1")).rejects.toMatchObject({
        code: "PAYMENT_NOT_COMPLETED"
      });
    });
  });
});
