
jest.mock("../../src/config/prisma", () => ({
  invoice: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  invoiceAdjustment: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn()
  },
  parent: {
    findUnique: jest.fn()
  },
  paymentAllocation: {
    findMany: jest.fn()
  },
  creditBalanceTransaction: {
    findMany: jest.fn(),
    findUnique: jest.fn()
  },
  $transaction: jest.fn()
}));

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

jest.mock("../../src/modules/billing/credit-balance.service", () => ({
  getInvoicePaidAmount: jest.fn(),
  getEffectiveInvoiceAmount: jest.fn(),
  getInvoiceCreditPaidAmount: jest.fn(),
  restoreInvoiceCreditApplications: jest.fn(),
  postTransaction: jest.fn(),
  reverseSource: jest.fn()
}));

jest.mock("../../src/middleware/validate.middleware", () =>
  jest.fn(() => (req, res, next) => next())
);

jest.mock("../../src/middleware/auth.middleware", () =>
  jest.fn((req, res, next) => next())
);

jest.mock("../../src/middleware/rbac.middleware", () =>
  jest.fn(() => (req, res, next) => next())
);

const prisma = require("../../src/config/prisma");
const tuitionService = require("../../src/modules/billing/tuition/tuition.service");
const mealsService = require("../../src/modules/billing/meals/meals.service");
const auditService = require("../../src/modules/audit/audit.service");
const creditService = require("../../src/modules/billing/credit-balance.service");

const service = require("../../src/modules/billing/invoices/invoices.service");
const adjustmentsService = require("../../src/modules/billing/invoices/invoice-adjustments.service");
const controller = require("../../src/modules/billing/invoices/invoices.controller");

const {
  createMonthlyInvoiceSchema,
  createAnnualInvoiceSchema,
  invoiceQuerySchema,
  invoiceIdSchema,
  adjustmentIdSchema,
  createInvoiceAdjustmentSchema
} = require("../../src/modules/billing/invoices/invoices.validation");

const HTTP_STATUS = require("../../src/utils/http-status");
const router = require("../../src/modules/billing/invoices/invoices.routes");

const invoiceId = "507f1f77bcf86cd799439011";
const childId = "507f1f77bcf86cd799439012";
const payerId = "507f1f77bcf86cd799439013";
const actorId = "507f1f77bcf86cd799439014";
const adjustmentId = "507f1f77bcf86cd799439015";

const admin = {
  id: actorId,
  role: "ADMIN"
};

const parentUser = {
  id: "507f1f77bcf86cd799439016",
  role: "PARENT"
};

const invoice = {
  id: invoiceId,
  childId,
  payerId,
  periodYear: 2026,
  periodMonth: 1,
  type: "MONTHLY",
  amountDue: 15000n,
  status: "ISSUED",
  child: {
    id: childId
  },
  payer: {
    id: payerId,
    userId: parentUser.id
  },
  lines: [
    {
      description: "Навчання",
      quantity: 1,
      unitAmount: 10000n,
      amount: 10000n
    },
    {
      description: "Харчування",
      quantity: 10,
      unitAmount: 500n,
      amount: 5000n
    }
  ],
  adjustments: [],
  allocations: []
};

const serializedInvoice = {
  ...invoice,
  amountDue: "15000",
  paidAmount: "0",
  outstandingBalance: "15000",
  lines: invoice.lines.map((line) => ({
    ...line,
    unitAmount: line.unitAmount.toString(),
    amount: line.amount.toString()
  })),
  adjustments: []
};

function createResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    locals: {
      validated: {
        body: {},
        query: {},
        params: {}
      }
    }
  };
}

function createInvoiceTransaction() {
  return {
    invoice: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
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
    },
    creditBalanceTransaction: {
      findMany: jest.fn(),
      findUnique: jest.fn()
    },
    invoiceAdjustment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn()
    }
  };
}

