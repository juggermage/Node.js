jest.mock("../../src/config/prisma", () => ({
  $transaction: jest.fn(),
  employee: {
    findUnique: jest.fn(),
    findMany: jest.fn()
  },
  salaryRate: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  salaryCalculation: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  groupEnrollment: {
    findMany: jest.fn()
  },
  staffAssignment: {
    findMany: jest.fn()
  }
}));

jest.mock("../../src/modules/audit/audit.service", () => ({
  createLog: jest.fn()
}));

jest.mock("../../src/modules/billing/salaries/salaries.service", () => ({
  getRates: jest.fn(),
  createRate: jest.fn(),
  createCalculations: jest.fn(),
  getCalculations: jest.fn(),
  getCalculationById: jest.fn(),
  cancelCalculation: jest.fn()
}));

jest.mock("../../src/middleware/auth.middleware", () => jest.fn((req, res, next) => next()));

jest.mock("../../src/middleware/rbac.middleware", () => jest.fn(() => (req, res, next) => next()));

jest.mock("../../src/middleware/validate.middleware", () =>
  jest.fn(() => (req, res, next) => next())
);

const prisma = require("../../src/config/prisma");
const auditService = require("../../src/modules/audit/audit.service");
const salariesService = require("../../src/modules/billing/salaries/salaries.service");
const realSalariesService = jest.requireActual(
  "../../src/modules/billing/salaries/salaries.service"
);

const controller = require("../../src/modules/billing/salaries/salaries.controller");
const router = require("../../src/modules/billing/salaries/salaries.routes");
const validation = require("../../src/modules/billing/salaries/salaries.validation");
const HTTP_STATUS = require("../../src/utils/http-status");

const employeeId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const calculationId = "bbbbbbbbbbbbbbbbbbbbbbbb";
const actorId = "user-123";

const user = {
  id: actorId,
  role: "ADMIN"
};

function createResponse() {
  const res = {
    locals: {
      validated: {
        query: {},
        params: {},
        body: {}
      }
    },
    status: jest.fn(),
    json: jest.fn()
  };

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res;
}

function createRate() {
  return {
    id: "rate-1",
    employeeId,
    type: "FIXED",
    baseAmount: 80000n,
    perChildAmount: 0n,
    childThreshold: null,
    extraChildBonusAmount: 0n,
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
    validTo: null,
    employee: {
      id: employeeId,
      role: "MANAGER"
    }
  };
}

function createCalculation() {
  return {
    id: calculationId,
    employeeId,
    periodYear: 2026,
    periodMonth: 1,
    childrenCount: 0,
    baseAmount: 80000n,
    perChildTotal: 0n,
    extraChildrenCount: 0,
    bonusAmount: 0n,
    totalAmount: 80000n,
    status: "DRAFT",
    rateSnapshot: {},
    employee: {
      id: employeeId,
      role: "MANAGER"
    }
  };
}

beforeEach(() => {
  jest.clearAllMocks();

  prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
});

describe("Salaries controller", () => {
  let req;
  let res;

  beforeEach(() => {
    req = { user };
    res = createResponse();
  });

  test("getRates returns rates", async () => {
    const query = { employeeId };
    const result = [createRate()];

    res.locals.validated.query = query;
    salariesService.getRates.mockResolvedValue(result);

    await controller.getRates(req, res);

    expect(salariesService.getRates).toHaveBeenCalledWith(query);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: result
    });
  });

  test("createRate creates a rate", async () => {
    const body = {
      employeeId,
      validFrom: "2026-01-01"
    };
    const result = createRate();

    res.locals.validated.body = body;
    salariesService.createRate.mockResolvedValue(result);

    await controller.createRate(req, res);

    expect(salariesService.createRate).toHaveBeenCalledWith(body, actorId);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: result
    });
  });

  test("createCalculations creates calculations", async () => {
    const body = {
      periodYear: 2026,
      periodMonth: 1
    };
    const result = [createCalculation()];

    res.locals.validated.body = body;
    salariesService.createCalculations.mockResolvedValue(result);

    await controller.createCalculations(req, res);

    expect(salariesService.createCalculations).toHaveBeenCalledWith(body, actorId);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: result
    });
  });

  test("getCalculations returns calculations", async () => {
    const query = { periodYear: 2026, periodMonth: 1 };
    const result = [createCalculation()];

    res.locals.validated.query = query;
    salariesService.getCalculations.mockResolvedValue(result);

    await controller.getCalculations(req, res);

    expect(salariesService.getCalculations).toHaveBeenCalledWith(query);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: result
    });
  });

  test("getCalculationById returns calculation", async () => {
    const result = createCalculation();

    res.locals.validated.params.id = calculationId;
    salariesService.getCalculationById.mockResolvedValue(result);

    await controller.getCalculationById(req, res);

    expect(salariesService.getCalculationById).toHaveBeenCalledWith(calculationId);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: result
    });
  });

  test("cancelCalculation cancels calculation", async () => {
    const result = {
      ...createCalculation(),
      status: "CANCELLED"
    };

    res.locals.validated.params.id = calculationId;
    salariesService.cancelCalculation.mockResolvedValue(result);

    await controller.cancelCalculation(req, res);

    expect(salariesService.cancelCalculation).toHaveBeenCalledWith(calculationId, actorId);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: result
    });
  });
});

