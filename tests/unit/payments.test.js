jest.mock("../../src/config/prisma", () => ({
  $transaction: jest.fn(),
  parent: { findUnique: jest.fn() },
  invoice: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn()
  },
  payment: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  paymentAllocation: { findMany: jest.fn() }
}));

jest.mock("../../src/modules/audit/audit.service", () => ({
  createLog: jest.fn()
}));

jest.mock("../../src/modules/billing/credit-balance.service", () => ({
  getEffectiveInvoiceAmount: jest.fn(),
  getInvoiceCreditPaidAmount: jest.fn(),
  postTransaction: jest.fn(),
  reversePaymentCredits: jest.fn(),
  applyCredit: jest.fn(),
  getBalance: jest.fn()
}));

jest.mock("../../src/modules/billing/payments/payments.service", () => ({
  getAll: jest.fn(),
  getById: jest.fn(),
  create: jest.fn(),
  cancel: jest.fn(),
  applyCredit: jest.fn(),
  getCreditBalance: jest.fn()
}));

jest.mock("../../src/middleware/auth.middleware", () =>
  jest.fn((req, res, next) => next())
);

jest.mock("../../src/middleware/rbac.middleware", () =>
  jest.fn(() => (req, res, next) => next())
);

jest.mock("../../src/middleware/validate.middleware", () =>
  jest.fn(() => (req, res, next) => next())
);

const prisma = require("../../src/config/prisma");
const auditService = require("../../src/modules/audit/audit.service");
const creditService = require("../../src/modules/billing/credit-balance.service");
const paymentsService = require("../../src/modules/billing/payments/payments.service");
const realPaymentsService = jest.requireActual("../../src/modules/billing/payments/payments.service");
const controller = require("../../src/modules/billing/payments/payments.controller");
const router = require("../../src/modules/billing/payments/payments.routes");
const validation = require("../../src/modules/billing/payments/payments.validation");
const HTTP_STATUS = require("../../src/utils/http-status");

const user = {
  id: "user-123",
  role: "ADMIN"
};

const payerId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const invoiceId = "bbbbbbbbbbbbbbbbbbbbbbbb";
const paymentId = "cccccccccccccccccccccccc";

const validPayment = {
  payerId,
  idempotencyKey: "payment-key-123",
  amount: 1000,
  method: "CASH",
  allocations: [{ invoiceId, amount: 1000 }]
};

function createResponse() {
  const res = {
    locals: { validated: { query: {}, params: {}, body: {} } },
    status: jest.fn(),
    json: jest.fn()
  };

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res;
}

function getRoutes() {
  return router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods)
    }));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Payments controller", () => {
  let req;
  let res;

  beforeEach(() => {
    req = { user };
    res = createResponse();
  });

  test("getAll", async () => {
    const filters = { status: "COMPLETED" };
    const result = [{ id: paymentId }];

    res.locals.validated.query = filters;
    paymentsService.getAll.mockResolvedValue(result);

    await controller.getAll(req, res);

    expect(paymentsService.getAll).toHaveBeenCalledWith(filters, user);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: result });
  });

  test("getById", async () => {
    const result = { id: paymentId };
    res.locals.validated.params.id = paymentId;
    paymentsService.getById.mockResolvedValue(result);

    await controller.getById(req, res);

    expect(paymentsService.getById).toHaveBeenCalledWith(paymentId, user);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: result });
  });

  test("create", async () => {
    const result = { id: paymentId };
    res.locals.validated.body = validPayment;
    paymentsService.create.mockResolvedValue(result);

    await controller.create(req, res);

    expect(paymentsService.create).toHaveBeenCalledWith(validPayment, user);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: result });
  });

  test("cancel", async () => {
    const result = { id: paymentId, status: "CANCELLED" };
    res.locals.validated.params.id = paymentId;
    paymentsService.cancel.mockResolvedValue(result);

    await controller.cancel(req, res);

    expect(paymentsService.cancel).toHaveBeenCalledWith(paymentId, user);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: result });
  });

  test("applyCredit", async () => {
    const body = { invoiceId, amount: 500 };
    const result = { appliedAmount: "500" };

    res.locals.validated.body = body;
    paymentsService.applyCredit.mockResolvedValue(result);

    await controller.applyCredit(req, res);

    expect(paymentsService.applyCredit).toHaveBeenCalledWith(body, user);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: result });
  });

  test("getCreditBalance", async () => {
    const result = { balance: "1000" };
    res.locals.validated.query.payerId = payerId;
    paymentsService.getCreditBalance.mockResolvedValue(result);

    await controller.getCreditBalance(req, res);

    expect(paymentsService.getCreditBalance).toHaveBeenCalledWith(user, payerId);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: result });
  });
});