describe("Invoice validation", () => {
  const validData = {
    childId,
    payerId,
    periodYear: 2026,
    periodMonth: 1,
    dueDate: "2026-01-10"
  };

  describe("createMonthlyInvoiceSchema", () => {
    it("should accept valid monthly invoice data", () => {
      const { error } = createMonthlyInvoiceSchema.validate(validData);

      expect(error).toBeUndefined();
    });

    it("should reject a missing childId", () => {
      const data = { ...validData };
      delete data.childId;

      expect(createMonthlyInvoiceSchema.validate(data).error).toBeDefined();
    });

    it("should reject a missing payerId", () => {
      const data = { ...validData };
      delete data.payerId;

      expect(createMonthlyInvoiceSchema.validate(data).error).toBeDefined();
    });

    it("should reject an invalid childId", () => {
      expect(
        createMonthlyInvoiceSchema.validate({
          ...validData,
          childId: "invalid"
        }).error
      ).toBeDefined();
    });

    it("should reject a year below 2000", () => {
      expect(
        createMonthlyInvoiceSchema.validate({
          ...validData,
          periodYear: 1999
        }).error
      ).toBeDefined();
    });

    it("should reject a year above 2100", () => {
      expect(
        createMonthlyInvoiceSchema.validate({
          ...validData,
          periodYear: 2101
        }).error
      ).toBeDefined();
    });

    it("should reject a month below 1", () => {
      expect(
        createMonthlyInvoiceSchema.validate({
          ...validData,
          periodMonth: 0
        }).error
      ).toBeDefined();
    });

    it("should reject a month above 12", () => {
      expect(
        createMonthlyInvoiceSchema.validate({
          ...validData,
          periodMonth: 13
        }).error
      ).toBeDefined();
    });

    it("should reject a non-integer month", () => {
      expect(
        createMonthlyInvoiceSchema.validate({
          ...validData,
          periodMonth: 1.5
        }).error
      ).toBeDefined();
    });

    it("should reject an invalid dueDate format", () => {
      expect(
        createMonthlyInvoiceSchema.validate({
          ...validData,
          dueDate: "10-01-2026"
        }).error
      ).toBeDefined();
    });

    it("should reject an impossible dueDate", () => {
      expect(
        createMonthlyInvoiceSchema.validate({
          ...validData,
          dueDate: "2026-02-30"
        }).error
      ).toBeDefined();
    });

    it("should allow an omitted dueDate", () => {
      const data = { ...validData };
      delete data.dueDate;

      expect(createMonthlyInvoiceSchema.validate(data).error).toBeUndefined();
    });
  });

  describe("createAnnualInvoiceSchema", () => {
    it("should accept valid annual invoice data", () => {
      expect(createAnnualInvoiceSchema.validate(validData).error).toBeUndefined();
    });

    it("should reject an invalid period", () => {
      expect(
        createAnnualInvoiceSchema.validate({
          ...validData,
          periodMonth: 15
        }).error
      ).toBeDefined();
    });
  });

  describe("invoiceQuerySchema", () => {
    it("should accept valid filters", () => {
      const { error } = invoiceQuerySchema.validate({
        childId,
        payerId,
        periodYear: 2026,
        periodMonth: 1,
        type: "MONTHLY",
        status: "ISSUED"
      });

      expect(error).toBeUndefined();
    });

    it.each(["MONTHLY", "ANNUAL", "ADJUSTMENT"])(
      "should accept invoice type %s",
      (type) => {
        expect(invoiceQuerySchema.validate({ type }).error).toBeUndefined();
      }
    );

    it.each([
      "DRAFT",
      "ISSUED",
      "PARTIALLY_PAID",
      "PAID",
      "CANCELLED"
    ])("should accept status %s", (status) => {
      expect(invoiceQuerySchema.validate({ status }).error).toBeUndefined();
    });

    it("should reject an invalid type", () => {
      expect(
        invoiceQuerySchema.validate({
          type: "INVALID"
        }).error
      ).toBeDefined();
    });

    it("should reject an invalid status", () => {
      expect(
        invoiceQuerySchema.validate({
          status: "INVALID"
        }).error
      ).toBeDefined();
    });

    it("should reject an invalid childId", () => {
      expect(
        invoiceQuerySchema.validate({
          childId: "invalid"
        }).error
      ).toBeDefined();
    });
  });

  describe("invoiceIdSchema", () => {
    it("should accept a valid invoice id", () => {
      expect(
        invoiceIdSchema.validate({ id: invoiceId }).error
      ).toBeUndefined();
    });

    it("should reject an invalid invoice id", () => {
      expect(
        invoiceIdSchema.validate({ id: "invalid" }).error
      ).toBeDefined();
    });
  });

  describe("adjustmentIdSchema", () => {
    it("should accept a valid adjustment id", () => {
      expect(
        adjustmentIdSchema.validate({ adjustmentId }).error
      ).toBeUndefined();
    });

    it("should reject an invalid adjustment id", () => {
      expect(
        adjustmentIdSchema.validate({ adjustmentId: "invalid" }).error
      ).toBeDefined();
    });
  });

  describe("createInvoiceAdjustmentSchema", () => {
    it("should accept valid adjustment data", () => {
      const { error, value } = createInvoiceAdjustmentSchema.validate({
        reason: "Correction of monthly invoice",
        adjustedAmount: 12000
      });

      expect(error).toBeUndefined();
      expect(value.adjustedAmount).toBe(12000);
    });

    it("should trim the reason", () => {
      const { value } = createInvoiceAdjustmentSchema.validate({
        reason: "  Correction of invoice  ",
        adjustedAmount: 12000
      });

      expect(value.reason).toBe("Correction of invoice");
    });

    it("should reject a reason shorter than 5 characters", () => {
      expect(
        createInvoiceAdjustmentSchema.validate({
          reason: "Test",
          adjustedAmount: 12000
        }).error
      ).toBeDefined();
    });

    it("should reject a missing reason", () => {
      expect(
        createInvoiceAdjustmentSchema.validate({
          adjustedAmount: 12000
        }).error
      ).toBeDefined();
    });

    it("should reject a negative adjustedAmount", () => {
      expect(
        createInvoiceAdjustmentSchema.validate({
          reason: "Correction",
          adjustedAmount: -1
        }).error
      ).toBeDefined();
    });

    it("should accept zero adjustedAmount", () => {
      expect(
        createInvoiceAdjustmentSchema.validate({
          reason: "Full cancellation",
          adjustedAmount: 0
        }).error
      ).toBeUndefined();
    });

    it("should reject a decimal adjustedAmount", () => {
      expect(
        createInvoiceAdjustmentSchema.validate({
          reason: "Correction",
          adjustedAmount: 100.5
        }).error
      ).toBeDefined();
    });
  });
});

