
jest.mock("../../src/config/prisma", () => ({
  invoice: { findMany: jest.fn() },
  paymentAllocation: { findMany: jest.fn() },
  expense: { findMany: jest.fn() },
  salaryCalculation: { findMany: jest.fn() },
  attendance: { findMany: jest.fn() },
  group: { findMany: jest.fn() },
  groupEnrollment: { findMany: jest.fn() },
  staffAssignment: { findMany: jest.fn() },
}));

jest.mock("../../src/modules/billing/credit-balance.service", () => ({
  getInvoicePaidAmount: jest.fn().mockResolvedValue(0n),
}));

jest.mock("../../src/middleware/validate.middleware", () =>
  jest.fn(() => (req, res, next) => next()),
);

jest.mock("../../src/middleware/auth.middleware", () =>
  jest.fn((req, res, next) => next()),
);

jest.mock("../../src/middleware/rbac.middleware", () =>
  jest.fn(() => (req, res, next) => next()),
);

const prisma = require("../../src/config/prisma");
const {
  getInvoicePaidAmount,
} = require("../../src/modules/billing/credit-balance.service");
const service = require("../../src/modules/analytics/analytics.service");
const controller = require("../../src/modules/analytics/analytics.controller");
const {
  periodSchema,
  attendanceReportSchema,
} = require("../../src/modules/analytics/analytics.validation");
const HTTP_STATUS = require("../../src/utils/http-status");

const query = {
  from: "2026-10-01",
  to: "2026-10-31",
};


function createResponse() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    locals: {
      validated: {
        query,
      },
    },
  };

  return res;
}

