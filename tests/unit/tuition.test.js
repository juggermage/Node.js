
jest.mock("../../src/config/prisma", () => ({
  $transaction: jest.fn(),
  tuitionRate: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn()
  },
  childDiscount: {
    findMany: jest.fn()
  },
  child: {
    findUnique: jest.fn()
  }
}));

jest.mock("../../src/modules/audit/audit.service", () => ({
  createLog: jest.fn()
}));

jest.mock("../../src/modules/billing/tuition/tuition.service", () => ({
  getAllRates: jest.fn(),
  createRate: jest.fn(),
  calculateMonthlyTuitionCost: jest.fn(),
  calculateAnnualTuitionCost: jest.fn()
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
const tuitionService = require("../../src/modules/billing/tuition/tuition.service");
const realTuitionService = jest.requireActual(
  "../../src/modules/billing/tuition/tuition.service"
);

const controller = require("../../src/modules/billing/tuition/tuition.controller");
const router = require("../../src/modules/billing/tuition/tuition.routes");
const validation = require("../../src/modules/billing/tuition/tuition.validation");
const HTTP_STATUS = require("../../src/utils/http-status");

describe("Tuition Controller", () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      user: {
        id: "admin-123"
      },
      body: {},
      query: {}
    };

    res = {
      locals: {
        validated: {
          body: {},
          query: {}
        }
      },
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  test("getRates returns rates", async () => {
    const data = [{ id: "rate-1", amount: "15000" }];

    tuitionService.getAllRates.mockResolvedValue(data);

    await controller.getRates(req, res);

    expect(tuitionService.getAllRates).toHaveBeenCalledWith({});
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data
    });
  });

  test("createRate creates a rate", async () => {
    const body = {
      name: "Monthly tuition",
      amount: 15000,
      validFrom: "2026-01-01",
      validTo: null
    };

    const data = { id: "rate-1", amount: "15000" };

    res.locals.validated.body = body;
    tuitionService.createRate.mockResolvedValue(data);

    await controller.createRate(req, res);

    expect(tuitionService.createRate).toHaveBeenCalledWith(body, "admin-123");
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data
    });
  });

  test("calculateMonthly returns monthly calculation", async () => {
    const body = {
      childId: "507f1f77bcf86cd799439011",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31"
    };

    const data = { total: "15000" };

    res.locals.validated.body = body;
    tuitionService.calculateMonthlyTuitionCost.mockResolvedValue(data);

    await controller.calculateMonthly(req, res);

    expect(tuitionService.calculateMonthlyTuitionCost).toHaveBeenCalledWith(body);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data
    });
  });

  test("calculateAnnual returns annual calculation", async () => {
    const body = {
      childId: "507f1f77bcf86cd799439011",
      periodStart: "2026-01-01"
    };

    const data = { total: "158400" };

    res.locals.validated.body = body;
    tuitionService.calculateAnnualTuitionCost.mockResolvedValue(data);

    await controller.calculateAnnual(req, res);

    expect(tuitionService.calculateAnnualTuitionCost).toHaveBeenCalledWith(body);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data
    });
  });
});

describe("Tuition Routes", () => {
  test("registers authentication and authorization middleware", () => {
    const authMiddleware = require("../../src/middleware/auth.middleware");
    const rbacMiddleware = require("../../src/middleware/rbac.middleware");

    expect(
      router.stack.some((layer) => layer.handle === authMiddleware)
    ).toBe(true);

    expect(rbacMiddleware).toHaveBeenCalledWith("ADMIN", "MANAGER");
  });

  test("registers all tuition routes", () => {
    const routes = router.stack
      .filter((layer) => layer.route)
      .map((layer) => ({
        path: layer.route.path,
        methods: layer.route.methods
      }));

    expect(routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/rates",
          methods: expect.objectContaining({ get: true })
        }),
        expect.objectContaining({
          path: "/rates",
          methods: expect.objectContaining({ post: true })
        }),
        expect.objectContaining({
          path: "/calculate/monthly",
          methods: expect.objectContaining({ post: true })
        }),
        expect.objectContaining({
          path: "/calculate/annual",
          methods: expect.objectContaining({ post: true })
        })
      ])
    );
  });
});

