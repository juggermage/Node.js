jest.mock("../../src/config/prisma", () => ({
  invoice: {
    findMany: jest.fn()
  },
  payment: {
    findMany: jest.fn()
  },
  salaryCalculation: {
    findMany: jest.fn()
  },
  expense: {
    findMany: jest.fn()
  },
  groupEnrollment: {
    findMany: jest.fn()
  }
}));

const prisma = require("../../src/config/prisma");
const analyticsService = require("../../src/modules/analytics/analytics.service");
const { periodSchema } = require("../../src/modules/analytics/analytics.validation");

describe("Analytics module", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Period validation", () => {
    test("accepts valid date range", () => {
      const result = periodSchema.validate({
        from: "2026-10-01",
        to: "2026-10-31"
      });

      expect(result.error).toBeUndefined();
    });

    test("accepts the same date for from and to", () => {
      const result = periodSchema.validate({
        from: "2026-10-01",
        to: "2026-10-01"
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects missing from date", () => {
      const result = periodSchema.validate({
        to: "2026-10-31"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects missing to date", () => {
      const result = periodSchema.validate({
        from: "2026-10-01"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects invalid date format", () => {
      const result = periodSchema.validate({
        from: "01-10-2026",
        to: "2026-10-31"
      });

      expect(result.error.message).toContain("Date must use YYYY-MM-DD format");
    });

    test("rejects invalid calendar date", () => {
      const result = periodSchema.validate({
        from: "2026-02-30",
        to: "2026-03-31"
      });

      expect(result.error.message).toContain("Date must be a valid calendar date");
    });

    test("rejects from date later than to date", () => {
      const result = periodSchema.validate({
        from: "2026-10-31",
        to: "2026-10-01"
      });

      expect(result.error.message).toContain("from must not be later than to");
    });
  });

  describe("getSummary", () => {
    test("returns financial summary with correct calculations", async () => {
      prisma.invoice.findMany.mockResolvedValue([
        {
          amountDue: 25000n,
          allocations: [{ amount: 10000n }]
        },
        {
          amountDue: 50000n,
          allocations: [{ amount: 20000n }]
        }
      ]);

      prisma.payment.findMany.mockResolvedValue([
        { amount: 30000n, paidAt: new Date("2026-10-15") }
      ]);

      prisma.salaryCalculation.findMany.mockResolvedValue([
        { totalAmount: 5000n, paidAt: new Date("2026-10-20") }
      ]);

      prisma.expense.findMany.mockResolvedValue([
        {
          amount: 3000n,
          expenseDate: new Date("2026-10-10"),
          category: "UTILITIES"
        },
        {
          amount: 2000n,
          expenseDate: new Date("2026-10-12"),
          category: "UTILITIES"
        },
        {
          amount: 1000n,
          expenseDate: new Date("2026-10-15"),
          category: "OTHER"
        }
      ]);

      const result = await analyticsService.getSummary({
        from: "2026-10-01",
        to: "2026-10-31"
      });

      expect(result).toEqual({
        period: {
          from: "2026-10-01",
          to: "2026-10-31"
        },
        invoices: {
          count: 2,
          accruedAmount: "75000",
          outstandingBalance: "45000"
        },
        payments: {
          count: 1,
          receivedAmount: "30000"
        },
        expenses: {
          salaries: "5000",
          other: "6000",
          total: "11000",
          byCategory: {
            UTILITIES: "5000",
            OTHER: "1000"
          }
        },
        operatingProfit: "19000",
        currency: "UAH"
      });
    });

    test("returns zero values when no records exist", async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      prisma.payment.findMany.mockResolvedValue([]);
      prisma.salaryCalculation.findMany.mockResolvedValue([]);
      prisma.expense.findMany.mockResolvedValue([]);

      const result = await analyticsService.getSummary({
        from: "2026-10-01",
        to: "2026-10-31"
      });

      expect(result.invoices.count).toBe(0);
      expect(result.invoices.accruedAmount).toBe("0");
      expect(result.invoices.outstandingBalance).toBe("0");
      expect(result.payments.count).toBe(0);
      expect(result.payments.receivedAmount).toBe("0");
      expect(result.expenses.total).toBe("0");
      expect(result.operatingProfit).toBe("0");
    });

    test("does not include negative outstanding balances", async () => {
      prisma.invoice.findMany.mockResolvedValue([
        {
          amountDue: 10000n,
          allocations: [{ amount: 15000n }]
        }
      ]);

      prisma.payment.findMany.mockResolvedValue([]);
      prisma.salaryCalculation.findMany.mockResolvedValue([]);
      prisma.expense.findMany.mockResolvedValue([]);

      const result = await analyticsService.getSummary({
        from: "2026-10-01",
        to: "2026-10-31"
      });

      expect(result.invoices.outstandingBalance).toBe("0");
    });

    test("uses the correct date and status filters for invoices", async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      prisma.payment.findMany.mockResolvedValue([]);
      prisma.salaryCalculation.findMany.mockResolvedValue([]);
      prisma.expense.findMany.mockResolvedValue([]);

      await analyticsService.getSummary({
        from: "2026-10-01",
        to: "2026-10-31"
      });

      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            issuedAt: {
              gte: new Date("2026-10-01T00:00:00.000Z"),
              lt: new Date("2026-11-01T00:00:00.000Z")
            },
            status: {
              notIn: ["DRAFT", "CANCELLED"]
            }
          }
        })
      );
    });

    test("rejects invalid date", async () => {
      await expect(
        analyticsService.getSummary({
          from: "2026-02-30",
          to: "2026-03-31"
        })
      ).rejects.toThrow("Invalid date");

      expect(prisma.invoice.findMany).not.toHaveBeenCalled();
    });

    test("rejects reversed date range", async () => {
      await expect(
        analyticsService.getSummary({
          from: "2026-10-31",
          to: "2026-10-01"
        })
      ).rejects.toThrow("Period start is after period end");

      expect(prisma.invoice.findMany).not.toHaveBeenCalled();
    });
  });

  describe("getGroupReport", () => {
    test("returns grouped invoice statistics", async () => {
      prisma.invoice.findMany.mockResolvedValue([
        {
          childId: "child-1",
          periodYear: 2026,
          periodMonth: 10,
          type: "MONTHLY",
          amountDue: 25000n,
          allocations: [{ amount: 10000n }]
        },
        {
          childId: "child-2",
          periodYear: 2026,
          periodMonth: 10,
          type: "MONTHLY",
          amountDue: 30000n,
          allocations: [{ amount: 15000n }]
        }
      ]);

      prisma.groupEnrollment.findMany.mockResolvedValue([
        {
          childId: "child-1",
          startDate: new Date("2026-01-01"),
          endDate: null,
          group: {
            id: "group-1",
            name: "Group A"
          }
        },
        {
          childId: "child-2",
          startDate: new Date("2026-01-01"),
          endDate: null,
          group: {
            id: "group-2",
            name: "Group B"
          }
        }
      ]);

      const result = await analyticsService.getGroupReport({
        from: "2026-10-01",
        to: "2026-10-31"
      });

      expect(result.groups).toEqual([
        {
          groupId: "group-1",
          groupName: "Group A",
          invoiceCount: 1,
          accruedAmount: "25000",
          receivedAmount: "10000",
          outstandingBalance: "15000"
        },
        {
          groupId: "group-2",
          groupName: "Group B",
          invoiceCount: 1,
          accruedAmount: "30000",
          receivedAmount: "15000",
          outstandingBalance: "15000"
        }
      ]);

      expect(result.currency).toBe("UAH");
    });

    test("returns an empty groups array when no invoices exist", async () => {
      prisma.invoice.findMany.mockResolvedValue([]);

      const result = await analyticsService.getGroupReport({
        from: "2026-10-01",
        to: "2026-10-31"
      });

      expect(result.groups).toEqual([]);
      expect(prisma.groupEnrollment.findMany).not.toHaveBeenCalled();
    });

    test("assigns invoices without enrollment to the default group", async () => {
      prisma.invoice.findMany.mockResolvedValue([
        {
          childId: "child-1",
          periodYear: 2026,
          periodMonth: 10,
          type: "MONTHLY",
          amountDue: 25000n,
          allocations: [{ amount: 5000n }]
        }
      ]);

      prisma.groupEnrollment.findMany.mockResolvedValue([]);

      const result = await analyticsService.getGroupReport({
        from: "2026-10-01",
        to: "2026-10-31"
      });

      expect(result.groups).toEqual([
        {
          groupId: "WITHOUT_GROUP",
          groupName: "Без групи",
          invoiceCount: 1,
          accruedAmount: "25000",
          receivedAmount: "5000",
          outstandingBalance: "20000"
        }
      ]);
    });

    test("does not include negative outstanding balances", async () => {
      prisma.invoice.findMany.mockResolvedValue([
        {
          childId: "child-1",
          periodYear: 2026,
          periodMonth: 10,
          type: "MONTHLY",
          amountDue: 10000n,
          allocations: [{ amount: 15000n }]
        }
      ]);

      prisma.groupEnrollment.findMany.mockResolvedValue([]);

      const result = await analyticsService.getGroupReport({
        from: "2026-10-01",
        to: "2026-10-31"
      });

      expect(result.groups[0].outstandingBalance).toBe("0");
    });

    test("rejects invalid date range", async () => {
      await expect(
        analyticsService.getGroupReport({
          from: "2026-10-31",
          to: "2026-10-01"
        })
      ).rejects.toThrow("Period start is after period end");

      expect(prisma.invoice.findMany).not.toHaveBeenCalled();
    });
  });
});