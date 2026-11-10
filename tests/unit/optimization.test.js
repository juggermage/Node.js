
jest.mock("../../src/config/prisma", () => ({
  invoice: { findMany: jest.fn() },
  payment: { findMany: jest.fn() },
  salaryCalculation: { findMany: jest.fn() },
  expense: { findMany: jest.fn() },
  groupEnrollment: { findMany: jest.fn() },
  employee: { findMany: jest.fn() },
  schedule: { findMany: jest.fn() },
  child: { findMany: jest.fn() },
  group: { findMany: jest.fn() },
  scheduleItem: { findMany: jest.fn() },
  room: { findMany: jest.fn() }
}));

jest.mock("../../src/middleware/auth.middleware", () =>
  jest.fn((req, res, next) => next())
);

jest.mock("../../src/middleware/rbac.middleware", () =>
  jest.fn(() => (req, res, next) => next())
);

jest.mock("../../src/middleware/validate.middleware", () =>
  jest.fn((schema, property) => {
    const middleware = (req, res, next) => next();
    middleware.validationSchema = schema;
    middleware.validationProperty = property;
    return middleware;
  })
);

const prisma = require("../../src/config/prisma");
const service = require("../../src/modules/optimization/optimization.service");
const controller = require("../../src/modules/optimization/optimization.controller");
const {
  periodSchema,
  compareScenariosSchema
} = require("../../src/modules/optimization/optimization.validation");

const router = require("../../src/modules/optimization/optimization.routes");

const FROM = "2026-01-01";
const TO = "2026-01-31";

const validScenario = {
  name: "Оптимальний сценарій",
  children: 10,
  groups: 2,
  employees: 4,
  rooms: 2
};

function mockEmptyDatabase() {
  Object.values(prisma).forEach((model) => {
    Object.values(model).forEach((method) => {
      method.mockReset();
    });
  });

  prisma.invoice.findMany.mockResolvedValue([]);
  prisma.payment.findMany.mockResolvedValue([]);
  prisma.salaryCalculation.findMany.mockResolvedValue([]);
  prisma.expense.findMany.mockResolvedValue([]);

  prisma.groupEnrollment.findMany.mockResolvedValue([]);
  prisma.employee.findMany.mockResolvedValue([]);
  prisma.schedule.findMany.mockResolvedValue([]);

  prisma.child.findMany.mockResolvedValue([]);
  prisma.group.findMany.mockResolvedValue([]);
  prisma.scheduleItem.findMany.mockResolvedValue([]);
  prisma.room.findMany.mockResolvedValue([]);
}

function mockDatabaseWithResources() {
  prisma.groupEnrollment.findMany.mockResolvedValue([
    { childId: "child-1", groupId: "group-1" },
    { childId: "child-2", groupId: "group-1" }
  ]);

  prisma.employee.findMany.mockResolvedValue([
    { id: "employee-1" },
    { id: "employee-2" }
  ]);

  prisma.schedule.findMany.mockResolvedValue([
    { id: "schedule-1", groupId: "group-1" }
  ]);

  prisma.child.findMany.mockResolvedValue([
    { id: "child-1" },
    { id: "child-2" }
  ]);

  prisma.group.findMany.mockResolvedValue([
    { id: "group-1" }
  ]);

  prisma.scheduleItem.findMany.mockResolvedValue([
    { roomId: "room-1", teacherId: "teacher-1" },
    { roomId: "room-1", teacherId: "teacher-2" }
  ]);

  prisma.room.findMany.mockResolvedValue([
    { id: "room-1", capacity: 20 }
  ]);
}