describe("Analytics validation", () => {
  describe("periodSchema", () => {
    test("accepts a valid date range", () => {
      const result = periodSchema.validate(query);

      expect(result.error).toBeUndefined();
    });

    test("accepts a single-day period", () => {
      const result = periodSchema.validate({
        from: "2026-10-10",
        to: "2026-10-10",
      });

      expect(result.error).toBeUndefined();
    });

    test("accepts a MONTH period", () => {
      const result = periodSchema.validate({
        periodType: "MONTH",
        year: 2026,
        month: 10,
      });

      expect(result.error).toBeUndefined();
    });

    test("accepts a QUARTER period", () => {
      const result = periodSchema.validate({
        periodType: "QUARTER",
        year: 2026,
        quarter: 4,
      });

      expect(result.error).toBeUndefined();
    });

    test("accepts a YEAR period", () => {
      const result = periodSchema.validate({
        periodType: "YEAR",
        year: 2026,
      });

      expect(result.error).toBeUndefined();
    });

    test("accepts comparison dates", () => {
      const result = periodSchema.validate({
        ...query,
        compareFrom: "2026-09-01",
        compareTo: "2026-09-30",
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects missing period selection", () => {
      const result = periodSchema.validate({});

      expect(result.error.message).toContain(
        "Specify either from/to or periodType/year",
      );
    });

    test("rejects incomplete date range", () => {
      const result = periodSchema.validate({
        from: "2026-10-01",
      });

      expect(result.error).toBeDefined();
    });

    test("rejects incomplete period selection", () => {
      const result = periodSchema.validate({
        periodType: "MONTH",
      });

      expect(result.error).toBeDefined();
    });

    test("rejects using date range and period type together", () => {
      const result = periodSchema.validate({
        ...query,
        periodType: "YEAR",
        year: 2026,
      });

      expect(result.error.message).toContain(
        "Specify either from/to or periodType/year",
      );
    });

    test("rejects invalid date format", () => {
      const result = periodSchema.validate({
        from: "01-10-2026",
        to: "2026-10-31",
      });

      expect(result.error.message).toContain(
        "Date must use YYYY-MM-DD format",
      );
    });

    test("rejects invalid calendar date", () => {
      const result = periodSchema.validate({
        from: "2026-02-30",
        to: "2026-03-31",
      });

      expect(result.error.message).toContain(
        "Date must be a valid calendar date",
      );
    });

    test("rejects reversed date range", () => {
      const result = periodSchema.validate({
        from: "2026-10-31",
        to: "2026-10-01",
      });

      expect(result.error.message).toContain(
        "from must not be later than to",
      );
    });

    test("rejects invalid period type", () => {
      const result = periodSchema.validate({
        periodType: "WEEK",
        year: 2026,
      });

      expect(result.error).toBeDefined();
    });

    test("rejects year below minimum", () => {
      const result = periodSchema.validate({
        periodType: "YEAR",
        year: 1999,
      });

      expect(result.error).toBeDefined();
    });

    test("rejects year above maximum", () => {
      const result = periodSchema.validate({
        periodType: "YEAR",
        year: 2101,
      });

      expect(result.error).toBeDefined();
    });

    test("rejects MONTH period without month", () => {
      const result = periodSchema.validate({
        periodType: "MONTH",
        year: 2026,
      });

      expect(result.error.message).toContain(
        "month is required for MONTH reports",
      );
    });

    test("rejects invalid month", () => {
      const result = periodSchema.validate({
        periodType: "MONTH",
        year: 2026,
        month: 13,
      });

      expect(result.error).toBeDefined();
    });

    test("rejects month for YEAR period", () => {
      const result = periodSchema.validate({
        periodType: "YEAR",
        year: 2026,
        month: 10,
      });

      expect(result.error.message).toContain(
        "month is only allowed for MONTH reports",
      );
    });

    test("rejects QUARTER period without quarter", () => {
      const result = periodSchema.validate({
        periodType: "QUARTER",
        year: 2026,
      });

      expect(result.error.message).toContain(
        "quarter is required for QUARTER reports",
      );
    });

    test("rejects invalid quarter", () => {
      const result = periodSchema.validate({
        periodType: "QUARTER",
        year: 2026,
        quarter: 5,
      });

      expect(result.error).toBeDefined();
    });

    test("rejects quarter for YEAR period", () => {
      const result = periodSchema.validate({
        periodType: "YEAR",
        year: 2026,
        quarter: 2,
      });

      expect(result.error.message).toContain(
        "quarter is only allowed for QUARTER reports",
      );
    });

    test("rejects incomplete comparison period", () => {
      const result = periodSchema.validate({
        ...query,
        compareFrom: "2026-09-01",
      });

      expect(result.error.message).toContain(
        "compareFrom and compareTo must be provided together",
      );
    });

    test("rejects reversed comparison period", () => {
      const result = periodSchema.validate({
        ...query,
        compareFrom: "2026-09-30",
        compareTo: "2026-09-01",
      });

      expect(result.error.message).toContain(
        "compareFrom must not be later than compareTo",
      );
    });
  });

  describe("attendanceReportSchema", () => {
    test("accepts a valid group ID", () => {
      const result = attendanceReportSchema.validate({
        ...query,
        groupId: "507f1f77bcf86cd799439011",
      });

      expect(result.error).toBeUndefined();
    });

    test("accepts a period without group ID", () => {
      const result = attendanceReportSchema.validate(query);

      expect(result.error).toBeUndefined();
    });

    test("rejects an invalid group ID", () => {
      const result = attendanceReportSchema.validate({
        ...query,
        groupId: "invalid-id",
      });

      expect(result.error).toBeDefined();
    });
  });
});

describe("Analytics service", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    prisma.invoice.findMany.mockResolvedValue([]);
    prisma.paymentAllocation.findMany.mockResolvedValue([]);
    prisma.expense.findMany.mockResolvedValue([]);
    prisma.salaryCalculation.findMany.mockResolvedValue([]);
    prisma.attendance.findMany.mockResolvedValue([]);
    prisma.group.findMany.mockResolvedValue([]);
    prisma.groupEnrollment.findMany.mockResolvedValue([]);
    prisma.staffAssignment.findMany.mockResolvedValue([]);

    getInvoicePaidAmount.mockResolvedValue(0n);
  });

  describe("getSummary", () => {
    test("returns a summary with zero values when there are no records", async () => {
      const result = await service.getSummary(query);

      expect(result.period).toEqual(query);

      expect(result.invoices).toEqual({
        count: 0,
        paidCount: 0,
        unpaidCount: 0,
        accruedAmount: "0",
        outstandingBalance: "0",
      });

      expect(result.income.accrued).toBe("0");
      expect(result.income.received).toBe("0");
      expect(result.expenses.total).toBe("0");

      expect(result.profitability).toEqual({
        operatingProfit: "0",
        usedRooms: 0,
        imputedRoomCostPerMonth: "50000",
        modelProfit: "0",
      });

      expect(result.payments).toEqual({
        count: 0,
        allocatedTransactions: 0,
      });

      expect(result.attendance).toEqual({
        total: 0,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
      });

      expect(result.currency).toBe("UAH");
    });

    test("calculates accrued income and expenses", async () => {
      prisma.invoice.findMany.mockResolvedValueOnce([
        {
          id: "invoice-1",
          type: "MONTHLY",
          status: "PAID",
          periodYear: 2026,
          periodMonth: 10,
          amountDue: 1000n,
          lines: [
            {
              amount: 1000n,
              description: "Навчання",
            },
          ],
        },
      ]);

      prisma.expense.findMany.mockResolvedValue([
        {
          amount: 200n,
          category: "FOOD",
        },
      ]);

      const result = await service.getSummary(query);

      expect(result.invoices.count).toBe(1);
      expect(result.invoices.paidCount).toBe(1);
      expect(result.invoices.accruedAmount).toBe("1000");
      expect(result.income.accruedByCategory.TUITION).toBe("1000");
      expect(result.expenses.total).toBe("200");
      expect(result.profitability.operatingProfit).toBe("800");
    });

    test("counts unpaid invoices", async () => {
      prisma.invoice.findMany.mockResolvedValueOnce([
        {
          id: "invoice-1",
          type: "MONTHLY",
          status: "ISSUED",
          periodYear: 2026,
          periodMonth: 10,
          amountDue: 1000n,
          lines: [{ amount: 1000n, description: "Навчання" }],
        },
        {
          id: "invoice-2",
          type: "MONTHLY",
          status: "PARTIALLY_PAID",
          periodYear: 2026,
          periodMonth: 10,
          amountDue: 2000n,
          lines: [{ amount: 2000n, description: "Навчання" }],
        },
      ]);

      const result = await service.getSummary(query);

      expect(result.invoices.unpaidCount).toBe(2);
      expect(result.invoices.count).toBe(2);
    });

    test("counts attendance statuses", async () => {
      prisma.attendance.findMany.mockResolvedValue([
        { status: "PRESENT" },
        { status: "PRESENT" },
        { status: "ABSENT" },
        { status: "LATE" },
        { status: "EXCUSED" },
      ]);

      const result = await service.getSummary(query);

      expect(result.attendance).toEqual({
        total: 5,
        present: 2,
        absent: 1,
        late: 1,
        excused: 1,
      });
    });

    test("calculates room cost for active groups", async () => {
      prisma.group.findMany.mockResolvedValue([
        { id: "group-1", mainRoomId: "room-1" },
        { id: "group-2", mainRoomId: "room-1" },
        { id: "group-3", mainRoomId: "room-2" },
      ]);

      const result = await service.getSummary(query);

      expect(result.profitability.usedRooms).toBe(2);
      expect(result.profitability.imputedRoomCostPerMonth).toBe("50000");
      expect(result.profitability.modelProfit).toBe("-100000");
    });

    test("rejects invalid dates", async () => {
      await expect(
        service.getSummary({
          from: "2026-02-30",
          to: "2026-03-31",
        }),
      ).rejects.toThrow("Invalid date. Expected YYYY-MM-DD");

      expect(prisma.invoice.findMany).not.toHaveBeenCalled();
    });

    test("rejects a reversed period", async () => {
      await expect(
        service.getSummary({
          from: "2026-10-31",
          to: "2026-10-01",
        }),
      ).rejects.toThrow("Period start must not be after period end");
    });

    test("accepts a monthly period", async () => {
      const result = await service.getSummary({
        periodType: "MONTH",
        year: 2026,
        month: 10,
      });

      expect(result.period).toEqual({
        from: "2026-10-01",
        to: "2026-10-31",
      });
    });

    test("accepts a quarterly period", async () => {
      const result = await service.getSummary({
        periodType: "QUARTER",
        year: 2026,
        quarter: 4,
      });

      expect(result.period).toEqual({
        from: "2026-10-01",
        to: "2026-12-31",
      });
    });

    test("accepts a yearly period", async () => {
      const result = await service.getSummary({
        periodType: "YEAR",
        year: 2026,
      });

      expect(result.period).toEqual({
        from: "2026-01-01",
        to: "2026-12-31",
      });
    });

    test("calculates comparison changes", async () => {
      const result = await service.getSummary({
        ...query,
        compareFrom: "2026-09-01",
        compareTo: "2026-09-30",
      });

      expect(result.comparison).not.toBeNull();
      expect(result.changes.invoices.count).toBe(0);
      expect(result.changes.income.accrued).toBe("0");
      expect(result.changes.expenses.total).toBe("0");
    });
  });

  describe("getIncomeReport", () => {
    test("returns zero income when there are no records", async () => {
      const result = await service.getIncomeReport(query);

      expect(result.period).toEqual(query);
      expect(result.accrued.total).toBe("0");
      expect(result.received.total).toBe("0");
      expect(result.received.paymentCount).toBe(0);
      expect(result.currency).toBe("UAH");
    });

    test("classifies tuition, meals and other income", async () => {
      prisma.invoice.findMany.mockResolvedValue([
        {
          id: "invoice-1",
          type: "MONTHLY",
          periodYear: 2026,
          periodMonth: 10,
          lines: [
            { amount: 1000n, description: "Навчання" },
            { amount: 500n, description: "Харчування" },
            { amount: 200n, description: "Інше" },
          ],
        },
      ]);

      const result = await service.getIncomeReport(query);

      expect(result.accrued.total).toBe("1700");
      expect(result.accrued.byCategory).toEqual({
        TUITION: "1000",
        MEALS: "500",
        OTHER: "200",
      });
      expect(result.accrued.byMonth["2026-10"]).toEqual({
        TUITION: "1000",
        MEALS: "500",
        OTHER: "200",
      });
    });

    test("calculates received income from payment allocations", async () => {
      prisma.paymentAllocation.findMany.mockResolvedValue([
        {
          amount: 1500n,
          paymentId: "payment-1",
          invoice: {
            lines: [{ amount: 1500n, description: "Навчання" }],
          },
        },
        {
          amount: 500n,
          paymentId: "payment-2",
          invoice: {
            lines: [{ amount: 500n, description: "Харчування" }],
          },
        },
      ]);

      const result = await service.getIncomeReport(query);

      expect(result.received.total).toBe("2000");
      expect(result.received.byCategory).toEqual({
        TUITION: "1500",
        MEALS: "500",
        OTHER: "0",
      });
      expect(result.received.paymentCount).toBe(2);
    });

    test("counts unique payments when several allocations belong to one payment", async () => {
      prisma.paymentAllocation.findMany.mockResolvedValue([
        {
          amount: 500n,
          paymentId: "payment-1",
          invoice: { lines: [{ amount: 500n, description: "Навчання" }] },
        },
        {
          amount: 300n,
          paymentId: "payment-1",
          invoice: { lines: [{ amount: 300n, description: "Харчування" }] },
        },
      ]);

      const result = await service.getIncomeReport(query);

      expect(result.received.paymentCount).toBe(1);
      expect(result.received.total).toBe("800");
    });

    test("returns a comparison report", async () => {
      const result = await service.getIncomeReport({
        ...query,
        compareFrom: "2026-09-01",
        compareTo: "2026-09-30",
      });

      expect(result.comparison).not.toBeNull();
      expect(result.comparison.period).toEqual({
        from: "2026-09-01",
        to: "2026-09-30",
      });
    });
  });

  describe("getExpensesReport", () => {
    test("returns zero expenses when there are no records", async () => {
      const result = await service.getExpensesReport(query);

      expect(result.total).toBe("0");
      expect(result.salaries).toBe("0");
      expect(result.operational).toBe("0");
      expect(result.records).toEqual({
        salaryCalculations: 0,
        operationalExpenses: 0,
      });
    });

    test("calculates salaries and operational expenses", async () => {
      prisma.expense.findMany.mockResolvedValue([
        { amount: 1000n, category: "FOOD" },
        { amount: 500n, category: "UTILITIES" },
      ]);

      prisma.salaryCalculation.findMany.mockResolvedValue([
        { totalAmount: 3000n },
        { totalAmount: 2000n },
      ]);

      const result = await service.getExpensesReport(query);

      expect(result.total).toBe("6500");
      expect(result.salaries).toBe("5000");
      expect(result.operational).toBe("1500");
      expect(result.byCategory).toEqual({
        SALARIES: "5000",
        FOOD: "1000",
        UTILITIES: "500",
        SUPPLIES: "0",
        MAINTENANCE: "0",
        OTHER: "0",
      });
      expect(result.records).toEqual({
        salaryCalculations: 2,
        operationalExpenses: 2,
      });
    });

    test("returns comparison expenses", async () => {
      const result = await service.getExpensesReport({
        ...query,
        compareFrom: "2026-09-01",
        compareTo: "2026-09-30",
      });

      expect(result.comparison).not.toBeNull();
      expect(result.comparison.total).toBe("0");
    });
  });

  describe("getDebtsReport", () => {
    test("returns an empty debts report", async () => {
      const result = await service.getDebtsReport(query);

      expect(result.parentCount).toBe(0);
      expect(result.invoiceCount).toBe(0);
      expect(result.totalOutstanding).toBe("0");
      expect(result.totalAvailableCredit).toBe("0");
      expect(result.netOutstanding).toBe("0");
      expect(result.parents).toEqual([]);
    });

    test("groups outstanding invoices by payer", async () => {
      prisma.invoice.findMany.mockResolvedValue([
        {
          id: "invoice-1",
          payerId: "parent-1",
          childId: "child-1",
          periodYear: 2026,
          periodMonth: 10,
          status: "ISSUED",
          amountDue: 1000n,
          payer: {
            id: "parent-1",
            firstName: "Іван",
            lastName: "Іваненко",
            phone: "000000000",
            email: "parent@example.com",
          },
        },
      ]);

      const result = await service.getDebtsReport(query);

      expect(result.parentCount).toBe(1);
      expect(result.invoiceCount).toBe(1);
      expect(result.totalOutstanding).toBe("1000");
      expect(result.netOutstanding).toBe("1000");
      expect(result.parents[0]).toMatchObject({
        id: "parent-1",
        invoiceCount: 1,
        outstanding: "1000",
        availableCredit: "0",
        netOutstanding: "1000",
      });
      expect(result.parents[0].invoices[0].invoiceId).toBe("invoice-1");
    });

    test("uses the paid amount when calculating outstanding balance", async () => {
      prisma.invoice.findMany.mockResolvedValue([
        {
          id: "invoice-1",
          payerId: "parent-1",
          childId: "child-1",
          periodYear: 2026,
          periodMonth: 10,
          status: "PARTIALLY_PAID",
          amountDue: 1000n,
          payer: {
            id: "parent-1",
            firstName: "Іван",
            lastName: "Іваненко",
          },
        },
      ]);

      getInvoicePaidAmount.mockResolvedValue(400n);

      const result = await service.getDebtsReport(query);

      expect(getInvoicePaidAmount).toHaveBeenCalled();
      expect(result.totalOutstanding).toBe("600");
      expect(result.netOutstanding).toBe("600");
      expect(result.parents[0].invoices[0].paidAmount).toBe("400");
    });

    test("does not include invoices without outstanding balance", async () => {
      prisma.invoice.findMany.mockResolvedValue([
        {
          id: "invoice-1",
          payerId: "parent-1",
          childId: "child-1",
          periodYear: 2026,
          periodMonth: 10,
          status: "PAID",
          amountDue: 1000n,
          payer: {
            id: "parent-1",
            firstName: "Іван",
            lastName: "Іваненко",
          },
        },
      ]);

      getInvoicePaidAmount.mockResolvedValue(1000n);

      const result = await service.getDebtsReport(query);

      expect(result.parentCount).toBe(0);
      expect(result.invoiceCount).toBe(0);
      expect(result.totalOutstanding).toBe("0");
    });
  });

  describe("getProfitabilityReport", () => {
    test("returns zero profitability when there are no records", async () => {
      const result = await service.getProfitabilityReport(query);

      expect(result.revenue).toBe("0");
      expect(result.actualExpenses).toBe("0");
      expect(result.operatingProfit).toBe("0");
      expect(result.model).toEqual({
        usedRooms: 0,
        roomCostPerRoomPerMonth: "50000",
        totalImputedRoomCost: "0",
        modelProfit: "0",
      });
    });

    test("calculates operating and model profit", async () => {
      prisma.invoice.findMany.mockResolvedValue([
        {
          id: "invoice-1",
          type: "MONTHLY",
          periodYear: 2026,
          periodMonth: 10,
          lines: [{ amount: 10000n, description: "Навчання" }],
        },
      ]);

      prisma.expense.findMany.mockResolvedValue([
        { amount: 2000n, category: "FOOD" },
      ]);

      prisma.group.findMany.mockResolvedValue([
        { id: "group-1", name: "Група 1", mainRoomId: "room-1" },
      ]);

      const result = await service.getProfitabilityReport(query);

      expect(result.revenue).toBe("10000");
      expect(result.actualExpenses).toBe("2000");
      expect(result.operatingProfit).toBe("8000");
      expect(result.model.usedRooms).toBe(1);
      expect(result.model.totalImputedRoomCost).toBe("50000");
      expect(result.model.modelProfit).toBe("-42000");
    });

    test("returns comparison profitability", async () => {
      const result = await service.getProfitabilityReport({
        ...query,
        compareFrom: "2026-09-01",
        compareTo: "2026-09-30",
      });

      expect(result.comparison).not.toBeNull();
      expect(result.comparison.revenue).toBe("0");
    });
  });

  describe("getGroupReport", () => {
    test("returns an empty groups report", async () => {
      const result = await service.getGroupReport(query);

      expect(result.period).toEqual(query);
      expect(result.groups).toEqual([]);
      expect(result.currency).toBe("UAH");
      expect(prisma.staffAssignment.findMany).toHaveBeenCalled();
    });

    test("includes groups from the database", async () => {
      prisma.group.findMany.mockResolvedValue([
        {
          id: "group-1",
          name: "Молодша група",
          mainRoomId: "room-1",
        },
      ]);

      const result = await service.getGroupReport(query);

      expect(result.groups).toEqual([]);
      expect(prisma.group.findMany).toHaveBeenCalled();
    });

    test("returns a comparison group report", async () => {
      const result = await service.getGroupReport({
        ...query,
        compareFrom: "2026-09-01",
        compareTo: "2026-09-30",
      });

      expect(result.comparison).not.toBeNull();
      expect(result.comparison.groups).toEqual([]);
    });
  });

  describe("getAttendanceReport", () => {
    test("returns an empty attendance report", async () => {
      const result = await service.getAttendanceReport(query);

      expect(result.period).toEqual(query);
      expect(result.summary).toEqual({
        total: 0,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
      });
      expect(result.groups).toEqual([]);
    });

    test("groups attendance records by group", async () => {
      prisma.attendance.findMany.mockResolvedValue([
        {
          date: new Date("2026-10-10T00:00:00.000Z"),
          status: "PRESENT",
          child: {
            enrollments: [
              {
                startDate: new Date("2026-09-01T00:00:00.000Z"),
                endDate: null,
                group: {
                  id: "group-1",
                  name: "Молодша група",
                },
              },
            ],
          },
        },
        {
          date: new Date("2026-10-11T00:00:00.000Z"),
          status: "ABSENT",
          child: {
            enrollments: [
              {
                startDate: new Date("2026-09-01T00:00:00.000Z"),
                endDate: null,
                group: {
                  id: "group-1",
                  name: "Молодша група",
                },
              },
            ],
          },
        },
      ]);

      const result = await service.getAttendanceReport(query);

      expect(result.summary).toEqual({
        total: 2,
        present: 1,
        absent: 1,
        late: 0,
        excused: 0,
      });

      expect(result.groups).toEqual([
        {
          groupId: "group-1",
          groupName: "Молодша група",
          total: 2,
          present: 1,
          absent: 1,
          late: 0,
          excused: 0,
        },
      ]);
    });

    test("filters attendance by group ID", async () => {
      prisma.attendance.findMany.mockResolvedValue([
        {
          date: new Date("2026-10-10T00:00:00.000Z"),
          status: "PRESENT",
          child: {
            enrollments: [
              {
                startDate: new Date("2026-09-01T00:00:00.000Z"),
                endDate: null,
                group: {
                  id: "group-1",
                  name: "Молодша група",
                },
              },
            ],
          },
        },
        {
          date: new Date("2026-10-10T00:00:00.000Z"),
          status: "ABSENT",
          child: {
            enrollments: [
              {
                startDate: new Date("2026-09-01T00:00:00.000Z"),
                endDate: null,
                group: {
                  id: "group-2",
                  name: "Старша група",
                },
              },
            ],
          },
        },
      ]);

      const result = await service.getAttendanceReport({
        ...query,
        groupId: "group-1",
      });

      expect(result.summary.total).toBe(1);
      expect(result.summary.present).toBe(1);
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].groupId).toBe("group-1");

      expect(prisma.attendance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { date: "asc" },
        }),
      );
    });

    test("places records without an active group into WITHOUT_GROUP", async () => {
      prisma.attendance.findMany.mockResolvedValue([
        {
          date: new Date("2026-10-10T00:00:00.000Z"),
          status: "LATE",
          child: {
            enrollments: [],
          },
        },
      ]);

      const result = await service.getAttendanceReport(query);

      expect(result.groups[0]).toMatchObject({
        groupId: "WITHOUT_GROUP",
        groupName: "Без групи",
        total: 1,
        late: 1,
      });
    });
  });
});