describe("Payments routes", () => {
  test("registers all expected routes", () => {
    expect(getRoutes()).toEqual([
      { path: "/", methods: ["get"] },
      { path: "/credit-balance", methods: ["get"] },
      { path: "/credit/apply", methods: ["post"] },
      { path: "/:id", methods: ["get"] },
      { path: "/", methods: ["post"] },
      { path: "/:id/cancel", methods: ["patch"] }
    ]);
  });

  test("uses authentication middleware", () => {
    expect(router.stack[0].handle).toBe(require("../../src/middleware/auth.middleware"));
  });

  test("registers route handlers", () => {
    const routes = router.stack.filter((layer) => layer.route);

    expect(routes).toHaveLength(6);

    for (const route of routes) {
      expect(route.route.stack.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("Payments validation", () => {
  const validObjectId = "aaaaaaaaaaaaaaaaaaaaaaaa";

  describe("createPaymentSchema", () => {
    test("accepts valid payment", () => {
      const result = validation.createPaymentSchema.validate({
        payerId: validObjectId,
        idempotencyKey: "payment-key-123",
        amount: 1000,
        method: "CASH",
        allocations: [{ invoiceId: validObjectId, amount: 500 }]
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects invalid payerId", () => {
      const result = validation.createPaymentSchema.validate({
        ...validPayment,
        payerId: "invalid"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects short idempotency key", () => {
      const result = validation.createPaymentSchema.validate({
        ...validPayment,
        idempotencyKey: "short"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects invalid amount", () => {
      const result = validation.createPaymentSchema.validate({
        ...validPayment,
        amount: 0
      });

      expect(result.error).toBeDefined();
    });

    test("rejects invalid payment method", () => {
      const result = validation.createPaymentSchema.validate({
        ...validPayment,
        method: "INVALID"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects empty allocations", () => {
      const result = validation.createPaymentSchema.validate({
        ...validPayment,
        allocations: []
      });

      expect(result.error).toBeDefined();
    });

    test("rejects duplicate invoice allocations", () => {
      const result = validation.createPaymentSchema.validate({
        ...validPayment,
        allocations: [
          { invoiceId: validObjectId, amount: 100 },
          { invoiceId: validObjectId, amount: 200 }
        ]
      });

      expect(result.error).toBeDefined();
    });

    test("rejects allocations exceeding payment amount", () => {
      const result = validation.createPaymentSchema.validate({
        ...validPayment,
        amount: 100,
        allocations: [{ invoiceId: validObjectId, amount: 200 }]
      });

      expect(result.error).toBeDefined();
      expect(result.error.message).toContain("sum of allocations");
    });

    test("rejects invalid allocation amount", () => {
      const result = validation.createPaymentSchema.validate({
        ...validPayment,
        allocations: [{ invoiceId: validObjectId, amount: -1 }]
      });

      expect(result.error).toBeDefined();
    });

    test("accepts optional ISO paidAt", () => {
      const result = validation.createPaymentSchema.validate({
        ...validPayment,
        paidAt: "2026-01-10T12:00:00.000Z"
      });

      expect(result.error).toBeUndefined();
    });
  });

  describe("applyCreditSchema", () => {
    test("accepts valid credit application", () => {
      const result = validation.applyCreditSchema.validate({
        invoiceId: validObjectId,
        amount: 500,
        idempotencyKey: "credit-key-123"
      });

      expect(result.error).toBeUndefined();
    });

    test("allows omitted payerId and amount", () => {
      const result = validation.applyCreditSchema.validate({
        invoiceId: validObjectId,
        idempotencyKey: "credit-key-123"
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects invalid invoiceId", () => {
      const result = validation.applyCreditSchema.validate({
        invoiceId: "invalid",
        idempotencyKey: "credit-key-123"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects invalid amount", () => {
      const result = validation.applyCreditSchema.validate({
        invoiceId: validObjectId,
        amount: 0,
        idempotencyKey: "credit-key-123"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects short idempotency key", () => {
      const result = validation.applyCreditSchema.validate({
        invoiceId: validObjectId,
        idempotencyKey: "short"
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("creditBalanceQuerySchema", () => {
    test("accepts valid payerId", () => {
      const result = validation.creditBalanceQuerySchema.validate({
        payerId: validObjectId
      });

      expect(result.error).toBeUndefined();
    });

    test("allows empty query", () => {
      const result = validation.creditBalanceQuerySchema.validate({});

      expect(result.error).toBeUndefined();
    });

    test("rejects invalid payerId", () => {
      const result = validation.creditBalanceQuerySchema.validate({
        payerId: "invalid"
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("paymentIdSchema", () => {
    test("accepts valid id", () => {
      const result = validation.paymentIdSchema.validate({
        id: validObjectId
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects invalid id", () => {
      const result = validation.paymentIdSchema.validate({
        id: "invalid"
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("listPaymentsSchema", () => {
    test("accepts valid filters", () => {
      const result = validation.listPaymentsSchema.validate({
        payerId: validObjectId,
        status: "COMPLETED",
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-31T23:59:59.000Z"
      });

      expect(result.error).toBeUndefined();
    });

    test("allows empty query", () => {
      const result = validation.listPaymentsSchema.validate({});

      expect(result.error).toBeUndefined();
    });

    test("rejects invalid payerId", () => {
      const result = validation.listPaymentsSchema.validate({
        payerId: "invalid"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects invalid status", () => {
      const result = validation.listPaymentsSchema.validate({
        status: "INVALID"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects invalid from date", () => {
      const result = validation.listPaymentsSchema.validate({
        from: "not-a-date"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects from date later than to date", () => {
      const result = validation.listPaymentsSchema.validate({
        from: "2026-02-01T00:00:00.000Z",
        to: "2026-01-01T00:00:00.000Z"
      });

      expect(result.error).toBeDefined();
    });
  });
});
describe("Payments service", () => {
  beforeEach(() => {
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
    prisma.parent.findUnique.mockReset();
    prisma.invoice.findUnique.mockReset();
    prisma.invoice.findMany.mockReset();
    prisma.invoice.update.mockReset();
    prisma.payment.findUnique.mockReset();
    prisma.payment.findMany.mockReset();
    prisma.payment.create.mockReset();
    prisma.payment.update.mockReset();
    prisma.paymentAllocation.findMany.mockReset();
    auditService.createLog.mockReset();
    creditService.getEffectiveInvoiceAmount.mockReset();
    creditService.getInvoiceCreditPaidAmount.mockReset();
    creditService.postTransaction.mockReset();
    creditService.reversePaymentCredits.mockReset();
    creditService.applyCredit.mockReset();
    creditService.getBalance.mockReset();
  });

  describe("getAll", () => {
    test("returns payments for admin with filters", async () => {
      const payments = [{ id: paymentId, amount: 1000, allocations: [] }];
      prisma.payment.findMany.mockResolvedValue(payments);

      const result = await realPaymentsService.getAll(
        { payerId, status: "COMPLETED" },
        user
      );

      expect(prisma.payment.findMany).toHaveBeenCalledWith({
        where: { payerId, status: "COMPLETED" },
        include: {
          allocations: {
            include: { invoice: true }
          }
        },
        orderBy: { createdAt: "desc" }
      });

      expect(result[0].amount).toBe(1000);
    });

    test("restricts parent to own payments", async () => {
      const parentUser = { id: "parent-user", role: "PARENT" };

      prisma.parent.findUnique.mockResolvedValue({ id: payerId });
      prisma.payment.findMany.mockResolvedValue([]);

      await realPaymentsService.getAll({}, parentUser);

      expect(prisma.parent.findUnique).toHaveBeenCalledWith({
        where: { userId: parentUser.id },
        select: { id: true }
      });

      expect(prisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { payerId }
        })
      );
    });

    test("throws when parent profile does not exist", async () => {
      prisma.parent.findUnique.mockResolvedValue(null);

      await expect(
        realPaymentsService.getAll({}, { id: "parent-user", role: "PARENT" })
      ).rejects.toMatchObject({ code: "PARENT_NOT_FOUND" });
    });

    test("applies date filters", async () => {
      prisma.payment.findMany.mockResolvedValue([]);

      await realPaymentsService.getAll(
        { from: "2026-01-01", to: "2026-12-31" },
        user
      );

      expect(prisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            paidAt: {
              gte: new Date("2026-01-01"),
              lte: new Date("2026-12-31")
            }
          }
        })
      );
    });
  });

  describe("getById", () => {
    test("returns payment", async () => {
      const payment = {
        id: paymentId,
        amount: 1000n,
        allocations: [],
        payer: { userId: "parent-user" }
      };

      prisma.payment.findUnique.mockResolvedValue(payment);

      const result = await realPaymentsService.getById(paymentId, user);

      expect(prisma.payment.findUnique).toHaveBeenCalledWith({
        where: { id: paymentId },
        include: {
          allocations: { include: { invoice: true } },
          payer: true
        }
      });

      expect(result.amount).toBe(1000);
    });

    test("throws when payment does not exist", async () => {
      prisma.payment.findUnique.mockResolvedValue(null);

      await expect(
        realPaymentsService.getById(paymentId, user)
      ).rejects.toMatchObject({ code: "PAYMENT_NOT_FOUND" });
    });

    test("forbids parent from accessing another parent's payment", async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: paymentId,
        allocations: [],
        payer: { userId: "another-user" }
      });

      await expect(
        realPaymentsService.getById(paymentId, {
          id: "parent-user",
          role: "PARENT"
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("calculateInvoiceBalance", () => {
    test("calculates balance from completed payment allocations", async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: invoiceId,
        amountDue: 1000n,
        status: "ISSUED"
      });

      prisma.paymentAllocation.findMany.mockResolvedValue([
        { amount: 300n },
        { amount: 200n }
      ]);

      const result = await realPaymentsService.calculateInvoiceBalance(
        prisma,
        invoiceId
      );

      expect(result.paidAmount).toBe(500n);
      expect(result.balance).toBe(500n);
      expect(result.amountDue).toBe(1000n);
    });

    test("throws when invoice does not exist", async () => {
      prisma.invoice.findUnique.mockResolvedValue(null);

      await expect(
        realPaymentsService.calculateInvoiceBalance(prisma, invoiceId)
      ).rejects.toMatchObject({ code: "INVOICE_NOT_FOUND" });
    });

    test("does not return negative balance", async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: invoiceId,
        amountDue: 100n,
        status: "ISSUED"
      });

      prisma.paymentAllocation.findMany.mockResolvedValue([
        { amount: 200n }
      ]);

      const result = await realPaymentsService.calculateInvoiceBalance(
        prisma,
        invoiceId
      );

      expect(result.balance).toBe(0n);
    });
  });

  describe("updateInvoiceStatus", () => {
    test("sets status to PAID when fully paid", async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: invoiceId,
        amountDue: 1000n,
        status: "ISSUED"
      });

      prisma.paymentAllocation.findMany.mockResolvedValue([
        { amount: 1000n }
      ]);

      prisma.invoice.update.mockResolvedValue({
        id: invoiceId,
        status: "PAID"
      });

      const result = await realPaymentsService.updateInvoiceStatus(
        prisma,
        invoiceId
      );

      expect(prisma.invoice.update).toHaveBeenCalledWith({
        where: { id: invoiceId },
        data: { status: "PAID" }
      });

      expect(result.invoice.status).toBe("PAID");
    });

    test("sets status to PARTIALLY_PAID", async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: invoiceId,
        amountDue: 1000n,
        status: "ISSUED"
      });

      prisma.paymentAllocation.findMany.mockResolvedValue([
        { amount: 300n }
      ]);

      prisma.invoice.update.mockResolvedValue({
        id: invoiceId,
        status: "PARTIALLY_PAID"
      });

      await realPaymentsService.updateInvoiceStatus(prisma, invoiceId);

      expect(prisma.invoice.update).toHaveBeenCalledWith({
        where: { id: invoiceId },
        data: { status: "PARTIALLY_PAID" }
      });
    });

    test("does not update DRAFT invoice", async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: invoiceId,
        amountDue: 1000n,
        status: "DRAFT"
      });

      prisma.paymentAllocation.findMany.mockResolvedValue([]);

      await realPaymentsService.updateInvoiceStatus(prisma, invoiceId);

      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    test("does not update CANCELLED invoice", async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: invoiceId,
        amountDue: 1000n,
        status: "CANCELLED"
      });

      prisma.paymentAllocation.findMany.mockResolvedValue([]);

      await realPaymentsService.updateInvoiceStatus(prisma, invoiceId);

      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });
  });

  describe("create", () => {
    function setupCreate() {
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.parent.findUnique.mockResolvedValue({
        id: payerId,
        userId: "parent-user",
        status: "ACTIVE"
      });

      prisma.invoice.findMany.mockResolvedValue([
        {
          id: invoiceId,
          payerId,
          status: "ISSUED",
          amountDue: 1000n
        }
      ]);

      prisma.invoice.findUnique.mockResolvedValue({
        id: invoiceId,
        payerId,
        status: "ISSUED",
        amountDue: 1000n
      });

      prisma.paymentAllocation.findMany.mockResolvedValue([]);
      prisma.payment.create.mockResolvedValue({
        id: paymentId,
        payerId,
        amount: 1000n,
        method: "CASH",
        status: "COMPLETED",
        paidAt: new Date(),
        allocations: [
          {
            invoiceId,
            amount: 1000n,
            invoice: null
          }
        ]
      });

      prisma.invoice.update.mockResolvedValue({
        id: invoiceId,
        status: "PAID"
      });

      auditService.createLog.mockResolvedValue({});
    }

    test("creates payment successfully", async () => {
      setupCreate();

      const result = await realPaymentsService.create(validPayment, user);

      expect(prisma.payment.create).toHaveBeenCalled();
      expect(auditService.createLog).toHaveBeenCalled();
      expect(result.id).toBe(paymentId);
      expect(result.amount).toBe(1000);
    });

    test("rejects empty allocations", async () => {
      await expect(
        realPaymentsService.create({ ...validPayment, allocations: [] }, user)
      ).rejects.toMatchObject({ code: "INVALID_ALLOCATIONS" });
    });

    test("rejects non-positive payment amount", async () => {
      await expect(
        realPaymentsService.create({ ...validPayment, amount: 0 }, user)
      ).rejects.toMatchObject({ code: "INVALID_PAYMENT_AMOUNT" });
    });

    test("rejects non-positive allocation amount", async () => {
      await expect(
        realPaymentsService.create({
          ...validPayment,
          allocations: [{ invoiceId, amount: 0 }]
        }, user)
      ).rejects.toMatchObject({ code: "INVALID_ALLOCATION_AMOUNT" });
    });

    test("rejects allocations exceeding payment amount", async () => {
      await expect(
        realPaymentsService.create({
          ...validPayment,
          amount: 100,
          allocations: [{ invoiceId, amount: 200 }]
        }, user)
      ).rejects.toMatchObject({ code: "ALLOCATION_TOTAL_EXCEEDS_PAYMENT" });
    });

    test("rejects duplicate invoice allocations", async () => {
      await expect(
        realPaymentsService.create({
          ...validPayment,
          allocations: [
            { invoiceId, amount: 100 },
            { invoiceId, amount: 200 }
          ]
        }, user)
      ).rejects.toMatchObject({ code: "DUPLICATE_INVOICE_ALLOCATION" });
    });

    test("rejects duplicate idempotency key", async () => {
      prisma.payment.findUnique.mockResolvedValue({ id: paymentId });

      await expect(
        realPaymentsService.create(validPayment, user)
      ).rejects.toMatchObject({ code: "DUPLICATE_PAYMENT" });
    });

    test("rejects missing payer", async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.parent.findUnique.mockResolvedValue(null);

      await expect(
        realPaymentsService.create(validPayment, user)
      ).rejects.toMatchObject({ code: "PAYER_NOT_FOUND" });
    });

    test("rejects inactive payer", async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.parent.findUnique.mockResolvedValue({
        id: payerId,
        status: "INACTIVE"
      });

      await expect(
        realPaymentsService.create(validPayment, user)
      ).rejects.toMatchObject({ code: "PAYER_NOT_ACTIVE" });
    });

    test("forbids parent from paying for another payer", async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.parent.findUnique.mockResolvedValue({
        id: payerId,
        userId: "another-user",
        status: "ACTIVE"
      });

      await expect(
        realPaymentsService.create(validPayment, {
          id: "parent-user",
          role: "PARENT"
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    test("rejects missing invoices", async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.parent.findUnique.mockResolvedValue({
        id: payerId,
        userId: "parent-user",
        status: "ACTIVE"
      });
      prisma.invoice.findMany.mockResolvedValue([]);

      await expect(
        realPaymentsService.create(validPayment, user)
      ).rejects.toMatchObject({ code: "INVOICE_NOT_FOUND" });
    });

    test("rejects invoice payer mismatch", async () => {
      setupCreate();
      prisma.invoice.findMany.mockResolvedValue([
        {
          id: invoiceId,
          payerId: "another-payer",
          status: "ISSUED",
          amountDue: 1000n
        }
      ]);

      await expect(
        realPaymentsService.create(validPayment, user)
      ).rejects.toMatchObject({ code: "PAYER_MISMATCH" });
    });

    test("rejects non-payable invoice", async () => {
      setupCreate();
      prisma.invoice.findMany.mockResolvedValue([
        {
          id: invoiceId,
          payerId,
          status: "DRAFT",
          amountDue: 1000n
        }
      ]);

      await expect(
        realPaymentsService.create(validPayment, user)
      ).rejects.toMatchObject({ code: "INVOICE_NOT_PAYABLE" });
    });

    test("rejects allocation exceeding invoice balance", async () => {
      setupCreate();
      prisma.invoice.findUnique.mockResolvedValue({
        id: invoiceId,
        payerId,
        status: "ISSUED",
        amountDue: 500n
      });

      await expect(
        realPaymentsService.create(validPayment, user)
      ).rejects.toMatchObject({ code: "ALLOCATION_EXCEEDS_BALANCE" });
    });

    test("creates overpayment credit transaction", async () => {
      setupCreate();

      await realPaymentsService.create({
        ...validPayment,
        amount: 1500
      }, user);

      expect(creditService.postTransaction).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          parentId: payerId,
          type: "OVERPAYMENT",
          amountDelta: 500n
        })
      );
    });
  });

  describe("cancel", () => {
    test("cancels completed payment", async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: paymentId,
        status: "COMPLETED",
        allocations: [{ invoiceId }]
      });

      prisma.payment.update.mockResolvedValue({
        id: paymentId,
        payerId,
        amount: 1000n,
        status: "CANCELLED",
        allocations: [{ invoiceId, amount: 1000n, invoice: null }]
      });

      prisma.invoice.findUnique.mockResolvedValue({
        id: invoiceId,
        amountDue: 1000n,
        status: "ISSUED"
      });

      prisma.paymentAllocation.findMany.mockResolvedValue([]);
      prisma.invoice.update.mockResolvedValue({
        id: invoiceId,
        status: "ISSUED"
      });

      auditService.createLog.mockResolvedValue({});

      const result = await realPaymentsService.cancel(paymentId, user);

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: paymentId },
        data: { status: "CANCELLED" },
        include: {
          allocations: { include: { invoice: true } }
        }
      });

      expect(auditService.createLog).toHaveBeenCalled();
      expect(result.status).toBe("CANCELLED");
    });

    test("throws when payment does not exist", async () => {
      prisma.payment.findUnique.mockResolvedValue(null);

      await expect(
        realPaymentsService.cancel(paymentId, user)
      ).rejects.toMatchObject({ code: "PAYMENT_NOT_FOUND" });
    });

    test("throws when payment is already cancelled", async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: paymentId,
        status: "CANCELLED",
        allocations: []
      });

      await expect(
        realPaymentsService.cancel(paymentId, user)
      ).rejects.toMatchObject({ code: "PAYMENT_ALREADY_CANCELLED" });
    });

    test("throws when payment is not completed", async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: paymentId,
        status: "PENDING",
        allocations: []
      });

      await expect(
        realPaymentsService.cancel(paymentId, user)
      ).rejects.toMatchObject({ code: "PAYMENT_NOT_COMPLETED" });
    });
  });

  describe("applyCredit", () => {
    test("applies credit for admin", async () => {
      prisma.parent.findUnique.mockResolvedValue({
        id: payerId,
        status: "ACTIVE"
      });

      creditService.applyCredit.mockResolvedValue({
        appliedAmount: 500n,
        balance: 0n,
        transactions: [
          {
            id: "transaction-1",
            amountDelta: -500n,
            balanceAfter: 0n
          }
        ]
      });

      prisma.invoice.findUnique.mockResolvedValue({
        id: invoiceId,
        amountDue: 1000n,
        status: "ISSUED"
      });

      prisma.paymentAllocation.findMany.mockResolvedValue([]);
      prisma.invoice.update.mockResolvedValue({
        id: invoiceId,
        status: "PARTIALLY_PAID"
      });

      const result = await realPaymentsService.applyCredit({
        payerId,
        invoiceId,
        amount: 500,
        idempotencyKey: "credit-key-123"
      }, user);

      expect(creditService.applyCredit).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          parentId: payerId,
          invoiceId,
          amount: 500,
          actorId: user.id
        })
      );

      expect(result).toEqual({
        invoiceId,
        appliedAmount: "500",
        balance: "0",
        transactions: [
          {
            id: "transaction-1",
            amountDelta: "-500",
            balanceAfter: "0"
          }
        ]
      });
    });

    test("requires payer for non-parent user", async () => {
      await expect(
        realPaymentsService.applyCredit({
          invoiceId,
          idempotencyKey: "credit-key-123"
        }, user)
      ).rejects.toMatchObject({ code: "PAYER_REQUIRED" });
    });

    test("rejects missing payer", async () => {
      prisma.parent.findUnique.mockResolvedValue(null);

      await expect(
        realPaymentsService.applyCredit({
          payerId,
          invoiceId,
          idempotencyKey: "credit-key-123"
        }, user)
      ).rejects.toMatchObject({ code: "PAYER_NOT_FOUND" });
    });

    test("rejects inactive payer", async () => {
      prisma.parent.findUnique.mockResolvedValue({
        id: payerId,
        status: "INACTIVE"
      });

      await expect(
        realPaymentsService.applyCredit({
          payerId,
          invoiceId,
          idempotencyKey: "credit-key-123"
        }, user)
      ).rejects.toMatchObject({ code: "PAYER_NOT_ACTIVE" });
    });

    test("parent can apply credit to own balance", async () => {
      prisma.parent.findUnique.mockResolvedValue({
        id: payerId,
        status: "ACTIVE"
      });

      creditService.applyCredit.mockResolvedValue({
        appliedAmount: 100n,
        balance: 0n,
        transactions: []
      });

      prisma.invoice.findUnique.mockResolvedValue({
        id: invoiceId,
        amountDue: 1000n,
        status: "ISSUED"
      });

      prisma.paymentAllocation.findMany.mockResolvedValue([]);
      prisma.invoice.update.mockResolvedValue({ id: invoiceId });

      await realPaymentsService.applyCredit({
        invoiceId,
        idempotencyKey: "credit-key-123"
      }, {
        id: "parent-user",
        role: "PARENT"
      });

      expect(prisma.parent.findUnique).toHaveBeenCalledWith({
        where: { userId: "parent-user" },
        select: { id: true }
      });
    });

    test("forbids parent from applying another payer's credit", async () => {
      prisma.parent.findUnique.mockResolvedValue({ id: payerId });

      await expect(
        realPaymentsService.applyCredit({
          payerId: "another-payer",
          invoiceId,
          idempotencyKey: "credit-key-123"
        }, {
          id: "parent-user",
          role: "PARENT"
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("getCreditBalance", () => {
    test("returns credit balance for admin", async () => {
      creditService.getBalance.mockResolvedValue({ balance: 1000n });

      const result = await realPaymentsService.getCreditBalance(user, payerId);

      expect(creditService.getBalance).toHaveBeenCalledWith(payerId);
      expect(result).toEqual({ balance: 1000n });
    });

    test("requires payerId for admin", async () => {
      await expect(
        realPaymentsService.getCreditBalance(user)
      ).rejects.toMatchObject({ code: "PAYER_REQUIRED" });
    });

    test("uses parent's own profile", async () => {
      prisma.parent.findUnique.mockResolvedValue({ id: payerId });
      creditService.getBalance.mockResolvedValue({ balance: 500n });

      const result = await realPaymentsService.getCreditBalance({
        id: "parent-user",
        role: "PARENT"
      });

      expect(creditService.getBalance).toHaveBeenCalledWith(payerId);
      expect(result).toEqual({ balance: 500n });
    });

    test("forbids parent from requesting another payer's balance", async () => {
      prisma.parent.findUnique.mockResolvedValue({ id: payerId });

      await expect(
        realPaymentsService.getCreditBalance({
          id: "parent-user",
          role: "PARENT"
        }, "another-payer")
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });
});