describe("Invoices service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockReset();
  });

  describe("createMonthly", () => {
    let tx;

    beforeEach(() => {
      tx = createInvoiceTransaction();

      prisma.$transaction.mockImplementation((callback) => callback(tx));

      tx.invoice.findFirst.mockResolvedValue(null);
      tx.invoice.findMany.mockResolvedValue([]);
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

      tuitionService.calculateMonthlyTuitionCost.mockResolvedValue({
        total: "10000"
      });

      mealsService.calculateMealCost.mockResolvedValue({
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31",
        rateBreakdown: [
          {
            ageYears: 4,
            attendedDays: 10,
            dailyRate: "500",
            amount: "5000",
            rateId: "rate-1",
            validFrom: "2026-01-01",
            validTo: null
          }
        ]
      });

      tx.invoice.create.mockResolvedValue(invoice);
      auditService.createLog.mockResolvedValue({});
    });

    it("should create a monthly invoice", async () => {
      const result = await service.createMonthly(
        {
          childId,
          payerId,
          periodYear: 2026,
          periodMonth: 1
        },
        actorId
      );

      expect(tx.invoice.findFirst).toHaveBeenCalledWith({
        where: {
          childId,
          periodYear: 2026,
          periodMonth: 1,
          type: "MONTHLY"
        }
      });

      expect(tuitionService.calculateMonthlyTuitionCost).toHaveBeenCalledWith({
        childId,
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31"
      });

      expect(mealsService.calculateMealCost).toHaveBeenCalledWith({
        childId,
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31"
      });

      expect(tx.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            childId,
            payerId,
            periodYear: 2026,
            periodMonth: 1,
            type: "MONTHLY",
            amountDue: 15000n,
            status: "ISSUED"
          })
        })
      );

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId,
          action: "CREATE",
          entityType: "Invoice",
          entityId: invoiceId
        }),
        tx
      );

      expect(result.amountDue).toBe("15000");
      expect(result.paidAmount).toBe("0");
      expect(result.outstandingBalance).toBe("15000");
    });

    it("should include dueDate when provided", async () => {
      await service.createMonthly(
        {
          childId,
          payerId,
          periodYear: 2026,
          periodMonth: 1,
          dueDate: "2026-01-10"
        },
        actorId
      );

      expect(tx.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dueDate: new Date("2026-01-10T00:00:00.000Z")
          })
        })
      );
    });

    it("should reject an invalid period year", async () => {
      await expect(
        service.createMonthly(
          {
            childId,
            payerId,
            periodYear: 1999,
            periodMonth: 1
          },
          actorId
        )
      ).rejects.toThrow("Invalid period year");

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("should reject an invalid period month", async () => {
      await expect(
        service.createMonthly(
          {
            childId,
            payerId,
            periodYear: 2026,
            periodMonth: 13
          },
          actorId
        )
      ).rejects.toThrow("Invalid period month");
    });

    it("should reject an invalid dueDate", async () => {
      await expect(
        service.createMonthly(
          {
            childId,
            payerId,
            periodYear: 2026,
            periodMonth: 1,
            dueDate: "2026-02-30"
          },
          actorId
        )
      ).rejects.toThrow("Invalid date");
    });

    it("should reject when an invoice already exists", async () => {
      tx.invoice.findFirst.mockResolvedValue(invoice);

      await expect(
        service.createMonthly(
          {
            childId,
            payerId,
            periodYear: 2026,
            periodMonth: 1
          },
          actorId
        )
      ).rejects.toThrow("Invoice already exists for this period");

      expect(tx.invoice.create).not.toHaveBeenCalled();
    });

    it("should reject overlapping billing periods", async () => {
      tx.invoice.findMany.mockResolvedValue([
        {
          periodYear: 2026,
          periodMonth: 1,
          type: "MONTHLY",
          status: "ISSUED"
        }
      ]);

      await expect(
        service.createMonthly(
          {
            childId,
            payerId,
            periodYear: 2026,
            periodMonth: 1
          },
          actorId
        )
      ).rejects.toThrow("Another invoice already covers part of this billing period");

      expect(tx.invoice.create).not.toHaveBeenCalled();
    });

    it("should ignore cancelled invoices when checking overlapping periods", async () => {
      tx.invoice.findMany.mockResolvedValue([
        {
          periodYear: 2026,
          periodMonth: 1,
          type: "MONTHLY",
          status: "CANCELLED"
        }
      ]);

      await service.createMonthly(
        {
          childId,
          payerId,
          periodYear: 2026,
          periodMonth: 1
        },
        actorId
      );

      expect(tx.invoice.create).toHaveBeenCalled();
    });

    it("should reject when child does not exist or is inactive", async () => {
      tx.child.findUnique.mockResolvedValue({
        id: childId,
        status: "INACTIVE"
      });

      await expect(
        service.createMonthly(
          {
            childId,
            payerId,
            periodYear: 2026,
            periodMonth: 1
          },
          actorId
        )
      ).rejects.toThrow("Active child not found");
    });

    it("should reject when payer does not exist or is inactive", async () => {
      tx.parent.findUnique.mockResolvedValue(null);

      await expect(
        service.createMonthly(
          {
            childId,
            payerId,
            periodYear: 2026,
            periodMonth: 1
          },
          actorId
        )
      ).rejects.toThrow("Active payer not found");
    });

    it("should reject when payer is not related to child", async () => {
      tx.childParent.findFirst.mockResolvedValue(null);

      await expect(
        service.createMonthly(
          {
            childId,
            payerId,
            periodYear: 2026,
            periodMonth: 1
          },
          actorId
        )
      ).rejects.toThrow("Payer is not an active parent or guardian of this child");
    });

    it("should convert Prisma P2002 error", async () => {
      prisma.$transaction.mockRejectedValue({
        code: "P2002"
      });

      await expect(
        service.createMonthly(
          {
            childId,
            payerId,
            periodYear: 2026,
            periodMonth: 1
          },
          actorId
        )
      ).rejects.toThrow("Invoice already exists for this period");
    });
  });

  describe("createAnnual", () => {
    let tx;

    beforeEach(() => {
      tx = createInvoiceTransaction();

      prisma.$transaction.mockImplementation((callback) => callback(tx));

      tx.invoice.findFirst.mockResolvedValue(null);
      tx.invoice.findMany.mockResolvedValue([]);
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

      tuitionService.calculateAnnualTuitionCost.mockResolvedValue({
        total: "120000"
      });

      tx.invoice.create.mockResolvedValue({
        ...invoice,
        type: "ANNUAL",
        amountDue: 120000n,
        lines: [
          {
            description: "Навчання — річна передоплата",
            quantity: 1,
            unitAmount: 120000n,
            amount: 120000n
          }
        ]
      });

      auditService.createLog.mockResolvedValue({});
    });

    it("should create an annual invoice", async () => {
      const result = await service.createAnnual(
        {
          childId,
          payerId,
          periodYear: 2026,
          periodMonth: 1
        },
        actorId
      );

      expect(tuitionService.calculateAnnualTuitionCost).toHaveBeenCalledWith({
        childId,
        periodStart: "2026-01-01"
      });

      expect(mealsService.calculateMealCost).not.toHaveBeenCalled();

      expect(tx.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "ANNUAL",
            amountDue: 120000n
          })
        })
      );

      expect(result.amountDue).toBe("120000");
    });

    it("should reject an overlapping monthly invoice", async () => {
      tx.invoice.findMany.mockResolvedValue([
        {
          periodYear: 2026,
          periodMonth: 6,
          type: "MONTHLY",
          status: "ISSUED"
        }
      ]);

      await expect(
        service.createAnnual(
          {
            childId,
            payerId,
            periodYear: 2026,
            periodMonth: 1
          },
          actorId
        )
      ).rejects.toThrow("Another invoice already covers part of this billing period");
    });
  });

  describe("getAll", () => {
    beforeEach(() => {
      prisma.invoice.findMany.mockResolvedValue([invoice]);
      creditService.getInvoicePaidAmount.mockResolvedValue(5000n);
      creditService.getEffectiveInvoiceAmount.mockResolvedValue(15000n);
    });

    it("should return invoices for admin with filters", async () => {
      const result = await service.getAll(
        {
          childId,
          payerId,
          status: "ISSUED",
          type: "MONTHLY",
          periodYear: "2026",
          periodMonth: "1"
        },
        admin
      );

      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            childId,
            payerId,
            status: "ISSUED",
            type: "MONTHLY",
            periodYear: 2026,
            periodMonth: 1
          }
        })
      );

      expect(result[0].paidAmount).toBe("5000");
      expect(result[0].outstandingBalance).toBe("10000");
    });

    it("should restrict parent invoices to their own payer profile", async () => {
      prisma.parent.findUnique.mockResolvedValue({
        id: payerId
      });

      await service.getAll(
        {
          childId: "507f1f77bcf86cd799439099",
          payerId: "507f1f77bcf86cd799439098"
        },
        parentUser
      );

      expect(prisma.parent.findUnique).toHaveBeenCalledWith({
        where: {
          userId: parentUser.id
        },
        select: {
          id: true
        }
      });

      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            payerId
          }
        })
      );
    });

    it("should reject when parent profile does not exist", async () => {
      prisma.parent.findUnique.mockResolvedValue(null);

      await expect(
        service.getAll({}, parentUser)
      ).rejects.toThrow("Parent profile not found");

      expect(prisma.invoice.findMany).not.toHaveBeenCalled();
    });

    it("should return an empty array when there are no invoices", async () => {
      prisma.invoice.findMany.mockResolvedValue([]);

      const result = await service.getAll({}, admin);

      expect(result).toEqual([]);
    });

    it("should serialize invoice amounts as strings", async () => {
      const result = await service.getAll({}, admin);

      expect(result[0].amountDue).toBe("15000");
      expect(result[0].paidAmount).toBe("5000");
      expect(result[0].outstandingBalance).toBe("10000");
      expect(typeof result[0].amountDue).toBe("string");
    });

    it("should not return allocations in serialized invoice", async () => {
      const result = await service.getAll({}, admin);

      expect(result[0]).not.toHaveProperty("allocations");
    });
  });

  describe("getById", () => {
    beforeEach(() => {
      prisma.invoice.findUnique.mockResolvedValue(invoice);
      creditService.getInvoicePaidAmount.mockResolvedValue(5000n);
      creditService.getEffectiveInvoiceAmount.mockResolvedValue(15000n);
    });

    it("should return an invoice by id", async () => {
      const result = await service.getById(invoiceId, admin);

      expect(prisma.invoice.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: invoiceId
          }
        })
      );

      expect(result.amountDue).toBe("15000");
      expect(result.paidAmount).toBe("5000");
    });

    it("should throw when invoice does not exist", async () => {
      prisma.invoice.findUnique.mockResolvedValue(null);

      await expect(
        service.getById(invoiceId, admin)
      ).rejects.toThrow("Invoice not found");
    });

    it("should forbid a parent from viewing another parent's invoice", async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        ...invoice,
        payer: {
          userId: "another-user"
        }
      });

      await expect(
        service.getById(invoiceId, parentUser)
      ).rejects.toThrow("You do not have permission to access this invoice");
    });

    it("should allow a parent to view their own invoice", async () => {
      const result = await service.getById(invoiceId, parentUser);

      expect(result.id).toBe(invoiceId);
    });
  });

  describe("cancel", () => {
    let tx;

    beforeEach(() => {
      tx = createInvoiceTransaction();
      prisma.$transaction.mockImplementation((callback) => callback(tx));

      tx.invoice.findUnique.mockResolvedValue(invoice);
      tx.paymentAllocation.findMany.mockResolvedValue([]);
      tx.invoice.update.mockResolvedValue({
        ...invoice,
        status: "CANCELLED"
      });

      auditService.createLog.mockResolvedValue({});
      creditService.restoreInvoiceCreditApplications.mockResolvedValue({});
    });

    it("should cancel an invoice", async () => {
      const result = await service.cancel(invoiceId, actorId);

      expect(tx.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: invoiceId
          },
          data: {
            status: "CANCELLED"
          }
        })
      );

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId,
          action: "CANCEL",
          entityType: "Invoice",
          entityId: invoiceId
        }),
        tx
      );

      expect(result.status).toBe("CANCELLED");
    });

    it("should throw when invoice does not exist", async () => {
      tx.invoice.findUnique.mockResolvedValue(null);

      await expect(
        service.cancel(invoiceId, actorId)
      ).rejects.toThrow("Invoice not found");
    });

    it("should reject an already cancelled invoice", async () => {
      tx.invoice.findUnique.mockResolvedValue({
        ...invoice,
        status: "CANCELLED"
      });

      await expect(
        service.cancel(invoiceId, actorId)
      ).rejects.toThrow("Invoice is already cancelled");
    });

    it.each(["PAID", "PARTIALLY_PAID"])(
      "should reject a %s invoice without credit balance transactions",
      async (status) => {
        delete tx.creditBalanceTransaction;

        tx.invoice.findUnique.mockResolvedValue({
          ...invoice,
          status
        });

        await expect(
          service.cancel(invoiceId, actorId)
        ).rejects.toThrow("Paid or partially paid invoice cannot be cancelled");
      }
    );

    it("should reject an invoice with completed cash payments", async () => {
      tx.paymentAllocation.findMany.mockResolvedValue([
        {
          amount: 1000n
        }
      ]);

      await expect(
        service.cancel(invoiceId, actorId)
      ).rejects.toThrow("Cancel completed payments before cancelling this invoice");

      expect(tx.invoice.update).not.toHaveBeenCalled();
    });

    it("should restore credit applications when credit transactions are available", async () => {
      await service.cancel(invoiceId, actorId);

      expect(creditService.restoreInvoiceCreditApplications).toHaveBeenCalledWith(
        tx,
        invoiceId,
        actorId
      );
    });
  });
});