describe("Analytics controller", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const methods = [
    ["getSummary", "getSummary"],
    ["getIncomeReport", "getIncomeReport"],
    ["getExpensesReport", "getExpensesReport"],
    ["getDebtsReport", "getDebtsReport"],
    ["getProfitabilityReport", "getProfitabilityReport"],
    ["getGroupReport", "getGroupReport"],
    ["getAttendanceReport", "getAttendanceReport"],
  ];

  test.each(methods)(
    "%s calls the service and sends a successful response",
    async (controllerMethod, serviceMethod) => {
      const expectedData = { result: "test" };
      const serviceSpy = jest
        .spyOn(service, serviceMethod)
        .mockResolvedValue(expectedData);

      const req = {};
      const res = createResponse();

      await controller[controllerMethod](req, res);

      expect(serviceSpy).toHaveBeenCalledWith(query);
      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expectedData,
      });
    },
  );
});

describe("Analytics routes", () => {
  test("registers all analytics endpoints", () => {
    const router = require("../../src/modules/analytics/analytics.routes");

    const routes = router.stack
      .filter((layer) => layer.route)
      .map((layer) => ({
        path: layer.route.path,
        method: Object.keys(layer.route.methods)[0],
      }));

    expect(routes).toEqual([
      { path: "/summary", method: "get" },
      { path: "/income", method: "get" },
      { path: "/expenses", method: "get" },
      { path: "/debts", method: "get" },
      { path: "/profitability", method: "get" },
      { path: "/groups", method: "get" },
      { path: "/attendance", method: "get" },
    ]);
  });
});