describe("Tuition Validation", () => {
  const childId = "507f1f77bcf86cd799439011";

  describe("createTuitionRateSchema", () => {
    test("accepts valid tuition rate", () => {
      const result = validation.createTuitionRateSchema.validate({
        name: "Monthly tuition",
        amount: 15000,
        validFrom: "2026-01-01",
        validTo: "2026-12-31"
      });

      expect(result.error).toBeUndefined();
    });

    test("applies default amount", () => {
      const result = validation.createTuitionRateSchema.validate({
        name: "Monthly tuition",
        validFrom: "2026-01-01"
      });

      expect(result.error).toBeUndefined();
      expect(result.value.amount).toBe(15000);
    });

    test("rejects empty name", () => {
      const result = validation.createTuitionRateSchema.validate({
        name: " ",
        amount: 15000,
        validFrom: "2026-01-01"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects negative amount", () => {
      const result = validation.createTuitionRateSchema.validate({
        name: "Monthly tuition",
        amount: -100,
        validFrom: "2026-01-01"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects invalid date", () => {
      const result = validation.createTuitionRateSchema.validate({
        name: "Monthly tuition",
        amount: 15000,
        validFrom: "2026-02-30"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects validTo earlier than validFrom", () => {
      const result = validation.createTuitionRateSchema.validate({
        name: "Monthly tuition",
        amount: 15000,
        validFrom: "2026-12-01",
        validTo: "2026-01-01"
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("rateQuerySchema", () => {
    test("accepts valid onDate", () => {
      const result = validation.rateQuerySchema.validate({
        onDate: "2026-06-15"
      });

      expect(result.error).toBeUndefined();
    });

    test("accepts empty query", () => {
      const result = validation.rateQuerySchema.validate({});

      expect(result.error).toBeUndefined();
    });

    test("rejects invalid onDate", () => {
      const result = validation.rateQuerySchema.validate({
        onDate: "15-06-2026"
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("calculateMonthlyTuitionSchema", () => {
    test("accepts valid monthly calculation", () => {
      const result = validation.calculateMonthlyTuitionSchema.validate({
        childId,
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31"
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects invalid childId", () => {
      const result = validation.calculateMonthlyTuitionSchema.validate({
        childId: "invalid",
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects periodStart later than periodEnd", () => {
      const result = validation.calculateMonthlyTuitionSchema.validate({
        childId,
        periodStart: "2026-02-01",
        periodEnd: "2026-01-01"
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("calculateAnnualTuitionSchema", () => {
    test("accepts valid annual calculation", () => {
      const result = validation.calculateAnnualTuitionSchema.validate({
        childId,
        periodStart: "2026-01-01"
      });

      expect(result.error).toBeUndefined();
    });

    test("rejects invalid childId", () => {
      const result = validation.calculateAnnualTuitionSchema.validate({
        childId: "invalid",
        periodStart: "2026-01-01"
      });

      expect(result.error).toBeDefined();
    });

    test("rejects invalid periodStart", () => {
      const result = validation.calculateAnnualTuitionSchema.validate({
        childId,
        periodStart: "2026-02-30"
      });

      expect(result.error).toBeDefined();
    });
  });
});

describe("Tuition Service", () => {
  const childId = "507f1f77bcf86cd799439011";

  const activeChild = {
    id: childId,
    status: "ACTIVE"
  };

  const rate = {
    id: "rate-1",
    name: "Monthly tuition",
    amount: 15000n,
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
    validTo: null
  };

  beforeEach(() => {
    jest.clearAllMocks();

    prisma.tuitionRate.findMany.mockResolvedValue([]);
    prisma.tuitionRate.findFirst.mockResolvedValue(rate);
    prisma.child.findUnique.mockResolvedValue(activeChild);
    prisma.childDiscount.findMany.mockResolvedValue([]);

    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        tuitionRate: {
          findFirst: prisma.tuitionRate.findFirst,
          create: prisma.tuitionRate.create
        }
      })
    );
  });

  describe("getAllRates", () => {
    test("returns all rates", async () => {
      prisma.tuitionRate.findMany.mockResolvedValue([rate]);

      const result = await realTuitionService.getAllRates();

      expect(prisma.tuitionRate.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: {
          validFrom: "desc"
        }
      });

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe("15000");
    });

    test("filters rates by date", async () => {
      await realTuitionService.getAllRates({
        onDate: "2026-06-15"
      });

      expect(prisma.tuitionRate.findMany).toHaveBeenCalledWith({
        where: {
          validFrom: {
            lte: new Date("2026-06-15T00:00:00.000Z")
          },
          OR: [
            { validTo: null },
            {
              validTo: {
                gte: new Date("2026-06-15T00:00:00.000Z")
              }
            }
          ]
        },
        orderBy: {
          validFrom: "desc"
        }
      });
    });
  });

  describe("getApplicableRate", () => {
    test("returns applicable rate", async () => {
      const result = await realTuitionService.getApplicableRate("2026-06-15");

      expect(prisma.tuitionRate.findFirst).toHaveBeenCalled();
      expect(result).toEqual(rate);
    });

    test("throws when rate does not exist", async () => {
      prisma.tuitionRate.findFirst.mockResolvedValue(null);

      await expect(
        realTuitionService.getApplicableRate("2026-06-15")
      ).rejects.toMatchObject({
        code: "TUITION_RATE_NOT_FOUND"
      });
    });
  });

  describe("createRate", () => {
    test("creates a tuition rate", async () => {
      prisma.tuitionRate.findFirst.mockResolvedValue(null);
      prisma.tuitionRate.create.mockResolvedValue({
        ...rate,
        name: "New rate"
      });

      const result = await realTuitionService.createRate(
        {
          name: " New rate ",
          amount: 18000,
          validFrom: "2026-06-01",
          validTo: null
        },
        "admin-123"
      );

      expect(prisma.tuitionRate.create).toHaveBeenCalledWith({
        data: {
          name: "New rate",
          amount: 18000n,
          validFrom: new Date("2026-06-01T00:00:00.000Z"),
          validTo: null
        }
      });

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "admin-123",
          action: "CREATE",
          entityType: "TuitionRate"
        }),
        expect.any(Object)
      );

      expect(result.amount).toBe("15000");
    });

    test("rejects invalid amount", async () => {
      await expect(
        realTuitionService.createRate(
          {
            name: "Monthly tuition",
            amount: -100,
            validFrom: "2026-06-01"
          },
          "admin-123"
        )
      ).rejects.toMatchObject({
        code: "INVALID_TUITION_RATE"
      });
    });

    test("rejects empty name", async () => {
      await expect(
        realTuitionService.createRate(
          {
            name: "   ",
            amount: 15000,
            validFrom: "2026-06-01"
          },
          "admin-123"
        )
      ).rejects.toMatchObject({
        code: "INVALID_RATE_NAME"
      });
    });

    test("rejects invalid date period", async () => {
      await expect(
        realTuitionService.createRate(
          {
            name: "Monthly tuition",
            amount: 15000,
            validFrom: "2026-06-10",
            validTo: "2026-06-01"
          },
          "admin-123"
        )
      ).rejects.toMatchObject({
        code: "INVALID_PERIOD"
      });
    });

    test("rejects overlapping rate", async () => {
      prisma.tuitionRate.findFirst.mockResolvedValue(rate);

      await expect(
        realTuitionService.createRate(
          {
            name: "New rate",
            amount: 18000,
            validFrom: "2026-06-01"
          },
          "admin-123"
        )
      ).rejects.toMatchObject({
        code: "TUITION_RATE_CONFLICT"
      });

      expect(prisma.tuitionRate.create).not.toHaveBeenCalled();
    });
  });

  describe("validatePeriod", () => {
    test("returns valid period and number of days", () => {
      const result = realTuitionService.validatePeriod(
        "2026-01-01",
        "2026-01-31"
      );

      expect(result.days).toBe(31);
      expect(result.from).toEqual(new Date("2026-01-01T00:00:00.000Z"));
      expect(result.to).toEqual(new Date("2026-01-31T00:00:00.000Z"));
    });

    test("rejects invalid date", () => {
      expect(() =>
        realTuitionService.validatePeriod("2026-02-30", "2026-03-01")
      ).toThrow();
    });

    test("rejects start date after end date", () => {
      expect(() =>
        realTuitionService.validatePeriod("2026-02-01", "2026-01-01")
      ).toThrow();
    });
  });

  describe("roundPercentage", () => {
    test("calculates percentage with rounding", () => {
      expect(realTuitionService.roundPercentage(10000n, 10)).toBe(9000n);
      expect(realTuitionService.roundPercentage(10000n, 20)).toBe(8000n);
      expect(realTuitionService.roundPercentage(10000n, 30)).toBe(7000n);
    });

    test("rounds fractional result", () => {
      expect(realTuitionService.roundPercentage(1001n, 10)).toBe(901n);
    });
  });

  describe("calculateMonthlyTuitionCost", () => {
    test("calculates monthly tuition without discount", async () => {
      const result = await realTuitionService.calculateMonthlyTuitionCost({
        childId,
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31"
      });

      expect(result).toMatchObject({
        childId,
        months: 1,
        monthlyAmount: "15000",
        baseAmount: "15000",
        discount: null,
        annualPrepaymentDiscount: null,
        total: "15000",
        currency: "UAH"
      });

      expect(prisma.child.findUnique).toHaveBeenCalledWith({
        where: {
          id: childId
        },
        select: {
          id: true,
          status: true
        }
      });
    });

    test("calculates monthly tuition with discount", async () => {
      prisma.childDiscount.findMany.mockResolvedValue([
        {
          validFrom: new Date("2026-01-01T00:00:00.000Z"),
          validTo: null,
          discount: {
            id: "discount-1",
            name: "Discount 10%",
            type: "PERCENTAGE",
            percentage: 10,
            isActive: true
          }
        }
      ]);

      const result = await realTuitionService.calculateMonthlyTuitionCost({
        childId,
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31"
      });

      expect(result.total).toBe("13500");
      expect(result.discount).toMatchObject({
        id: "discount-1",
        percentage: 10,
        amount: "1500"
      });
    });

    test("rejects inactive child", async () => {
      prisma.child.findUnique.mockResolvedValue({
        id: childId,
        status: "INACTIVE"
      });

      await expect(
        realTuitionService.calculateMonthlyTuitionCost({
          childId,
          periodStart: "2026-01-01",
          periodEnd: "2026-01-31"
        })
      ).rejects.toMatchObject({
        code: "CHILD_NOT_FOUND"
      });
    });

    test("rejects missing child", async () => {
      prisma.child.findUnique.mockResolvedValue(null);

      await expect(
        realTuitionService.calculateMonthlyTuitionCost({
          childId,
          periodStart: "2026-01-01",
          periodEnd: "2026-01-31"
        })
      ).rejects.toMatchObject({
        code: "CHILD_NOT_FOUND"
      });
    });

    test("rejects period that is not a full calendar month", async () => {
      await expect(
        realTuitionService.calculateMonthlyTuitionCost({
          childId,
          periodStart: "2026-01-02",
          periodEnd: "2026-01-31"
        })
      ).rejects.toMatchObject({
        code: "INVALID_TUITION_PERIOD"
      });
    });

    test("rejects period crossing two months", async () => {
      await expect(
        realTuitionService.calculateMonthlyTuitionCost({
          childId,
          periodStart: "2026-01-01",
          periodEnd: "2026-02-28"
        })
      ).rejects.toMatchObject({
        code: "INVALID_TUITION_PERIOD"
      });
    });

    test("rejects missing applicable rate", async () => {
      prisma.tuitionRate.findFirst.mockResolvedValue(null);

      await expect(
        realTuitionService.calculateMonthlyTuitionCost({
          childId,
          periodStart: "2026-01-01",
          periodEnd: "2026-01-31"
        })
      ).rejects.toMatchObject({
        code: "TUITION_RATE_NOT_FOUND"
      });
    });

    test("rejects rate that changes during period", async () => {
      prisma.tuitionRate.findFirst.mockResolvedValue({
        ...rate,
        validTo: new Date("2026-01-15T00:00:00.000Z")
      });

      await expect(
        realTuitionService.calculateMonthlyTuitionCost({
          childId,
          periodStart: "2026-01-01",
          periodEnd: "2026-01-31"
        })
      ).rejects.toMatchObject({
        code: "RATE_PERIOD_CONFLICT"
      });
    });

    test("rejects multiple applicable discounts", async () => {
      const discount = {
        type: "PERCENTAGE",
        percentage: 10,
        isActive: true
      };

      prisma.childDiscount.findMany.mockResolvedValue([
        {
          validFrom: new Date("2026-01-01T00:00:00.000Z"),
          validTo: null,
          discount: {
            ...discount,
            id: "discount-1",
            name: "First discount"
          }
        },
        {
          validFrom: new Date("2026-01-01T00:00:00.000Z"),
          validTo: null,
          discount: {
            ...discount,
            id: "discount-2",
            name: "Second discount"
          }
        }
      ]);

      await expect(
        realTuitionService.calculateMonthlyTuitionCost({
          childId,
          periodStart: "2026-01-01",
          periodEnd: "2026-01-31"
        })
      ).rejects.toMatchObject({
        code: "MULTIPLE_DISCOUNTS"
      });
    });
  });

  describe("calculateAnnualTuitionCost", () => {
    test("calculates annual tuition with prepayment discount", async () => {
      const result = await realTuitionService.calculateAnnualTuitionCost({
        childId,
        periodStart: "2026-01-01"
      });

      expect(result).toMatchObject({
        childId,
        months: 12,
        monthlyAmount: "15000",
        baseAmount: "180000",
        discount: null,
        annualPrepaymentDiscount: {
          percentage: 12,
          amount: "21600"
        },
        total: "158400",
        currency: "UAH"
      });

      expect(result.periodStart).toBe("2026-01-01");
      expect(result.periodEnd).toBe("2026-12-31");
    });

    test("calculates annual tuition with regular and prepayment discounts", async () => {
      prisma.childDiscount.findMany.mockResolvedValue([
        {
          validFrom: new Date("2026-01-01T00:00:00.000Z"),
          validTo: null,
          discount: {
            id: "discount-1",
            name: "Discount 10%",
            type: "PERCENTAGE",
            percentage: 10,
            isActive: true
          }
        }
      ]);

      const result = await realTuitionService.calculateAnnualTuitionCost({
        childId,
        periodStart: "2026-01-01"
      });

      expect(result.baseAmount).toBe("180000");
      expect(result.discount.amount).toBe("18000");
      expect(result.annualPrepaymentDiscount.amount).toBe("19440");
      expect(result.total).toBe("142560");
    });

    test("rejects annual period not starting on first day", async () => {
      await expect(
        realTuitionService.calculateAnnualTuitionCost({
          childId,
          periodStart: "2026-01-15"
        })
      ).rejects.toMatchObject({
        code: "INVALID_TUITION_PERIOD"
      });
    });

    test("rejects inactive child", async () => {
      prisma.child.findUnique.mockResolvedValue({
        id: childId,
        status: "INACTIVE"
      });

      await expect(
        realTuitionService.calculateAnnualTuitionCost({
          childId,
          periodStart: "2026-01-01"
        })
      ).rejects.toMatchObject({
        code: "CHILD_NOT_FOUND"
      });
    });

    test("rejects missing applicable rate", async () => {
      prisma.tuitionRate.findFirst.mockResolvedValue(null);

      await expect(
        realTuitionService.calculateAnnualTuitionCost({
          childId,
          periodStart: "2026-01-01"
        })
      ).rejects.toMatchObject({
        code: "TUITION_RATE_NOT_FOUND"
      });
    });

    test("rejects rate that changes during annual period", async () => {
      prisma.tuitionRate.findFirst.mockResolvedValue({
        ...rate,
        validTo: new Date("2026-06-30T00:00:00.000Z")
      });

      await expect(
        realTuitionService.calculateAnnualTuitionCost({
          childId,
          periodStart: "2026-01-01"
        })
      ).rejects.toMatchObject({
        code: "RATE_PERIOD_CONFLICT"
      });
    });
  });
});