describe("Invoice adjustments service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockReset();
  });

  describe("create", () => {
    let tx;

    const baseAdjustmentInvoice = {
      id: invoiceId,
      payerId,
      amountDue: 15000n,
      status: "ISSUED"
    };

    beforeEach(() => {
      tx = createInvoiceTransaction();
      prisma.$transaction.mockImplementation((callback) => callback(tx));

      tx.invoice.findUnique.mockResolvedValue(baseAdjustmentInvoice);
      tx.invoiceAdjustment.findFirst.mockResolvedValue(null);
      tx.paymentAllocation.findMany.mockResolvedValue([]);
      tx.invoiceAdjustment.create.mockResolvedValue({
        id: adjustmentId,
        originalInvoiceId: invoiceId,
        payerId,
        reason: "Correction of invoice",
        previousAmount: 15000n,
        adjustedAmount: 12000n
      });

      tx.creditBalanceTransaction.findMany.mockResolvedValue([]);
      tx.invoice.update.mockResolvedValue({
        ...baseAdjustmentInvoice,
        status: "ISSUED"
      });

      creditService.getInvoiceCreditPaidAmount.mockResolvedValue(0n);
      creditService.getEffectiveInvoiceAmount.mockResolvedValue(12000n);
      creditService.getInvoicePaidAmount.mockResolvedValue(0n);
      auditService.createLog.mockResolvedValue({});
    });

    it("should create an invoice adjustment", async () => {
      const result = await adjustmentsService.create(
        invoiceId,
        {
          reason: "  Correction of invoice  ",
          adjustedAmount: 12000
        },
        actorId
      );

      expect(tx.invoiceAdjustment.create).toHaveBeenCalledWith({
        data: {
          originalInvoiceId: invoiceId,
          payerId,
          reason: "Correction of invoice",
          previousAmount: 15000n,
          adjustedAmount: 12000n,
          createdById: actorId
        }
      });

      expect(result.previousAmount).toBe("15000");
      expect(result.adjustedAmount).toBe("12000");
      expect(result.delta).toBe("-3000");
      expect(result.creditIssued).toBe("0");
      expect(result.invoiceStatus).toBe("ISSUED");
    });

    it("should reject a negative adjusted amount", async () => {
      await expect(
        adjustmentsService.create(
          invoiceId,
          {
            reason: "Correction of invoice",
            adjustedAmount: -1
          },
          actorId
        )
      ).rejects.toThrow("Adjusted amount cannot be negative");

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("should reject a reason shorter than five characters", async () => {
      await expect(
        adjustmentsService.create(
          invoiceId,
          {
            reason: "Test",
            adjustedAmount: 12000
          },
          actorId
        )
      ).rejects.toThrow("Adjustment reason must contain at least 5 characters");
    });

    it("should reject when invoice does not exist", async () => {
      tx.invoice.findUnique.mockResolvedValue(null);

      await expect(
        adjustmentsService.create(
          invoiceId,
          {
            reason: "Correction of invoice",
            adjustedAmount: 12000
          },
          actorId
        )
      ).rejects.toThrow("Invoice not found");
    });

    it.each(["DRAFT", "CANCELLED"])(
      "should reject an invoice with status %s",
      async (status) => {
        tx.invoice.findUnique.mockResolvedValue({
          ...baseAdjustmentInvoice,
          status
        });

        await expect(
          adjustmentsService.create(
            invoiceId,
            {
              reason: "Correction of invoice",
              adjustedAmount: 12000
            },
            actorId
          )
        ).rejects.toThrow("Only issued invoices can be adjusted");
      }
    );

    it("should reject an unchanged adjusted amount", async () => {
      await expect(
        adjustmentsService.create(
          invoiceId,
          {
            reason: "Correction of invoice",
            adjustedAmount: 15000
          },
          actorId
        )
      ).rejects.toThrow("Adjusted amount must differ from current amount");
    });

    it("should use the latest adjustment as the previous amount", async () => {
      tx.invoiceAdjustment.findFirst.mockResolvedValue({
        adjustedAmount: 14000n
      });

      tx.invoiceAdjustment.create.mockResolvedValue({
        id: adjustmentId,
        previousAmount: 14000n,
        adjustedAmount: 12000n
      });

      await adjustmentsService.create(
        invoiceId,
        {
          reason: "Correction of invoice",
          adjustedAmount: 12000
        },
        actorId
      );

      expect(tx.invoiceAdjustment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            previousAmount: 14000n,
            adjustedAmount: 12000n
          })
        })
      );
    });

    it("should issue adjustment credit when paid amount exceeds the new amount", async () => {
      tx.paymentAllocation.findMany
        .mockResolvedValueOnce([{ amount: 15000n }])
        .mockResolvedValueOnce([
          {
            id: "allocation-1",
            amount: 15000n,
            paymentId: "payment-1"
          }
        ]);

      tx.creditBalanceTransaction.findMany.mockResolvedValue([]);
      creditService.getInvoiceCreditPaidAmount.mockResolvedValue(0n);

      const result = await adjustmentsService.create(
        invoiceId,
        {
          reason: "Correction of invoice",
          adjustedAmount: 10000
        },
        actorId
      );

      expect(creditService.postTransaction).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          parentId: payerId,
          type: "ADJUSTMENT_CREDIT",
          amountDelta: 5000n,
          invoiceId,
          paymentId: "payment-1",
          adjustmentId
        })
      );

      expect(result.creditIssued).toBe("5000");
    });

    it("should create an audit log", async () => {
      await adjustmentsService.create(
        invoiceId,
        {
          reason: "Correction of invoice",
          adjustedAmount: 12000
        },
        actorId
      );

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId,
          action: "UPDATE",
          entityType: "InvoiceAdjustment",
          entityId: adjustmentId
        }),
        tx
      );
    });
  });

  describe("getHistory", () => {
    it("should return adjustment history", async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: invoiceId,
        payer: {
          userId: parentUser.id
        }
      });

      prisma.invoiceAdjustment.findMany.mockResolvedValue([
        {
          id: adjustmentId,
          previousAmount: 15000n,
          adjustedAmount: 12000n
        }
      ]);

      const result = await adjustmentsService.getHistory(
        invoiceId,
        parentUser
      );

      expect(prisma.invoiceAdjustment.findMany).toHaveBeenCalledWith({
        where: {
          originalInvoiceId: invoiceId
        },
        orderBy: {
          createdAt: "asc"
        }
      });

      expect(result[0].previousAmount).toBe("15000");
      expect(result[0].adjustedAmount).toBe("12000");
      expect(result[0].delta).toBe("-3000");
    });

    it("should return an empty array when there are no adjustments", async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: invoiceId,
        payer: {
          userId: parentUser.id
        }
      });

      prisma.invoiceAdjustment.findMany.mockResolvedValue([]);

      const result = await adjustmentsService.getHistory(
        invoiceId,
        parentUser
      );

      expect(result).toEqual([]);
    });

    it("should throw when invoice does not exist", async () => {
      prisma.invoice.findUnique.mockResolvedValue(null);

      await expect(
        adjustmentsService.getHistory(invoiceId, admin)
      ).rejects.toThrow("Invoice not found");
    });

    it("should forbid a parent from viewing another parent's adjustment history", async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: invoiceId,
        payer: {
          userId: "another-user"
        }
      });

      await expect(
        adjustmentsService.getHistory(invoiceId, parentUser)
      ).rejects.toThrow("You do not have permission to access this invoice");

      expect(prisma.invoiceAdjustment.findMany).not.toHaveBeenCalled();
    });
  });

  describe("cancel", () => {
    let tx;

    const adjustment = {
      id: adjustmentId,
      originalInvoiceId: invoiceId,
      payerId,
      previousAmount: 15000n,
      adjustedAmount: 12000n,
      reason: "Correction of invoice"
    };

    beforeEach(() => {
      tx = createInvoiceTransaction();
      prisma.$transaction.mockImplementation((callback) => callback(tx));

      tx.invoiceAdjustment.findUnique.mockResolvedValue(adjustment);
      tx.invoiceAdjustment.findFirst.mockResolvedValue(null);
      tx.invoiceAdjustment.findMany.mockResolvedValue([]);
      tx.invoice.findUnique.mockResolvedValue(invoice);

      tx.invoiceAdjustment.create.mockResolvedValue({
        id: "507f1f77bcf86cd799439017",
        originalInvoiceId: invoiceId,
        payerId,
        previousAmount: 12000n,
        adjustedAmount: 15000n
      });

      tx.invoice.update.mockResolvedValue({
        ...invoice,
        status: "ISSUED"
      });

      tx.creditBalanceTransaction.findMany.mockResolvedValue([]);
      creditService.getEffectiveInvoiceAmount.mockResolvedValue(15000n);
      creditService.getInvoicePaidAmount.mockResolvedValue(0n);
      auditService.createLog.mockResolvedValue({});
    });

    it("should cancel an adjustment by creating a reversal document", async () => {
      const result = await adjustmentsService.cancel(
        adjustmentId,
        actorId
      );

      expect(tx.invoiceAdjustment.create).toHaveBeenCalledWith({
        data: {
          originalInvoiceId: invoiceId,
          payerId,
          reason: `Сторнування коригування ${adjustmentId}`,
          previousAmount: 12000n,
          adjustedAmount: 15000n,
          createdById: actorId,
          reversedFromId: adjustmentId
        }
      });

      expect(result.previousAmount).toBe("12000");
      expect(result.adjustedAmount).toBe("15000");
      expect(result.delta).toBe("3000");
      expect(result.invoiceStatus).toBe("ISSUED");
    });

    it("should throw when adjustment does not exist", async () => {
      tx.invoiceAdjustment.findUnique.mockResolvedValue(null);

      await expect(
        adjustmentsService.cancel(adjustmentId, actorId)
      ).rejects.toThrow("Adjustment not found");
    });

    it("should reject cancellation of a reversal document", async () => {
      tx.invoiceAdjustment.findUnique.mockResolvedValue({
        ...adjustment,
        reversedFromId: "507f1f77bcf86cd799439018"
      });

      await expect(
        adjustmentsService.cancel(adjustmentId, actorId)
      ).rejects.toThrow("A reversal document cannot be cancelled");
    });

    it("should reject an already cancelled adjustment", async () => {
      tx.invoiceAdjustment.findFirst.mockResolvedValue({
        id: "507f1f77bcf86cd799439019"
      });

      await expect(
        adjustmentsService.cancel(adjustmentId, actorId)
      ).rejects.toThrow("Adjustment is already cancelled");
    });

    it("should reject cancellation when adjustment is not the latest", async () => {
      tx.invoiceAdjustment.findFirst.mockResolvedValue(null);

      tx.invoiceAdjustment.findFirst.mockImplementation(async (args) => {
        if (args.where.reversedFromId) return null;
        return {
          id: "507f1f77bcf86cd799439099"
        };
      });

      await expect(
        adjustmentsService.cancel(adjustmentId, actorId)
      ).rejects.toThrow("Only the latest adjustment can be cancelled");
    });

    it("should create an audit log for the reversal", async () => {
      await adjustmentsService.cancel(adjustmentId, actorId);

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId,
          action: "CANCEL",
          entityType: "InvoiceAdjustment"
        }),
        tx
      );
    });
  });
});