function mockFinancialData() {
  prisma.invoice.findMany.mockResolvedValue([
    {
      amountDue: 1500n,
      lines: [
        { description: "Навчання за місяць", amount: 1000n },
        { description: "Харчування за місяць", amount: 500n }
      ]
    }
  ]);

  prisma.payment.findMany.mockResolvedValue([
    {
      amount: 1500n,
      allocations: [
        {
          amount: 1500n,
          invoice: {
            amountDue: 1500n,
            lines: [
              { description: "Навчання за місяць", amount: 1000n },
              { description: "Харчування за місяць", amount: 500n }
            ]
          }
        }
      ]
    }
  ]);

  prisma.salaryCalculation.findMany.mockResolvedValue([
    { totalAmount: 200n }
  ]);

  prisma.expense.findMany.mockResolvedValue([
    { amount: 100n, category: "FOOD" },
    { amount: 50n, category: "UTILITIES" }
  ]);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEmptyDatabase();
});

describe("Optimization Validation", () => {
  describe("periodSchema", () => {
    test("should accept a valid period", () => {
      const result = periodSchema.validate({
        from: FROM,
        to: TO
      });

      expect(result.error).toBeUndefined();
    });

    test("should reject missing from", () => {
      const result = periodSchema.validate({
        to: TO
      });

      expect(result.error).toBeDefined();
    });

    test("should reject missing to", () => {
      const result = periodSchema.validate({
        from: FROM
      });

      expect(result.error).toBeDefined();
    });

    test("should reject an invalid date format", () => {
      const result = periodSchema.validate({
        from: "01-01-2026",
        to: TO
      });

      expect(result.error).toBeDefined();
    });

    test("should reject an impossible calendar date", () => {
      const result = periodSchema.validate({
        from: "2026-02-30",
        to: TO
      });

      expect(result.error).toBeDefined();
    });

    test("should reject an invalid month", () => {
      const result = periodSchema.validate({
        from: "2026-13-01",
        to: TO
      });

      expect(result.error).toBeDefined();
    });

    test("should reject a period where from is later than to", () => {
      const result = periodSchema.validate({
        from: "2026-02-01",
        to: "2026-01-01"
      });

      expect(result.error).toBeDefined();
      expect(result.error.message).toContain("earlier than or equal to");
    });

    test("should accept the same date for from and to", () => {
      const result = periodSchema.validate({
        from: FROM,
        to: FROM
      });

      expect(result.error).toBeUndefined();
    });
  });

  describe("compareScenariosSchema", () => {
    test("should accept valid scenarios", () => {
      const result = compareScenariosSchema.validate({
        from: FROM,
        to: TO,
        scenarios: [validScenario]
      });

      expect(result.error).toBeUndefined();
    });

    test("should reject missing scenarios", () => {
      const result = compareScenariosSchema.validate({
        from: FROM,
        to: TO
      });

      expect(result.error).toBeDefined();
    });

    test("should reject an empty scenarios array", () => {
      const result = compareScenariosSchema.validate({
        from: FROM,
        to: TO,
        scenarios: []
      });

      expect(result.error).toBeDefined();
    });

    test("should reject more than 20 scenarios", () => {
      const result = compareScenariosSchema.validate({
        from: FROM,
        to: TO,
        scenarios: Array.from({ length: 21 }, (_, index) => ({
          ...validScenario,
          name: `Scenario ${index}`
        }))
      });

      expect(result.error).toBeDefined();
    });

    test("should accept exactly 20 scenarios", () => {
      const result = compareScenariosSchema.validate({
        from: FROM,
        to: TO,
        scenarios: Array.from({ length: 20 }, (_, index) => ({
          ...validScenario,
          name: `Scenario ${index}`
        }))
      });

      expect(result.error).toBeUndefined();
    });

    test("should reject a scenario without a name", () => {
      const result = compareScenariosSchema.validate({
        from: FROM,
        to: TO,
        scenarios: [{ ...validScenario, name: undefined }]
      });

      expect(result.error).toBeDefined();
    });

    test("should reject an empty scenario name", () => {
      const result = compareScenariosSchema.validate({
        from: FROM,
        to: TO,
        scenarios: [{ ...validScenario, name: "   " }]
      });

      expect(result.error).toBeDefined();
    });

    test("should reject a name longer than 100 characters", () => {
      const result = compareScenariosSchema.validate({
        from: FROM,
        to: TO,
        scenarios: [{ ...validScenario, name: "A".repeat(101) }]
      });

      expect(result.error).toBeDefined();
    });

    test("should reject negative children", () => {
      const result = compareScenariosSchema.validate({
        from: FROM,
        to: TO,
        scenarios: [{ ...validScenario, children: -1 }]
      });

      expect(result.error).toBeDefined();
    });

    test("should reject non-integer children", () => {
      const result = compareScenariosSchema.validate({
        from: FROM,
        to: TO,
        scenarios: [{ ...validScenario, children: 10.5 }]
      });

      expect(result.error).toBeDefined();
    });

    test("should reject children greater than 10000", () => {
      const result = compareScenariosSchema.validate({
        from: FROM,
        to: TO,
        scenarios: [{ ...validScenario, children: 10001 }]
      });

      expect(result.error).toBeDefined();
    });

    test("should reject negative groups", () => {
      const result = compareScenariosSchema.validate({
        from: FROM,
        to: TO,
        scenarios: [{ ...validScenario, groups: -1 }]
      });

      expect(result.error).toBeDefined();
    });

    test("should reject groups greater than 1000", () => {
      const result = compareScenariosSchema.validate({
        from: FROM,
        to: TO,
        scenarios: [{ ...validScenario, groups: 1001 }]
      });

      expect(result.error).toBeDefined();
    });

    test("should reject employees greater than 1000", () => {
      const result = compareScenariosSchema.validate({
        from: FROM,
        to: TO,
        scenarios: [{ ...validScenario, employees: 1001 }]
      });

      expect(result.error).toBeDefined();
    });

    test("should reject rooms greater than 1000", () => {
      const result = compareScenariosSchema.validate({
        from: FROM,
        to: TO,
        scenarios: [{ ...validScenario, rooms: 1001 }]
      });

      expect(result.error).toBeDefined();
    });

    test("should reject children without groups", () => {
      const result = compareScenariosSchema.validate({
        from: FROM,
        to: TO,
        scenarios: [{
          ...validScenario,
          children: 10,
          groups: 0
        }]
      });

      expect(result.error).toBeDefined();
      expect(result.error.message).toContain("at least one group");
    });

    test("should reject children without rooms", () => {
      const result = compareScenariosSchema.validate({
        from: FROM,
        to: TO,
        scenarios: [{
          ...validScenario,
          children: 10,
          rooms: 0
        }]
      });

      expect(result.error).toBeDefined();
      expect(result.error.message).toContain("at least one room");
    });

    test("should reject children without employees", () => {
      const result = compareScenariosSchema.validate({
        from: FROM,
        to: TO,
        scenarios: [{
          ...validScenario,
          children: 10,
          employees: 0
        }]
      });

      expect(result.error).toBeDefined();
      expect(result.error.message).toContain("at least one employee");
    });

    test("should accept zero resources when there are no children", () => {
      const result = compareScenariosSchema.validate({
        from: FROM,
        to: TO,
        scenarios: [{
          ...validScenario,
          children: 0,
          groups: 0,
          employees: 0,
          rooms: 0
        }]
      });

      expect(result.error).toBeUndefined();
    });
  });
});

