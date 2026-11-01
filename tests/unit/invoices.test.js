
jest.mock("../../src/config/prisma", () => {
  const mockTx = {
    invoice: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn()
    },
    child: {
      findUnique: jest.fn()
    },
    parent: {
      findUnique: jest.fn()
    },
    childParent: {
      findFirst: jest.fn()
    },
    paymentAllocation: {
      findMany: jest.fn()
    }
  };

  return {
    invoice: {
      findMany: jest.fn(),
      findUnique: jest.fn()
    },
    $transaction: jest.fn((callback) => callback(mockTx)),
    __tx: mockTx
  };
});

jest.mock("../../src/modules/billing/tuition/tuition.service", () => ({
  calculateMonthlyTuitionCost: jest.fn(),
  calculateAnnualTuitionCost: jest.fn()
}));

jest.mock("../../src/modules/billing/meals/meals.service", () => ({
  calculateMealCost: jest.fn()
}));

jest.mock("../../src/modules/audit/audit.service", () => ({
  createLog: jest.fn()
}));

const prisma = require("../../src/config/prisma");
const tuitionService = require("../../src/modules/billing/tuition/tuition.service");
const mealsService = require("../../src/modules/billing/meals/meals.service");
const auditService = require("../../src/modules/audit/audit.service");

const invoiceService = require("../../src/modules/billing/invoices/invoices.service");

const {
  createMonthlyInvoiceSchema,
  createAnnualInvoiceSchema,
  invoiceQuerySchema,
  invoiceIdSchema
} = require("../../src/modules/billing/invoices/invoices.validation");

const tx = prisma.__tx;

const childId = "507f1f77bcf86cd799439011";
const payerId = "507f1f77bcf86cd799439012";
const invoiceId = "507f1f77bcf86cd799439013";

const monthlyData = {
  childId,
  payerId,
  periodYear: 2026,
  periodMonth: 10,
  attendedDays: 20,
  dueDate: "2026-10-15"
};

const annualData = {
  childId,
  payerId,
  periodYear: 2026,
  periodMonth: 9,
  dueDate: "2026-09-15"
};

function setupActiveChildAndPayer() {
  tx.child.findUnique.mockResolvedValue({
    id: childId,
    status: "ACTIVE"
  });

  tx.parent.findUnique.mockResolvedValue({
    id: payerId,
    status: "ACTIVE"
  });

  tx.childParent.findFirst.mockResolvedValue({
    childId,
    parentId: payerId
  });
}

function createInvoiceResult(overrides = {}) {
  return {
    id: invoiceId,
    childId,
    payerId,
    periodYear: 2026,
    periodMonth: 10,
    type: "MONTHLY",
    amountDue: 15000n,
    status: "ISSUED",
    issuedAt: new Date("2026-10-01"),
    dueDate: new Date("2026-10-15"),
    child: {},
    payer: {},
    lines: [
      {
        description: "Навчання",
        quantity: 1,
        unitAmount: 10000n,
        amount: 10000n
      },
      {
        description: "Харчування",
        quantity: 20,
        unitAmount: 250n,
        amount: 5000n
      }
    ],
    ...overrides
  };
}