describe("Invoices controller", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("should create a monthly invoice and return 201", async () => {
    jest.spyOn(service, "createMonthly").mockResolvedValue(serializedInvoice);

    const req = {
      user: {
        id: actorId
      }
    };

    const res = createResponse();
    res.locals.validated.body = {
      childId,
      payerId,
      periodYear: 2026,
      periodMonth: 1
    };

    await controller.createMonthly(req, res);

    expect(service.createMonthly).toHaveBeenCalledWith(
      res.locals.validated.body,
      actorId
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: serializedInvoice
    });
  });

  it("should create an annual invoice and return 201", async () => {
    jest.spyOn(service, "createAnnual").mockResolvedValue(serializedInvoice);

    const req = {
      user: {
        id: actorId
      }
    };

    const res = createResponse();
    res.locals.validated.body = {
      childId,
      payerId,
      periodYear: 2026,
      periodMonth: 1
    };

    await controller.createAnnual(req, res);

    expect(service.createAnnual).toHaveBeenCalledWith(
      res.locals.validated.body,
      actorId
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
  });

  it("should get all invoices", async () => {
    jest.spyOn(service, "getAll").mockResolvedValue([serializedInvoice]);

    const req = {
      user: admin
    };

    const res = createResponse();
    res.locals.validated.query = {
      status: "ISSUED"
    };

    await controller.getAll(req, res);

    expect(service.getAll).toHaveBeenCalledWith(
      res.locals.validated.query,
      req.user
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [serializedInvoice]
    });
  });

  it("should get an invoice by id", async () => {
    jest.spyOn(service, "getById").mockResolvedValue(serializedInvoice);

    const req = {
      user: admin
    };

    const res = createResponse();
    res.locals.validated.params = {
      id: invoiceId
    };

    await controller.getById(req, res);

    expect(service.getById).toHaveBeenCalledWith(invoiceId, req.user);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
  });

  it("should cancel an invoice", async () => {
    jest.spyOn(service, "cancel").mockResolvedValue({
      ...serializedInvoice,
      status: "CANCELLED"
    });

    const req = {
      user: {
        id: actorId
      }
    };

    const res = createResponse();
    res.locals.validated.params = {
      id: invoiceId
    };

    await controller.cancel(req, res);

    expect(service.cancel).toHaveBeenCalledWith(invoiceId, actorId);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
  });

  it("should create an adjustment", async () => {
    jest.spyOn(adjustmentsService, "create").mockResolvedValue({
      id: adjustmentId
    });

    const req = {
      user: {
        id: actorId
      }
    };

    const res = createResponse();
    res.locals.validated.params = {
      id: invoiceId
    };
    res.locals.validated.body = {
      reason: "Correction of invoice",
      adjustedAmount: 12000
    };

    await controller.createAdjustment(req, res);

    expect(adjustmentsService.create).toHaveBeenCalledWith(
      invoiceId,
      res.locals.validated.body,
      actorId
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
  });

  it("should get adjustment history", async () => {
    jest.spyOn(adjustmentsService, "getHistory").mockResolvedValue([]);

    const req = {
      user: admin
    };

    const res = createResponse();
    res.locals.validated.params = {
      id: invoiceId
    };

    await controller.getAdjustmentHistory(req, res);

    expect(adjustmentsService.getHistory).toHaveBeenCalledWith(
      invoiceId,
      req.user
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
  });

  it("should cancel an adjustment", async () => {
    jest.spyOn(adjustmentsService, "cancel").mockResolvedValue({
      id: adjustmentId
    });

    const req = {
      user: {
        id: actorId
      }
    };

    const res = createResponse();
    res.locals.validated.params = {
      adjustmentId
    };

    await controller.cancelAdjustment(req, res);

    expect(adjustmentsService.cancel).toHaveBeenCalledWith(
      adjustmentId,
      actorId
    );

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
  });
});

describe("Invoices routes", () => {
  it("should register all expected routes", () => {
    const routes = router.stack
      .filter((layer) => layer.route)
      .map((layer) => ({
        path: layer.route.path,
        methods: layer.route.methods
      }));

    expect(routes).toEqual([
      { path: "/", methods: { get: true } },
      { path: "/monthly", methods: { post: true } },
      { path: "/annual", methods: { post: true } },
      { path: "/:id/adjustments", methods: { get: true } },
      { path: "/:id/adjustments", methods: { post: true } },
      { path: "/adjustments/:adjustmentId/cancel", methods: { patch: true } },
      { path: "/:id", methods: { get: true } },
      { path: "/:id/cancel", methods: { patch: true } }
    ]);
  });

  it("should register authentication middleware", () => {
    const middlewareLayers = router.stack.filter(
      (layer) => !layer.route
    );

    expect(middlewareLayers.length).toBeGreaterThan(0);
  });

  it("should register validation middleware on routes", () => {
    const routes = router.stack.filter((layer) => layer.route);

    routes.forEach((layer) => {
      expect(layer.route.stack.length).toBeGreaterThanOrEqual(2);
    });
  });
});