describe("Optimization Controller", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("getReport should call service and return report", async () => {
    const report = { revenue: {}, expenses: {} };

    jest.spyOn(service, "getReport").mockResolvedValue(report);

    const req = {};
    const res = {
      locals: {
        validated: {
          query: { from: FROM, to: TO }
        }
      },
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    await controller.getReport(req, res);

    expect(service.getReport).toHaveBeenCalledWith({
      from: FROM,
      to: TO
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: report
    });
  });

  test("compareScenarios should call service and return comparison", async () => {
    const comparison = { scenarios: [] };

    jest.spyOn(service, "compareScenarios").mockResolvedValue(comparison);

    const body = {
      from: FROM,
      to: TO,
      scenarios: [validScenario]
    };

    const req = {};
    const res = {
      locals: {
        validated: { body }
      },
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    await controller.compareScenarios(req, res);

    expect(service.compareScenarios).toHaveBeenCalledWith(body);
    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: comparison
    });
  });
});

describe("Optimization Routes", () => {
  test("should use authentication middleware", () => {
    const requireAuth = require("../../src/middleware/auth.middleware");

    expect(router.stack.some((layer) => layer.handle === requireAuth)).toBe(true);
  });

  test("should configure ADMIN and MANAGER roles", () => {
    const authorizeRoles = require("../../src/middleware/rbac.middleware");

    expect(authorizeRoles).toHaveBeenCalledWith("ADMIN", "MANAGER");
  });

  test("should register GET / route", () => {
    const route = router.stack.find(
      (layer) => layer.route && layer.route.path === "/"
    );

    expect(route).toBeDefined();
    expect(route.route.methods.get).toBe(true);
  });

  test("should register POST /scenarios route", () => {
    const route = router.stack.find(
      (layer) => layer.route && layer.route.path === "/scenarios"
    );

    expect(route).toBeDefined();
    expect(route.route.methods.post).toBe(true);
  });

  test("GET / should use query validation", () => {
    const route = router.stack.find(
      (layer) => layer.route && layer.route.path === "/"
    );

    const validation = route.route.stack.find(
      (layer) => layer.handle.validationProperty
    );

    expect(validation).toBeDefined();
    expect(validation.handle.validationProperty).toBe("query");
  });

  test("POST /scenarios should use body validation", () => {
    const route = router.stack.find(
      (layer) => layer.route && layer.route.path === "/scenarios"
    );

    const validation = route.route.stack.find(
      (layer) => layer.handle.validationProperty
    );

    expect(validation).toBeDefined();
    expect(validation.handle.validationProperty).toBe("body");
  });
});