describe("Salaries routes", () => {
  test("registers all expected routes", () => {
    const routes = router.stack
      .filter((layer) => layer.route)
      .map((layer) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods)
      }));

    expect(routes).toEqual([
      { path: "/rates", methods: ["get"] },
      { path: "/rates", methods: ["post"] },
      { path: "/calculations", methods: ["get"] },
      { path: "/calculations", methods: ["post"] },
      { path: "/calculations/:id", methods: ["get"] },
      { path: "/calculations/:id/cancel", methods: ["patch"] }
    ]);
  });

  test("uses authentication middleware", () => {
    expect(router.stack[0].handle).toBe(require("../../src/middleware/auth.middleware"));
  });

  test("uses role authorization middleware", () => {
    expect(router.stack[1].handle).toBeDefined();
  });

  test("registers validation and handlers for every route", () => {
    const routes = router.stack.filter((layer) => layer.route);

    expect(routes).toHaveLength(6);

    for (const route of routes) {
      expect(route.route.stack.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("Salaries validation", () => {
  const validId = "aaaaaaaaaaaaaaaaaaaaaaaa";

  describe("createRateSchema", () => {
    test("accepts valid rate", () => {
      const result = validation.createRateSchema.validate({
        employeeId: validId,
        validFrom: "2026-01-01",
        validTo: "2026-12-31"
      });

      expect(result.error).toBeUndefined();
    });

    test("accepts rate without validTo", () => {
      const result = validation.createRateSchema.validate({
        employeeId: validId,
        validFrom: "2026-01-01"
      });

      expect(result.error).toBeUndefined();
    });

    test("accepts null validTo", () => {
      const result = validation.createRateSchema.validate({
        employeeId: validId,
        validFrom: "2026-01-01",
        validTo: null
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects invalid employeeId", () => {
      const result = validation.createRateSchema.validate({
        employeeId: "invalid",
        validFrom: "2026-01-01"
      });

      expect(result.error).toBeDefined();
    });

    test("requires employeeId", () => {
      const result = validation.createRateSchema.validate({
        validFrom: "2026-01-01"
      });

      expect(result.error).toBeDefined();
    });

    test("requires validFrom", () => {
      const result = validation.createRateSchema.validate({
        employeeId: validId
      });

      expect(result.error).toBeDefined();
    });

    test("rejects invalid date", () => {
      const result = validation.createRateSchema.validate({
        employeeId: validId,
        validFrom: "not-a-date"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects validTo earlier than validFrom", () => {
      const result = validation.createRateSchema.validate({
        employeeId: validId,
        validFrom: "2026-12-31",
        validTo: "2026-01-01"
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("createCalculationSchema", () => {
    test("accepts valid calculation data", () => {
      const result = validation.createCalculationSchema.validate({
        periodYear: 2026,
        periodMonth: 5,
        employeeId: validId
      });

      expect(result.error).toBeUndefined();
    });

    test("accepts calculation without employeeId", () => {
      const result = validation.createCalculationSchema.validate({
        periodYear: 2026,
        periodMonth: 5
      });

      expect(result.error).toBeUndefined();
    });

    test("requires periodYear", () => {
      const result = validation.createCalculationSchema.validate({
        periodMonth: 5
      });

      expect(result.error).toBeDefined();
    });

    test("requires periodMonth", () => {
      const result = validation.createCalculationSchema.validate({
        periodYear: 2026
      });

      expect(result.error).toBeDefined();
    });

    test.each([1999, 2101, 2026.5])("rejects invalid periodYear: %s", (periodYear) => {
      const result = validation.createCalculationSchema.validate({
        periodYear,
        periodMonth: 5
      });

      expect(result.error).toBeDefined();
    });

    test.each([0, 13, 2.5])("rejects invalid periodMonth: %s", (periodMonth) => {
      const result = validation.createCalculationSchema.validate({
        periodYear: 2026,
        periodMonth
      });

      expect(result.error).toBeDefined();
    });

    test("rejects invalid employeeId", () => {
      const result = validation.createCalculationSchema.validate({
        periodYear: 2026,
        periodMonth: 5,
        employeeId: "invalid"
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("listRatesSchema", () => {
    test("accepts valid employeeId", () => {
      const result = validation.listRatesSchema.validate({
        employeeId: validId
      });

      expect(result.error).toBeUndefined();
    });

    test("accepts empty query", () => {
      const result = validation.listRatesSchema.validate({});

      expect(result.error).toBeUndefined();
    });

    test("rejects invalid employeeId", () => {
      const result = validation.listRatesSchema.validate({
        employeeId: "invalid"
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("listCalculationsSchema", () => {
    test("accepts valid filters", () => {
      const result = validation.listCalculationsSchema.validate({
        employeeId: validId,
        periodYear: 2026,
        periodMonth: 5,
        status: "DRAFT"
      });

      expect(result.error).toBeUndefined();
    });

    test("accepts empty query", () => {
      const result = validation.listCalculationsSchema.validate({});

      expect(result.error).toBeUndefined();
    });

    test("rejects invalid employeeId", () => {
      const result = validation.listCalculationsSchema.validate({
        employeeId: "invalid"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects invalid status", () => {
      const result = validation.listCalculationsSchema.validate({
        status: "INVALID"
      });

      expect(result.error).toBeDefined();
    });

    test.each(["DRAFT", "APPROVED", "PAID", "CANCELLED"])("accepts status %s", (status) => {
      const result = validation.listCalculationsSchema.validate({
        status
      });

      expect(result.error).toBeUndefined();
    });

    test("requires periodYear when periodMonth is provided", () => {
      const result = validation.listCalculationsSchema.validate({
        periodMonth: 5
      });

      expect(result.error).toBeDefined();
    });

    test("requires periodMonth when periodYear is provided", () => {
      const result = validation.listCalculationsSchema.validate({
        periodYear: 2026
      });

      expect(result.error).toBeDefined();
    });

    test("rejects month outside valid range", () => {
      const result = validation.listCalculationsSchema.validate({
        periodYear: 2026,
        periodMonth: 13
      });

      expect(result.error).toBeDefined();
    });

    test("rejects year outside valid range", () => {
      const result = validation.listCalculationsSchema.validate({
        periodYear: 1999,
        periodMonth: 5
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("idParamsSchema", () => {
    test("accepts valid id", () => {
      const result = validation.idParamsSchema.validate({
        id: validId
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects invalid id", () => {
      const result = validation.idParamsSchema.validate({
        id: "invalid"
      });

      expect(result.error).toBeDefined();
    });

    test("requires id", () => {
      const result = validation.idParamsSchema.validate({});

      expect(result.error).toBeDefined();
    });
  });
});

describe("Salaries service", () => {
  beforeEach(() => {
    prisma.employee.findUnique.mockReset();
    prisma.employee.findMany.mockReset();

    prisma.salaryRate.findMany.mockReset();
    prisma.salaryRate.findFirst.mockReset();
    prisma.salaryRate.create.mockReset();
    prisma.salaryRate.update.mockReset();

    prisma.salaryCalculation.findMany.mockReset();
    prisma.salaryCalculation.findUnique.mockReset();
    prisma.salaryCalculation.create.mockReset();
    prisma.salaryCalculation.update.mockReset();

    prisma.groupEnrollment.findMany.mockReset();
    prisma.staffAssignment.findMany.mockReset();

    auditService.createLog.mockReset();

    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
  });

  describe("getRates", () => {
    test("returns all rates", async () => {
      prisma.salaryRate.findMany.mockResolvedValue([createRate()]);

      const result = await realSalariesService.getRates();

      expect(prisma.salaryRate.findMany).toHaveBeenCalledWith({
        where: {},
        include: { employee: true },
        orderBy: { validFrom: "desc" }
      });

      expect(result).toHaveLength(1);
      expect(result[0].baseAmount).toBe(80000);
    });

    test("filters rates by employeeId", async () => {
      prisma.salaryRate.findMany.mockResolvedValue([]);

      await realSalariesService.getRates({ employeeId });

      expect(prisma.salaryRate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { employeeId }
        })
      );
    });

    test("converts BigInt amounts to numbers", async () => {
      prisma.salaryRate.findMany.mockResolvedValue([
        {
          ...createRate(),
          baseAmount: 50000n,
          perChildAmount: 2000n,
          extraChildBonusAmount: 3000n
        }
      ]);

      const result = await realSalariesService.getRates();

      expect(result[0].baseAmount).toBe(50000);
      expect(result[0].perChildAmount).toBe(2000);
      expect(result[0].extraChildBonusAmount).toBe(3000);
    });
  });

  describe("createRate", () => {
    function setupCreateRate() {
      prisma.employee.findUnique.mockResolvedValue({
        id: employeeId,
        role: "MANAGER",
        status: "ACTIVE"
      });

      prisma.salaryRate.findMany.mockResolvedValue([]);
      prisma.salaryRate.create.mockResolvedValue(createRate());
      auditService.createLog.mockResolvedValue({});
    }

    test("creates salary rate for manager", async () => {
      setupCreateRate();

      const result = await realSalariesService.createRate(
        {
          employeeId,
          validFrom: "2026-01-01"
        },
        actorId
      );

      expect(prisma.employee.findUnique).toHaveBeenCalledWith({
        where: { id: employeeId }
      });

      expect(prisma.salaryRate.create).toHaveBeenCalled();
      expect(auditService.createLog).toHaveBeenCalled();

      expect(result.baseAmount).toBe(80000);
      expect(result.type).toBe("FIXED");
    });

    test("creates rate with dates", async () => {
      setupCreateRate();

      await realSalariesService.createRate(
        {
          employeeId,
          validFrom: "2026-01-01",
          validTo: "2026-12-31"
        },
        actorId
      );

      expect(prisma.salaryRate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            validFrom: new Date("2026-01-01T00:00:00.000Z"),
            validTo: new Date("2026-12-31T00:00:00.000Z")
          })
        })
      );
    });

    test("throws when employee does not exist", async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        realSalariesService.createRate({ employeeId, validFrom: "2026-01-01" }, actorId)
      ).rejects.toMatchObject({
        code: "EMPLOYEE_NOT_FOUND"
      });
    });

    test("throws when employee is inactive", async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: employeeId,
        role: "MANAGER",
        status: "INACTIVE"
      });

      await expect(
        realSalariesService.createRate({ employeeId, validFrom: "2026-01-01" }, actorId)
      ).rejects.toMatchObject({
        code: "EMPLOYEE_NOT_FOUND"
      });
    });

    test("throws for unsupported employee role", async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: employeeId,
        role: "ADMIN",
        status: "ACTIVE"
      });

      await expect(
        realSalariesService.createRate({ employeeId, validFrom: "2026-01-01" }, actorId)
      ).rejects.toMatchObject({
        code: "UNSUPPORTED_ROLE"
      });
    });

    test("throws for invalid rate dates", async () => {
      await expect(
        realSalariesService.createRate(
          {
            employeeId,
            validFrom: "2026-12-31",
            validTo: "2026-01-01"
          },
          actorId
        )
      ).rejects.toMatchObject({
        code: "INVALID_RATE_DATES"
      });
    });

    test("throws for invalid date", async () => {
      await expect(
        realSalariesService.createRate(
          {
            employeeId,
            validFrom: "invalid-date"
          },
          actorId
        )
      ).rejects.toMatchObject({
        code: "INVALID_DATE"
      });
    });

    test("throws when rate overlaps an existing rate", async () => {
      setupCreateRate();

      prisma.salaryRate.findMany.mockResolvedValue([
        {
          id: "old-rate",
          validFrom: new Date("2026-06-01T00:00:00.000Z"),
          validTo: null
        }
      ]);

      await expect(
        realSalariesService.createRate(
          {
            employeeId,
            validFrom: "2026-06-15"
          },
          actorId
        )
      ).rejects.toMatchObject({
        code: "SALARY_RATE_OVERLAP"
      });
    });

    test("closes previous open rate when creating a new rate", async () => {
      setupCreateRate();

      prisma.salaryRate.findMany.mockResolvedValue([
        {
          id: "old-rate",
          validFrom: new Date("2025-01-01T00:00:00.000Z"),
          validTo: null
        }
      ]);

      await realSalariesService.createRate(
        {
          employeeId,
          validFrom: "2026-01-01"
        },
        actorId
      );

      expect(prisma.salaryRate.update).toHaveBeenCalledWith({
        where: { id: "old-rate" },
        data: {
          validTo: new Date("2026-01-01T00:00:00.000Z")
        }
      });
    });
  });

  describe("createCalculations", () => {
    function setupManagerCalculation() {
      prisma.employee.findMany.mockResolvedValue([
        {
          id: employeeId,
          role: "MANAGER",
          status: "ACTIVE",
          firstName: "Test",
          lastName: "Manager"
        }
      ]);

      prisma.salaryRate.findFirst.mockResolvedValue(createRate());

      prisma.salaryCalculation.create.mockResolvedValue(createCalculation());

      auditService.createLog.mockResolvedValue({});
    }

    test("creates calculation for manager", async () => {
      setupManagerCalculation();

      const result = await realSalariesService.createCalculations(
        {
          periodYear: 2026,
          periodMonth: 1,
          employeeId
        },
        actorId
      );

      expect(prisma.employee.findMany).toHaveBeenCalledWith({
        where: {
          status: "ACTIVE",
          id: employeeId
        },
        orderBy: [{ role: "asc" }, { lastName: "asc" }, { firstName: "asc" }]
      });

      expect(prisma.salaryCalculation.create).toHaveBeenCalled();
      expect(auditService.createLog).toHaveBeenCalled();

      expect(result).toHaveLength(1);
      expect(result[0].totalAmount).toBe(80000);
      expect(result[0].status).toBe("DRAFT");
    });

    test("creates calculations for all active employees", async () => {
      setupManagerCalculation();

      await realSalariesService.createCalculations(
        {
          periodYear: 2026,
          periodMonth: 1
        },
        actorId
      );

      expect(prisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: "ACTIVE" }
        })
      );
    });

    test("throws when requested employee does not exist", async () => {
      prisma.employee.findMany.mockResolvedValue([]);

      await expect(
        realSalariesService.createCalculations(
          {
            periodYear: 2026,
            periodMonth: 1,
            employeeId
          },
          actorId
        )
      ).rejects.toMatchObject({
        code: "EMPLOYEE_NOT_FOUND"
      });
    });

    test("throws when salary rate does not exist", async () => {
      prisma.employee.findMany.mockResolvedValue([
        {
          id: employeeId,
          role: "MANAGER",
          status: "ACTIVE"
        }
      ]);

      prisma.salaryRate.findFirst.mockResolvedValue(null);

      await expect(
        realSalariesService.createCalculations(
          {
            periodYear: 2026,
            periodMonth: 1,
            employeeId
          },
          actorId
        )
      ).rejects.toMatchObject({
        code: "SALARY_RATE_NOT_FOUND"
      });
    });

    test("throws when calculation already exists", async () => {
      prisma.employee.findMany.mockResolvedValue([]);
      prisma.employee.findMany.mockRejectedValue({
        code: "P2002"
      });

      await expect(
        realSalariesService.createCalculations(
          {
            periodYear: 2026,
            periodMonth: 1
          },
          actorId
        )
      ).rejects.toMatchObject({
        code: "SALARY_CALCULATION_EXISTS"
      });
    });

    test("rejects invalid year", async () => {
      await expect(
        realSalariesService.createCalculations(
          {
            periodYear: 1999,
            periodMonth: 1
          },
          actorId
        )
      ).rejects.toMatchObject({
        code: "INVALID_PERIOD_YEAR"
      });
    });

    test("rejects invalid month", async () => {
      await expect(
        realSalariesService.createCalculations(
          {
            periodYear: 2026,
            periodMonth: 13
          },
          actorId
        )
      ).rejects.toMatchObject({
        code: "INVALID_PERIOD_MONTH"
      });
    });

    test("calculates educator salary using children count and bonus", async () => {
      const educatorId = "cccccccccccccccccccccccc";

      prisma.employee.findMany.mockResolvedValue([
        {
          id: educatorId,
          role: "EDUCATOR",
          status: "ACTIVE"
        }
      ]);

      prisma.salaryRate.findFirst.mockResolvedValue({
        id: "educator-rate",
        type: "MIXED",
        baseAmount: 0n,
        perChildAmount: 2000n,
        childThreshold: 12,
        extraChildBonusAmount: 5000n,
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
        validTo: null
      });

      prisma.staffAssignment.findMany.mockResolvedValue([
        {
          groupId: "group-1",
          endDate: null
        }
      ]);

      prisma.groupEnrollment.findMany.mockResolvedValue(
        Array.from({ length: 14 }, () => ({
          endDate: null
        }))
      );

      prisma.salaryCalculation.create.mockImplementation(({ data }) => ({
        id: calculationId,
        ...data,
        employee: { id: educatorId, role: "EDUCATOR" }
      }));

      auditService.createLog.mockResolvedValue({});

      const result = await realSalariesService.createCalculations(
        {
          periodYear: 2026,
          periodMonth: 1,
          employeeId: educatorId
        },
        actorId
      );

      expect(result[0].childrenCount).toBe(14);
      expect(result[0].perChildTotal).toBe(28000);
      expect(result[0].extraChildrenCount).toBe(2);
      expect(result[0].bonusAmount).toBe(10000);
      expect(result[0].totalAmount).toBe(38000);
    });

    test("throws when staff assignment does not exist", async () => {
      const educatorId = "cccccccccccccccccccccccc";

      prisma.employee.findMany.mockResolvedValue([
        {
          id: educatorId,
          role: "EDUCATOR",
          status: "ACTIVE"
        }
      ]);

      prisma.salaryRate.findFirst.mockResolvedValue({
        ...createRate(),
        baseAmount: 0n,
        perChildAmount: 2000n,
        childThreshold: 12,
        extraChildBonusAmount: 5000n
      });

      prisma.staffAssignment.findMany.mockResolvedValue([]);

      await expect(
        realSalariesService.createCalculations(
          {
            periodYear: 2026,
            periodMonth: 1,
            employeeId: educatorId
          },
          actorId
        )
      ).rejects.toMatchObject({
        code: "STAFF_ASSIGNMENT_NOT_FOUND"
      });
    });

    test("throws when employee has multiple active assignments", async () => {
      const educatorId = "cccccccccccccccccccccccc";

      prisma.employee.findMany.mockResolvedValue([
        {
          id: educatorId,
          role: "EDUCATOR",
          status: "ACTIVE"
        }
      ]);

      prisma.salaryRate.findFirst.mockResolvedValue({
        ...createRate(),
        baseAmount: 0n,
        perChildAmount: 2000n,
        childThreshold: 12,
        extraChildBonusAmount: 5000n
      });

      prisma.staffAssignment.findMany.mockResolvedValue([
        { groupId: "group-1", endDate: null },
        { groupId: "group-2", endDate: null }
      ]);

      await expect(
        realSalariesService.createCalculations(
          {
            periodYear: 2026,
            periodMonth: 1,
            employeeId: educatorId
          },
          actorId
        )
      ).rejects.toMatchObject({
        code: "MULTIPLE_STAFF_ASSIGNMENTS"
      });
    });
  });

  describe("getCalculations", () => {
    test("returns all calculations", async () => {
      prisma.salaryCalculation.findMany.mockResolvedValue([createCalculation()]);

      const result = await realSalariesService.getCalculations();

      expect(prisma.salaryCalculation.findMany).toHaveBeenCalledWith({
        where: {},
        include: { employee: true },
        orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }, { calculatedAt: "desc" }]
      });

      expect(result).toHaveLength(1);
      expect(result[0].totalAmount).toBe(80000);
    });

    test("filters calculations by employeeId", async () => {
      prisma.salaryCalculation.findMany.mockResolvedValue([]);

      await realSalariesService.getCalculations({ employeeId });

      expect(prisma.salaryCalculation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { employeeId }
        })
      );
    });

    test("filters calculations by period and status", async () => {
      prisma.salaryCalculation.findMany.mockResolvedValue([]);

      await realSalariesService.getCalculations({
        periodYear: "2026",
        periodMonth: "5",
        status: "DRAFT"
      });

      expect(prisma.salaryCalculation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            periodYear: 2026,
            periodMonth: 5,
            status: "DRAFT"
          }
        })
      );
    });
  });

  describe("getCalculationById", () => {
    test("returns calculation by id", async () => {
      prisma.salaryCalculation.findUnique.mockResolvedValue(createCalculation());

      const result = await realSalariesService.getCalculationById(calculationId);

      expect(prisma.salaryCalculation.findUnique).toHaveBeenCalledWith({
        where: { id: calculationId },
        include: { employee: true }
      });

      expect(result.id).toBe(calculationId);
      expect(result.totalAmount).toBe(80000);
    });

    test("throws when calculation does not exist", async () => {
      prisma.salaryCalculation.findUnique.mockResolvedValue(null);

      await expect(realSalariesService.getCalculationById(calculationId)).rejects.toMatchObject({
        code: "SALARY_CALCULATION_NOT_FOUND"
      });
    });
  });

  describe("cancelCalculation", () => {
    test("cancels draft calculation", async () => {
      prisma.salaryCalculation.findUnique.mockResolvedValue(createCalculation());

      prisma.salaryCalculation.update.mockResolvedValue({
        ...createCalculation(),
        status: "CANCELLED"
      });

      auditService.createLog.mockResolvedValue({});

      const result = await realSalariesService.cancelCalculation(calculationId, actorId);

      expect(prisma.salaryCalculation.update).toHaveBeenCalledWith({
        where: { id: calculationId },
        data: { status: "CANCELLED" },
        include: { employee: true }
      });

      expect(auditService.createLog).toHaveBeenCalled();
      expect(result.status).toBe("CANCELLED");
    });

    test("throws when calculation does not exist", async () => {
      prisma.salaryCalculation.findUnique.mockResolvedValue(null);

      await expect(
        realSalariesService.cancelCalculation(calculationId, actorId)
      ).rejects.toMatchObject({
        code: "SALARY_CALCULATION_NOT_FOUND"
      });
    });

    test("cannot cancel paid calculation", async () => {
      prisma.salaryCalculation.findUnique.mockResolvedValue({
        ...createCalculation(),
        status: "PAID"
      });

      await expect(
        realSalariesService.cancelCalculation(calculationId, actorId)
      ).rejects.toMatchObject({
        code: "PAID_CALCULATION_CANNOT_BE_CANCELLED"
      });
    });

    test("cannot cancel already cancelled calculation", async () => {
      prisma.salaryCalculation.findUnique.mockResolvedValue({
        ...createCalculation(),
        status: "CANCELLED"
      });

      await expect(
        realSalariesService.cancelCalculation(calculationId, actorId)
      ).rejects.toMatchObject({
        code: "SALARY_CALCULATION_ALREADY_CANCELLED"
      });
    });

    test("writes cancellation audit log", async () => {
      const calculation = createCalculation();
      const updated = {
        ...calculation,
        status: "CANCELLED"
      };

      prisma.salaryCalculation.findUnique.mockResolvedValue(calculation);
      prisma.salaryCalculation.update.mockResolvedValue(updated);
      auditService.createLog.mockResolvedValue({});

      await realSalariesService.cancelCalculation(calculationId, actorId);

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId,
          action: "CANCEL",
          entityType: "SalaryCalculation",
          entityId: calculationId,
          before: calculation,
          after: updated
        }),
        prisma
      );
    });
  });
});