describe("Invoices module", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    prisma.$transaction.mockImplementation((callback) => callback(tx));

    tx.invoice.findFirst.mockResolvedValue(null);

    setupActiveChildAndPayer();

    tuitionService.calculateMonthlyTuitionCost.mockResolvedValue({
      total: "10000"
    });

    tuitionService.calculateAnnualTuitionCost.mockResolvedValue({
      total: "50000"
    });

    mealsService.calculateMealCost.mockResolvedValue({
      total: "5000",
      dailyRate: "250"
    });
  });

  describe("Validation schemas", () => {
    test("accepts valid monthly invoice data", () => {
      const result = createMonthlyInvoiceSchema.validate(monthlyData);

      expect(result.error).toBeUndefined();
    });

    test("rejects invalid child ID", () => {
      const result = createMonthlyInvoiceSchema.validate({
        ...monthlyData,
        childId: "invalid"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects invalid payer ID", () => {
      const result = createMonthlyInvoiceSchema.validate({
        ...monthlyData,
        payerId: "invalid"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects period year below minimum", () => {
      const result = createMonthlyInvoiceSchema.validate({
        ...monthlyData,
        periodYear: 1999
      });

      expect(result.error).toBeDefined();
    });

    test("rejects invalid period month", () => {
      const result = createMonthlyInvoiceSchema.validate({
        ...monthlyData,
        periodMonth: 13
      });

      expect(result.error).toBeDefined();
    });

    test("rejects negative attended days", () => {
      const result = createMonthlyInvoiceSchema.validate({
        ...monthlyData,
        attendedDays: -1
      });

      expect(result.error).toBeDefined();
    });

    test("rejects attended days exceeding the number of days in a month", () => {
      const result = createMonthlyInvoiceSchema.validate({
        ...monthlyData,
        periodMonth: 2,
        attendedDays: 29
      });

      expect(result.error.message).toContain(
        "Attended days exceed the number of days in the month"
      );
    });

    test("accepts valid annual invoice data", () => {
      const result = createAnnualInvoiceSchema.validate(annualData);

      expect(result.error).toBeUndefined();
    });

    test("rejects invalid due date", () => {
      const result = createAnnualInvoiceSchema.validate({
        ...annualData,
        dueDate: "2026-02-30"
      });

      expect(result.error.message).toContain(
        "Date must be a valid calendar date"
      );
    });

    test("accepts valid invoice query filters", () => {
      const result = invoiceQuerySchema.validate({
        childId,
        payerId,
        periodYear: 2026,
        periodMonth: 10,
        type: "MONTHLY",
        status: "ISSUED"
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects invalid invoice status", () => {
      const result = invoiceQuerySchema.validate({
        status: "INVALID"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects invalid invoice type", () => {
      const result = invoiceQuerySchema.validate({
        type: "INVALID"
      });

      expect(result.error).toBeDefined();
    });

    test("accepts valid invoice ID", () => {
      const result = invoiceIdSchema.validate({
        id: invoiceId
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects invalid invoice ID", () => {
      const result = invoiceIdSchema.validate({
        id: "invalid"
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("createMonthly", () => {
    test("creates monthly invoice with tuition and meal costs", async () => {
      tx.invoice.create.mockResolvedValue(createInvoiceResult());

      const result = await invoiceService.createMonthly(monthlyData);

      expect(result.amountDue).toBe("15000");
      expect(result.paidAmount).toBe("0");
      expect(result.outstandingBalance).toBe("15000");
      expect(result.lines).toHaveLength(2);

      expect(tuitionService.calculateMonthlyTuitionCost).toHaveBeenCalled();
      expect(mealsService.calculateMealCost).toHaveBeenCalled();
      expect(tx.invoice.create).toHaveBeenCalled();
      expect(auditService.createLog).toHaveBeenCalled();
    });

    test("rejects duplicate monthly invoice", async () => {
      tx.invoice.findFirst.mockResolvedValue({
        id: invoiceId
      });

      await expect(
        invoiceService.createMonthly(monthlyData)
      ).rejects.toThrow("Invoice already exists for this period");

      expect(tx.invoice.create).not.toHaveBeenCalled();
    });

    test("rejects when child is not active", async () => {
      tx.child.findUnique.mockResolvedValue(null);

      await expect(
        invoiceService.createMonthly(monthlyData)
      ).rejects.toThrow("Active child not found");
    });

    test("rejects when payer is not active", async () => {
      tx.parent.findUnique.mockResolvedValue(null);

      await expect(
        invoiceService.createMonthly(monthlyData)
      ).rejects.toThrow("Active payer not found");
    });

    test("rejects when payer is not related to child", async () => {
      tx.childParent.findFirst.mockResolvedValue(null);

      await expect(
        invoiceService.createMonthly(monthlyData)
      ).rejects.toThrow(
        "Payer is not an active parent or guardian of this child"
      );
    });

    test("rejects invalid period month", async () => {
      await expect(
        invoiceService.createMonthly({
          ...monthlyData,
          periodMonth: 13
        })
      ).rejects.toThrow("Invalid period month");

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test("rejects invalid due date", async () => {
      await expect(
        invoiceService.createMonthly({
          ...monthlyData,
          dueDate: "2026-02-30"
        })
      ).rejects.toThrow("Invalid date");

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test("rejects attended days exceeding month length", async () => {
      await expect(
        invoiceService.createMonthly({
          ...monthlyData,
          periodMonth: 2,
          attendedDays: 29
        })
      ).rejects.toThrow(
        "Attended days exceed the number of days in the month"
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("createAnnual", () => {
    test("creates annual invoice with tuition cost", async () => {
      tx.invoice.create.mockResolvedValue(
        createInvoiceResult({
          type: "ANNUAL",
          amountDue: 50000n,
          lines: [
            {
              description: "Навчання — річна передоплата",
              quantity: 1,
              unitAmount: 50000n,
              amount: 50000n
            }
          ]
        })
      );

      const result = await invoiceService.createAnnual(annualData);

      expect(result.amountDue).toBe("50000");
      expect(result.lines).toHaveLength(1);

      expect(tuitionService.calculateAnnualTuitionCost).toHaveBeenCalled();
      expect(mealsService.calculateMealCost).not.toHaveBeenCalled();

      expect(tx.invoice.create).toHaveBeenCalled();
      expect(auditService.createLog).toHaveBeenCalled();
    });

    test("rejects duplicate annual invoice", async () => {
      tx.invoice.findFirst.mockResolvedValue({
        id: invoiceId
      });

      await expect(
        invoiceService.createAnnual(annualData)
      ).rejects.toThrow("Invoice already exists for this period");

      expect(tx.invoice.create).not.toHaveBeenCalled();
    });
  });

  describe("getAll", () => {
    test("returns invoices with calculated payment amounts", async () => {
      prisma.invoice.findMany.mockResolvedValue([
        createInvoiceResult({
          allocations: [
            { amount: 5000n },
            { amount: 2000n }
          ]
        })
      ]);

      const result = await invoiceService.getAll();

      expect(result).toHaveLength(1);
      expect(result[0].amountDue).toBe("15000");
      expect(result[0].paidAmount).toBe("7000");
      expect(result[0].outstandingBalance).toBe("8000");
      expect(result[0].allocations).toBeUndefined();
    });

    test("returns empty array when no invoices exist", async () => {
      prisma.invoice.findMany.mockResolvedValue([]);

      const result = await invoiceService.getAll();

      expect(result).toEqual([]);
    });

    test("applies provided filters", async () => {
      prisma.invoice.findMany.mockResolvedValue([]);

      await invoiceService.getAll({
        childId,
        payerId,
        periodYear: "2026",
        periodMonth: "10",
        type: "MONTHLY",
        status: "ISSUED"
      });

      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            childId,
            payerId,
            periodYear: 2026,
            periodMonth: 10,
            type: "MONTHLY",
            status: "ISSUED"
          }
        })
      );
    });

    test("does not apply filters when none are provided", async () => {
      prisma.invoice.findMany.mockResolvedValue([]);

      await invoiceService.getAll();

      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {}
        })
      );
    });
  });

  describe("getById", () => {
    test("returns invoice with calculated payment amounts", async () => {
      prisma.invoice.findUnique.mockResolvedValue(
        createInvoiceResult({
          allocations: [{ amount: 5000n }]
        })
      );

      const result = await invoiceService.getById(invoiceId);

      expect(result.amountDue).toBe("15000");
      expect(result.paidAmount).toBe("5000");
      expect(result.outstandingBalance).toBe("10000");
      expect(result.allocations).toBeUndefined();
    });

    test("throws error when invoice does not exist", async () => {
      prisma.invoice.findUnique.mockResolvedValue(null);

      await expect(
        invoiceService.getById(invoiceId)
      ).rejects.toThrow("Invoice not found");
    });
  });

  describe("cancel", () => {
    test("cancels unpaid invoice", async () => {
      tx.invoice.findUnique.mockResolvedValue(createInvoiceResult());
      tx.paymentAllocation.findMany.mockResolvedValue([]);

      tx.invoice.update.mockResolvedValue(
        createInvoiceResult({
          status: "CANCELLED"
        })
      );

      const result = await invoiceService.cancel(invoiceId);

      expect(result.status).toBe("CANCELLED");

      expect(tx.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: invoiceId },
          data: { status: "CANCELLED" }
        })
      );

      expect(auditService.createLog).toHaveBeenCalled();
    });

    test("throws error when invoice does not exist", async () => {
      tx.invoice.findUnique.mockResolvedValue(null);

      await expect(
        invoiceService.cancel(invoiceId)
      ).rejects.toThrow("Invoice not found");

      expect(tx.invoice.update).not.toHaveBeenCalled();
    });

    test("rejects cancellation of already cancelled invoice", async () => {
      tx.invoice.findUnique.mockResolvedValue(
        createInvoiceResult({
          status: "CANCELLED"
        })
      );

      await expect(
        invoiceService.cancel(invoiceId)
      ).rejects.toThrow("Invoice is already cancelled");
    });

    test("rejects cancellation of paid invoice", async () => {
      tx.invoice.findUnique.mockResolvedValue(
        createInvoiceResult({
          status: "PAID"
        })
      );

      await expect(
        invoiceService.cancel(invoiceId)
      ).rejects.toThrow(
        "Paid or partially paid invoice cannot be cancelled"
      );
    });

    test("rejects cancellation of partially paid invoice", async () => {
      tx.invoice.findUnique.mockResolvedValue(
        createInvoiceResult({
          status: "PARTIALLY_PAID"
        })
      );

      await expect(
        invoiceService.cancel(invoiceId)
      ).rejects.toThrow(
        "Paid or partially paid invoice cannot be cancelled"
      );
    });

    test("rejects cancellation when completed payments exist", async () => {
      tx.invoice.findUnique.mockResolvedValue(
        createInvoiceResult({
          status: "ISSUED"
        })
      );

      tx.paymentAllocation.findMany.mockResolvedValue([
        { amount: 5000n }
      ]);

      await expect(
        invoiceService.cancel(invoiceId)
      ).rejects.toThrow("Invoice has completed payments");

      expect(tx.invoice.update).not.toHaveBeenCalled();
    });
  });
});