describe("Optimization Service", () => {
  describe("getReport", () => {
    test("should return an empty report when there is no data", async () => {
      const result = await service.getReport({
        from: FROM,
        to: TO
      });

      expect(result.period).toEqual({
        from: FROM,
        to: TO
      });

      expect(result.currency).toBe("UAH");
      expect(result.moneyUnit).toBe("kopecks");

      expect(result.revenue.accrued).toEqual({
        tuition: "0",
        meals: "0",
        other: "0",
        total: "0"
      });

      expect(result.revenue.received.total).toBe("0");

      expect(result.expenses.total).toBe("0");

      expect(result.resources).toMatchObject({
        children: 0,
        groups: 0,
        employees: 0,
        rooms: 0,
        roomCapacity: 0,
        scheduledTeachers: 0,
        childrenPerGroup: 0,
        childrenPerRoom: 0
      });

      expect(result.profit.model).toBe("0");
    });

    test("should calculate accrued revenue from invoice lines", async () => {
      prisma.invoice.findMany.mockResolvedValue([
        {
          lines: [
            { description: "Навчання за місяць", amount: 1000n },
            { description: "Харчування за місяць", amount: 500n },
            { description: "Додаткова послуга", amount: 200n }
          ]
        }
      ]);

      const result = await service.getReport({
        from: FROM,
        to: TO
      });

      expect(result.revenue.accrued).toEqual({
        tuition: "1000",
        meals: "500",
        other: "200",
        total: "1700"
      });
    });

    test("should calculate received payments", async () => {
      prisma.payment.findMany.mockResolvedValue([
        {
          amount: 1000n,
          allocations: []
        },
        {
          amount: 500n,
          allocations: []
        }
      ]);

      const result = await service.getReport({
        from: FROM,
        to: TO
      });

      expect(result.revenue.received.total).toBe("1500");
      expect(result.revenue.received.unclassifiedDifference).toBe("1500");
    });

    test("should distribute payments between revenue categories", async () => {
      prisma.payment.findMany.mockResolvedValue([
        {
          amount: 1500n,
          allocations: [
            {
              amount: 1500n,
              invoice: {
                amountDue: 1500n,
                lines: [
                  { description: "Навчання за місяць", amount: 1000n },
                  { description: "Харчування за місяць", amount: 500n }
                ]
              }
            }
          ]
        }
      ]);

      const result = await service.getReport({
        from: FROM,
        to: TO
      });

      expect(result.revenue.received).toEqual({
        tuition: "1000",
        meals: "500",
        other: "0",
        total: "1500",
        unclassifiedDifference: "0"
      });
    });

    test("should classify expenses by category", async () => {
      prisma.expense.findMany.mockResolvedValue([
        { amount: 100n, category: "FOOD" },
        { amount: 200n, category: "UTILITIES" },
        { amount: 300n, category: "REPAIR" }
      ]);

      const result = await service.getReport({
        from: FROM,
        to: TO
      });

      expect(result.expenses.food).toBe("100");
      expect(result.expenses.other).toBe("500");
      expect(result.expenses.total).toBe("600");

      expect(result.expenses.byCategory).toEqual({
        food: "100",
        utilities: "200",
        repair: "300"
      });
    });

    test("should calculate salary expenses", async () => {
      prisma.salaryCalculation.findMany.mockResolvedValue([
        { totalAmount: 1000n },
        { totalAmount: 2000n }
      ]);

      const result = await service.getReport({
        from: FROM,
        to: TO
      });

      expect(result.expenses.salaries).toBe("3000");
    });

    test("should calculate total expenses", async () => {
      prisma.salaryCalculation.findMany.mockResolvedValue([
        { totalAmount: 1000n }
      ]);

      prisma.expense.findMany.mockResolvedValue([
        { amount: 500n, category: "FOOD" },
        { amount: 200n, category: "UTILITIES" }
      ]);

      const result = await service.getReport({
        from: FROM,
        to: TO
      });

      expect(result.expenses).toMatchObject({
        salaries: "1000",
        food: "500",
        other: "200",
        total: "1700"
      });
    });

    test("should calculate operating profit", async () => {
      prisma.payment.findMany.mockResolvedValue([
        {
          amount: 2000n,
          allocations: []
        }
      ]);

      prisma.salaryCalculation.findMany.mockResolvedValue([
        { totalAmount: 500n }
      ]);

      prisma.expense.findMany.mockResolvedValue([
        { amount: 300n, category: "FOOD" },
        { amount: 200n, category: "UTILITIES" }
      ]);

      const result = await service.getReport({
        from: FROM,
        to: TO
      });

      expect(result.profit.actualOperating).toBe("1000");
    });

    test("should calculate resource statistics", async () => {
      mockDatabaseWithResources();

      const result = await service.getReport({
        from: FROM,
        to: TO
      });

      expect(result.resources).toMatchObject({
        children: 2,
        groups: 1,
        employees: 2,
        rooms: 1,
        roomCapacity: 20,
        scheduledTeachers: 2,
        childrenPerGroup: 2,
        childrenPerRoom: 2
      });
    });

    test("should calculate room normative cost", async () => {
      mockDatabaseWithResources();

      const result = await service.getReport({
        from: FROM,
        to: TO
      });

      expect(result.profit.roomNormativeCostPerRoom).toBe("5000000");
      expect(result.profit.totalRoomNormativeCost).toBe("5000000");
    });

    test("should calculate model profit including room costs", async () => {
      mockDatabaseWithResources();
      mockFinancialData();

      const result = await service.getReport({
        from: FROM,
        to: TO
      });

      expect(result.profit.model).toBe("-4998850");
    });

    test("should handle an invalid date", async () => {
      await expect(
        service.getReport({
          from: "2026-02-30",
          to: TO
        })
      ).rejects.toMatchObject({
        code: "INVALID_DATE"
      });
    });

    test("should handle an invalid period", async () => {
      await expect(
        service.getReport({
          from: "2026-02-01",
          to: "2026-01-01"
        })
      ).rejects.toMatchObject({
        code: "INVALID_PERIOD"
      });
    });

    test("should query invoices using the selected period", async () => {
      await service.getReport({
        from: FROM,
        to: TO
      });

      const query = prisma.invoice.findMany.mock.calls[0][0];

      expect(query.where.issuedAt.gte).toEqual(
        new Date(`${FROM}T00:00:00.000Z`)
      );

      expect(query.where.issuedAt.lt).toEqual(
        new Date("2026-02-01T00:00:00.000Z")
      );
    });

    test("should exclude draft and cancelled invoices", async () => {
      await service.getReport({
        from: FROM,
        to: TO
      });

      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: {
              notIn: ["DRAFT", "CANCELLED"]
            }
          })
        })
      );
    });

    test("should select only completed payments", async () => {
      await service.getReport({
        from: FROM,
        to: TO
      });

      expect(prisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: "COMPLETED"
          })
        })
      );
    });
  });

  describe("compareScenarios", () => {
    test("should return comparison for provided scenarios", async () => {
      const result = await service.compareScenarios({
        from: FROM,
        to: TO,
        scenarios: [validScenario]
      });

      expect(result.period).toEqual({
        from: FROM,
        to: TO
      });

      expect(result.currency).toBe("UAH");
      expect(result.moneyUnit).toBe("kopecks");
      expect(result.scenarios).toHaveLength(1);
    });

    test("should return scenario configuration", async () => {
      const result = await service.compareScenarios({
        from: FROM,
        to: TO,
        scenarios: [validScenario]
      });

      expect(result.scenarios[0].configuration).toEqual({
        children: 10,
        groups: 2,
        employees: 4,
        rooms: 2
      });
    });

    test("should calculate children per group", async () => {
      const result = await service.compareScenarios({
        from: FROM,
        to: TO,
        scenarios: [{
          ...validScenario,
          children: 10,
          groups: 2
        }]
      });

      expect(result.scenarios[0].indicators.childrenPerGroup).toBe(5);
    });

    test("should calculate children per room", async () => {
      const result = await service.compareScenarios({
        from: FROM,
        to: TO,
        scenarios: [{
          ...validScenario,
          children: 10,
          rooms: 2
        }]
      });

      expect(result.scenarios[0].indicators.childrenPerRoom).toBe(5);
    });

    test("should calculate employees per group", async () => {
      const result = await service.compareScenarios({
        from: FROM,
        to: TO,
        scenarios: [{
          ...validScenario,
          employees: 6,
          groups: 2
        }]
      });

      expect(result.scenarios[0].indicators.employeesPerGroup).toBe(3);
    });

    test("should return null indicators when there are no groups or rooms", async () => {
      const result = await service.compareScenarios({
        from: FROM,
        to: TO,
        scenarios: [{
          ...validScenario,
          children: 0,
          groups: 0,
          employees: 0,
          rooms: 0
        }]
      });

      expect(result.scenarios[0].indicators).toEqual({
        childrenPerGroup: 0,
        childrenPerRoom: 0,
        employeesPerGroup: null
      });
    });

    test("should calculate scenario room normative cost", async () => {
      const result = await service.compareScenarios({
        from: FROM,
        to: TO,
        scenarios: [{
          ...validScenario,
          children: 0,
          groups: 0,
          employees: 0,
          rooms: 3
        }]
      });

      expect(result.scenarios[0].expenses.roomNormative).toBe("15000000");
    });

    test("should calculate scenario revenue and expenses", async () => {
      mockDatabaseWithResources();
      mockFinancialData();

      const result = await service.compareScenarios({
        from: FROM,
        to: TO,
        scenarios: [{
          name: "Тестовий сценарій",
          children: 4,
          groups: 2,
          employees: 2,
          rooms: 1
        }]
      });

      const scenario = result.scenarios[0];

      expect(scenario.revenue).toEqual({
        tuition: "2000",
        meals: "1000",
        total: "3000"
      });

      expect(scenario.expenses).toEqual({
        food: "200",
        salaries: "200",
        other: "100",
        operating: "500",
        roomNormative: "5000000",
        total: "5000500"
      });
    });

    test("should calculate scenario model profit", async () => {
      mockDatabaseWithResources();
      mockFinancialData();

      const result = await service.compareScenarios({
        from: FROM,
        to: TO,
        scenarios: [{
          name: "Тестовий сценарій",
          children: 4,
          groups: 2,
          employees: 2,
          rooms: 1
        }]
      });

      expect(result.scenarios[0].modelProfit).toBe("-4997500");
    });

    test("should rank scenarios by model profit", async () => {
      const result = await service.compareScenarios({
        from: FROM,
        to: TO,
        scenarios: [
          {
            name: "Менш прибутковий",
            children: 10,
            groups: 2,
            employees: 10,
            rooms: 10
          },
          {
            name: "Більш прибутковий",
            children: 10,
            groups: 2,
            employees: 1,
            rooms: 1
          }
        ]
      });

      expect(result.scenarios[0].name).toBe("Більш прибутковий");
      expect(result.scenarios[0].rank).toBe(1);
      expect(result.scenarios[1].rank).toBe(2);
    });

    test("should include difference from current model", async () => {
      const result = await service.compareScenarios({
        from: FROM,
        to: TO,
        scenarios: [validScenario]
      });

      expect(result.scenarios[0]).toHaveProperty("differenceFromCurrent");
      expect(result.scenarios[0]).toHaveProperty("betterThanCurrent");
    });

    test("should include baseline information", async () => {
      mockDatabaseWithResources();

      const result = await service.compareScenarios({
        from: FROM,
        to: TO,
        scenarios: [validScenario]
      });

      expect(result.baseline).toMatchObject({
        children: 2,
        groups: 1,
        employees: 2,
        rooms: 1,
        roomCapacity: 20
      });

      expect(result.baseline).toHaveProperty("modelProfit");
    });

    test("should return the most profitable scenario without warnings", async () => {
      const result = await service.compareScenarios({
        from: FROM,
        to: TO,
        scenarios: [
          {
            name: "Сценарій 1",
            children: 10,
            groups: 2,
            employees: 4,
            rooms: 2
          },
          {
            name: "Сценарій 2",
            children: 20,
            groups: 4,
            employees: 8,
            rooms: 4
          }
        ]
      });

      expect(result.mostProfitable).not.toBeNull();
      expect(result.mostProfitable.warnings).toEqual([]);
    });

    test("should warn when there are more groups than children", async () => {
      const result = await service.compareScenarios({
        from: FROM,
        to: TO,
        scenarios: [{
          name: "Багато груп",
          children: 1,
          groups: 2,
          employees: 2,
          rooms: 1
        }]
      });

      expect(result.scenarios[0].warnings).toContain(
        "Кількість груп перевищує кількість дітей"
      );
    });

    test("should warn when room capacity is insufficient", async () => {
      mockDatabaseWithResources();

      const result = await service.compareScenarios({
        from: FROM,
        to: TO,
        scenarios: [{
          name: "Недостатньо місць",
          children: 50,
          groups: 2,
          employees: 4,
          rooms: 1
        }]
      });

      expect(result.scenarios[0].warnings).toContain(
        "Кількість дітей перевищує орієнтовну базову місткість приміщень"
      );
    });

    test("should handle an empty scenarios array", async () => {
      const result = await service.compareScenarios({
        from: FROM,
        to: TO,
        scenarios: []
      });

      expect(result.scenarios).toEqual([]);
      expect(result.mostProfitable).toBeNull();
    });

    test("should return null mostProfitable when there are no scenarios", async () => {
      const result = await service.compareScenarios({
        from: FROM,
        to: TO,
        scenarios: []
      });

      expect(result.mostProfitable).toBeNull();
    });

    test("should call getReport data queries before comparing scenarios", async () => {
      await service.compareScenarios({
        from: FROM,
        to: TO,
        scenarios: [validScenario]
      });

      expect(prisma.invoice.findMany).toHaveBeenCalled();
      expect(prisma.payment.findMany).toHaveBeenCalled();
      expect(prisma.salaryCalculation.findMany).toHaveBeenCalled();
      expect(prisma.expense.findMany).toHaveBeenCalled();
    });
  });
});
