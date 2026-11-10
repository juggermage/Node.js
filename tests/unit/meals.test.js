const prisma = require("../../src/config/prisma");
const service = require("../../src/modules/billing/meals/meals.service");
const controller = require("../../src/modules/billing/meals/meals.controller");
const router = require("../../src/modules/billing/meals/meals.routes");

const {
  createMealRateSchema,
  rateQuerySchema,
  calculateMealSchema
} = require("../../src/modules/billing/meals/meals.validation");

const auditService = require("../../src/modules/audit/audit.service");
const HTTP_STATUS = require("../../src/utils/http-status");

jest.mock("../../src/config/prisma", () => ({
  mealRate: {
    findMany: jest.fn(),
    findFirst: jest.fn()
  },
  child: {
    findUnique: jest.fn()
  },
  parent: {
    findFirst: jest.fn()
  },
  childParent: {
    findFirst: jest.fn()
  },
  attendance: {
    findMany: jest.fn()
  },
  groupEnrollment: {
    findMany: jest.fn()
  },
  $transaction: jest.fn()
}));

jest.mock("../../src/modules/audit/audit.service", () => ({
  createLog: jest.fn()
}));

jest.mock("../../src/middleware/auth.middleware", () => jest.fn());

jest.mock("../../src/middleware/rbac.middleware", () => {
  return jest.fn((...allowedRoles) => {
    const middleware = jest.fn();
    middleware.allowedRoles = allowedRoles;
    return middleware;
  });
});

jest.mock("../../src/middleware/validate.middleware", () => {
  return jest.fn((schema, validationProperty) => {
    const middleware = jest.fn();
    middleware.schema = schema;
    middleware.validationProperty = validationProperty;
    return middleware;
  });
});

const admin = {
  id: "admin-1",
  role: "ADMIN"
};

const manager = {
  id: "manager-1",
  role: "MANAGER"
};

const parentUser = {
  id: "parent-user-1",
  role: "PARENT"
};

const validRate = {
  id: "rate-1",
  ageYears: 3,
  amount: 400n,
  validFrom: new Date("2026-01-01T00:00:00.000Z"),
  validTo: null
};

const validChild = {
  id: "child-1",
  birthDate: new Date("2023-05-10T00:00:00.000Z"),
  status: "ACTIVE"
};

function createTransaction() {
  const tx = {
    mealRate: {
      create: jest.fn()
    }
  };

  prisma.$transaction.mockImplementation((callback) => callback(tx));

  return tx;
}

function expectAppError(promise, statusCode, code) {
  return expect(promise).rejects.toMatchObject({
    statusCode,
    code
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("meals service", () => {
  describe("DEFAULT_RATES", () => {
    it("contains default rates for ages 2 to 5", () => {
      expect(service.DEFAULT_RATES).toEqual({
        2: 300,
        3: 400,
        4: 500,
        5: 600
      });
    });
  });

  describe("calculateAge", () => {
    it("calculates age correctly", () => {
      expect(
        service.calculateAge(
          new Date("2020-05-10T00:00:00.000Z"),
          new Date("2025-05-10T00:00:00.000Z")
        )
      ).toBe(5);
    });

    it("does not increase age before birthday", () => {
      expect(
        service.calculateAge(
          new Date("2020-05-10T00:00:00.000Z"),
          new Date("2025-05-09T00:00:00.000Z")
        )
      ).toBe(4);
    });

    it("throws an error for an invalid birth date", () => {
      expect(() => service.calculateAge("invalid-date", new Date("2025-05-10"))).toThrow(
        expect.objectContaining({
          code: "INVALID_BIRTH_DATE"
        })
      );
    });

    it("throws an error when birth date is in the future", () => {
      expect(() =>
        service.calculateAge(
          new Date("2026-01-01T00:00:00.000Z"),
          new Date("2025-01-01T00:00:00.000Z")
        )
      ).toThrow(
        expect.objectContaining({
          code: "INVALID_BIRTH_DATE"
        })
      );
    });
  });

  describe("validatePeriod", () => {
    it("returns normalized dates and number of days", () => {
      const result = service.validatePeriod("2026-01-01", "2026-01-05");

      expect(result.from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
      expect(result.to.toISOString()).toBe("2026-01-05T00:00:00.000Z");
      expect(result.days).toBe(5);
    });

    it("counts a single day correctly", () => {
      const result = service.validatePeriod("2026-01-01", "2026-01-01");

      expect(result.days).toBe(1);
    });

    it("accepts Date objects", () => {
      const result = service.validatePeriod(
        new Date("2026-01-01T15:30:00.000Z"),
        new Date("2026-01-02T18:00:00.000Z")
      );

      expect(result.days).toBe(2);
    });

    it("rejects an invalid date", () => {
      expect(() => service.validatePeriod("2026-02-30", "2026-03-01")).toThrow(
        expect.objectContaining({
          code: "INVALID_DATE"
        })
      );
    });

    it("rejects an incorrectly formatted date", () => {
      expect(() => service.validatePeriod("01-01-2026", "2026-01-05")).toThrow(
        expect.objectContaining({
          code: "INVALID_DATE"
        })
      );
    });

    it("rejects a period with start date after end date", () => {
      expect(() => service.validatePeriod("2026-01-10", "2026-01-01")).toThrow(
        expect.objectContaining({
          code: "INVALID_PERIOD"
        })
      );
    });
  });

  describe("calculateAmount", () => {
    it("calculates the total amount", () => {
      expect(service.calculateAmount(400, 5, 10)).toBe(2000n);
    });

    it("supports BigInt rates", () => {
      expect(service.calculateAmount(400n, 3, 5)).toBe(1200n);
    });

    it("returns zero for zero attended days", () => {
      expect(service.calculateAmount(400, 0, 5)).toBe(0n);
    });

    it("rejects negative attendance days", () => {
      expect(() => service.calculateAmount(400, -1, 5)).toThrow(
        expect.objectContaining({
          code: "INVALID_ATTENDANCE_DAYS"
        })
      );
    });

    it("rejects attendance days greater than maximum", () => {
      expect(() => service.calculateAmount(400, 6, 5)).toThrow(
        expect.objectContaining({
          code: "INVALID_ATTENDANCE_DAYS"
        })
      );
    });

    it("rejects non-integer attendance days", () => {
      expect(() => service.calculateAmount(400, 2.5, 5)).toThrow(
        expect.objectContaining({
          code: "INVALID_ATTENDANCE_DAYS"
        })
      );
    });

    it("rejects an invalid rate", () => {
      expect(() => service.calculateAmount(0, 2, 5)).toThrow(
        expect.objectContaining({
          code: "INVALID_MEAL_RATE"
        })
      );
    });

    it("rejects a negative rate", () => {
      expect(() => service.calculateAmount(-100, 2, 5)).toThrow(
        expect.objectContaining({
          code: "INVALID_MEAL_RATE"
        })
      );
    });
  });

  describe("getAllRates", () => {
    it("returns all rates", async () => {
      prisma.mealRate.findMany.mockResolvedValue([validRate]);

      const result = await service.getAllRates();

      expect(result).toEqual([
        {
          ...validRate,
          amount: "400"
        }
      ]);

      expect(prisma.mealRate.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: [{ ageYears: "asc" }, { validFrom: "desc" }]
      });
    });

    it("filters rates by age", async () => {
      prisma.mealRate.findMany.mockResolvedValue([]);

      await service.getAllRates({ ageYears: 3 });

      expect(prisma.mealRate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ageYears: 3 }
        })
      );
    });

    it("filters rates by category", async () => {
      prisma.mealRate.findMany.mockResolvedValue([]);

      await service.getAllRates({ category: "A3" });

      expect(prisma.mealRate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { category: "A3" }
        })
      );
    });

    it("filters rates by date", async () => {
      prisma.mealRate.findMany.mockResolvedValue([]);

      await service.getAllRates({
        onDate: "2026-05-01"
      });

      expect(prisma.mealRate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            validFrom: {
              lte: new Date("2026-05-01T00:00:00.000Z")
            },
            OR: [
              { validTo: null },
              {
                validTo: {
                  gte: new Date("2026-05-01T00:00:00.000Z")
                }
              }
            ]
          }
        })
      );
    });

    it("rejects an invalid age", async () => {
      await expectAppError(
        service.getAllRates({ ageYears: 6 }),
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        "INVALID_AGE_CATEGORY"
      );
    });

    it("rejects an invalid category", async () => {
      await expectAppError(
        service.getAllRates({ category: "A6" }),
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        "INVALID_MEAL_CATEGORY"
      );
    });
  });

  describe("getApplicableRate", () => {
    it("returns the applicable rate", async () => {
      prisma.mealRate.findFirst.mockResolvedValue(validRate);

      await expect(service.getApplicableRate(3, "2026-05-01")).resolves.toEqual(validRate);

      expect(prisma.mealRate.findFirst).toHaveBeenCalledWith({
        where: {
          ageYears: 3,
          validFrom: {
            lte: new Date("2026-05-01T00:00:00.000Z")
          },
          OR: [
            { validTo: null },
            {
              validTo: {
                gte: new Date("2026-05-01T00:00:00.000Z")
              }
            }
          ]
        },
        orderBy: {
          validFrom: "desc"
        }
      });
    });

    it("throws when no applicable rate exists", async () => {
      prisma.mealRate.findFirst.mockResolvedValue(null);

      await expectAppError(
        service.getApplicableRate(3, "2026-05-01"),
        HTTP_STATUS.NOT_FOUND,
        "MEAL_RATE_NOT_FOUND"
      );
    });

    it("rejects an invalid age", async () => {
      await expectAppError(
        service.getApplicableRate(7, "2026-05-01"),
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        "INVALID_AGE_CATEGORY"
      );
    });
  });

  describe("createRate", () => {
    it("creates a rate by age and writes an audit log", async () => {
      const tx = createTransaction();

      prisma.mealRate.findFirst.mockResolvedValue(null);

      tx.mealRate.create.mockResolvedValue({
        ...validRate,
        amount: 400n
      });

      auditService.createLog.mockResolvedValue({});

      const result = await service.createRate(
        {
          ageYears: 3,
          amount: 400,
          validFrom: "2026-01-01",
          validTo: null
        },
        admin
      );

      expect(result.amount).toBe("400");

      expect(tx.mealRate.create).toHaveBeenCalledWith({
        data: {
          ageYears: 3,
          amount: 400n,
          validFrom: new Date("2026-01-01T00:00:00.000Z"),
          validTo: null
        }
      });

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: admin.id,
          action: "CREATE",
          entityType: "MealRate",
          entityId: validRate.id
        }),
        tx
      );
    });

    it("creates a rate by category", async () => {
      const tx = createTransaction();

      prisma.mealRate.findFirst.mockResolvedValue(null);

      tx.mealRate.create.mockResolvedValue({
        id: "rate-2",
        category: "A3",
        amount: 450n,
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
        validTo: null
      });

      const result = await service.createRate(
        {
          category: "A3",
          amount: 450,
          validFrom: "2026-01-01"
        },
        manager
      );

      expect(result.amount).toBe("450");

      expect(tx.mealRate.create).toHaveBeenCalledWith({
        data: {
          category: "A3",
          amount: 450n,
          validFrom: new Date("2026-01-01T00:00:00.000Z"),
          validTo: null
        }
      });
    });

    it("rejects an invalid age", async () => {
      await expectAppError(
        service.createRate(
          {
            ageYears: 7,
            amount: 400,
            validFrom: "2026-01-01"
          },
          admin
        ),
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        "INVALID_AGE_CATEGORY"
      );
    });

    it("rejects an invalid category", async () => {
      await expectAppError(
        service.createRate(
          {
            category: "A9",
            amount: 400,
            validFrom: "2026-01-01"
          },
          admin
        ),
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        "INVALID_MEAL_CATEGORY"
      );
    });

    it("rejects missing age and category", async () => {
      await expectAppError(
        service.createRate(
          {
            amount: 400,
            validFrom: "2026-01-01"
          },
          admin
        ),
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        "INVALID_AGE_CATEGORY"
      );
    });

    it("rejects an invalid amount", async () => {
      await expectAppError(
        service.createRate(
          {
            ageYears: 3,
            amount: -100,
            validFrom: "2026-01-01"
          },
          admin
        ),
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        "INVALID_MEAL_RATE"
      );
    });

    it("rejects an invalid date", async () => {
      await expectAppError(
        service.createRate(
          {
            ageYears: 3,
            amount: 400,
            validFrom: "2026-02-30"
          },
          admin
        ),
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        "INVALID_DATE"
      );
    });

    it("rejects a period where validTo is earlier than validFrom", async () => {
      await expectAppError(
        service.createRate(
          {
            ageYears: 3,
            amount: 400,
            validFrom: "2026-05-10",
            validTo: "2026-05-01"
          },
          admin
        ),
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        "INVALID_PERIOD"
      );
    });

    it("rejects overlapping rates", async () => {
      prisma.mealRate.findFirst.mockResolvedValue(validRate);

      await expectAppError(
        service.createRate(
          {
            ageYears: 3,
            amount: 450,
            validFrom: "2026-05-01"
          },
          admin
        ),
        HTTP_STATUS.CONFLICT,
        "MEAL_RATE_CONFLICT"
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("calculateMealCost", () => {
    function mockCalculationData({
      attendanceRecords = [
        { date: new Date("2026-05-01T00:00:00.000Z") },
        { date: new Date("2026-05-02T00:00:00.000Z") }
      ],
      enrollments = [
        {
          groupId: "group-1",
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: null,
          group: {
            id: "group-1",
            name: "Group A",
            mealCategory: "A3"
          }
        }
      ],
      rates = [
        {
          id: "rate-1",
          ageYears: 3,
          amount: 400n,
          validFrom: new Date("2026-01-01T00:00:00.000Z"),
          validTo: null
        }
      ]
    } = {}) {
      prisma.child.findUnique.mockResolvedValue(validChild);
      prisma.attendance.findMany.mockResolvedValue(attendanceRecords);
      prisma.groupEnrollment.findMany.mockResolvedValue(enrollments);
      prisma.mealRate.findMany.mockResolvedValue(rates);
    }

    const calculationInput = {
      childId: "child-1",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-02"
    };

    it("calculates the total meal cost", async () => {
      mockCalculationData();

      const result = await service.calculateMealCost(calculationInput, admin);

      expect(result).toEqual({
        childId: "child-1",
        periodStart: "2026-05-01",
        periodEnd: "2026-05-02",
        attendedDays: 2,
        dailyRate: "400",
        rateId: "rate-1",
        rateBreakdown: [
          {
            groupId: "group-1",
            groupName: "Group A",
            category: "A3",
            rateId: "rate-1",
            ageYears: 3,
            dailyRate: "400",
            attendedDays: 2,
            amount: "800",
            validFrom: new Date("2026-01-01T00:00:00.000Z"),
            validTo: null
          }
        ],
        total: "800",
        currency: "UAH",
        analyticsExpenseCategory: "FOOD"
      });
    });

    it("uses the rate matching the group category", async () => {
      mockCalculationData({
        attendanceRecords: [{ date: new Date("2026-05-01T00:00:00.000Z") }],
        rates: [
          {
            id: "rate-a2",
            category: "A2",
            amount: 300n,
            validFrom: new Date("2026-01-01T00:00:00.000Z"),
            validTo: null
          },
          {
            id: "rate-a3",
            category: "A3",
            amount: 450n,
            validFrom: new Date("2026-01-01T00:00:00.000Z"),
            validTo: null
          }
        ]
      });

      const result = await service.calculateMealCost(calculationInput, admin);

      expect(result.total).toBe("450");
      expect(result.rateId).toBe("rate-a3");
    });

    it("supports rates defined by category", async () => {
      mockCalculationData({
        attendanceRecords: [{ date: new Date("2026-05-01T00:00:00.000Z") }],
        rates: [
          {
            id: "rate-category",
            category: "A3",
            amount: 500n,
            validFrom: new Date("2026-01-01T00:00:00.000Z"),
            validTo: null
          }
        ]
      });

      const result = await service.calculateMealCost(calculationInput, admin);

      expect(result.total).toBe("500");
    });

    it("rejects an invalid period", async () => {
      await expectAppError(
        service.calculateMealCost(
          {
            ...calculationInput,
            periodStart: "2026-05-10",
            periodEnd: "2026-05-01"
          },
          admin
        ),
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        "INVALID_PERIOD"
      );
    });

    it("rejects a missing child", async () => {
      prisma.child.findUnique.mockResolvedValue(null);

      await expectAppError(
        service.calculateMealCost(calculationInput, admin),
        HTTP_STATUS.NOT_FOUND,
        "CHILD_NOT_FOUND"
      );
    });

    it("rejects an inactive child", async () => {
      prisma.child.findUnique.mockResolvedValue({
        ...validChild,
        status: "INACTIVE"
      });

      await expectAppError(
        service.calculateMealCost(calculationInput, admin),
        HTTP_STATUS.NOT_FOUND,
        "CHILD_NOT_FOUND"
      );
    });

    it("rejects a group without a meal category", async () => {
      mockCalculationData({
        enrollments: [
          {
            groupId: "group-1",
            startDate: new Date("2026-01-01T00:00:00.000Z"),
            endDate: null,
            group: {
              id: "group-1",
              name: "Group A",
              mealCategory: null
            }
          }
        ]
      });

      await expectAppError(
        service.calculateMealCost(calculationInput, admin),
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        "MEAL_CATEGORY_NOT_CONFIGURED"
      );
    });

    it("rejects a requested age that differs from the group category", async () => {
      mockCalculationData();

      await expectAppError(
        service.calculateMealCost(
          {
            ...calculationInput,
            ageYears: 4
          },
          admin
        ),
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        "MEAL_CATEGORY_MISMATCH"
      );
    });

    it("rejects when no applicable meal rate exists", async () => {
      mockCalculationData({
        rates: []
      });

      await expectAppError(
        service.calculateMealCost(calculationInput, admin),
        HTTP_STATUS.NOT_FOUND,
        "MEAL_RATE_NOT_FOUND"
      );
    });

    it("returns zero total when there are no attendance records", async () => {
      mockCalculationData({
        attendanceRecords: []
      });

      const result = await service.calculateMealCost(calculationInput, admin);

      expect(result.attendedDays).toBe(0);
      expect(result.total).toBe("0");
      expect(result.rateBreakdown).toEqual([]);
      expect(result.dailyRate).toBeNull();
      expect(result.rateId).toBeNull();
    });

    it("checks parent profile before calculating", async () => {
      mockCalculationData();
      prisma.parent.findFirst.mockResolvedValue(null);

      await expectAppError(
        service.calculateMealCost(calculationInput, parentUser),
        HTTP_STATUS.FORBIDDEN,
        "PARENT_PROFILE_NOT_FOUND"
      );

      expect(prisma.parent.findFirst).toHaveBeenCalledWith({
        where: {
          userId: parentUser.id,
          status: "ACTIVE"
        },
        select: {
          id: true
        }
      });
    });

    it("rejects a parent without access to the child", async () => {
      mockCalculationData();
      prisma.parent.findFirst.mockResolvedValue({ id: "parent-1" });
      prisma.childParent.findFirst.mockResolvedValue(null);

      await expectAppError(
        service.calculateMealCost(calculationInput, parentUser),
        HTTP_STATUS.FORBIDDEN,
        "CHILD_ACCESS_DENIED"
      );
    });

    it("allows a parent with an active child relationship", async () => {
      mockCalculationData();
      prisma.parent.findFirst.mockResolvedValue({ id: "parent-1" });
      prisma.childParent.findFirst.mockResolvedValue({
        childId: "child-1",
        parentId: "parent-1"
      });

      const result = await service.calculateMealCost(calculationInput, parentUser);

      expect(result.total).toBe("800");
      expect(prisma.childParent.findFirst).toHaveBeenCalled();
    });

    it("does not check parent relationship for an administrator", async () => {
      mockCalculationData();

      await service.calculateMealCost(calculationInput, admin);

      expect(prisma.parent.findFirst).not.toHaveBeenCalled();
      expect(prisma.childParent.findFirst).not.toHaveBeenCalled();
    });
  });
});

describe("meals controller", () => {
  function createResponse() {
    return {
      locals: {
        validated: {
          query: {},
          body: {}
        }
      },
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("getRates returns rates", async () => {
    const data = [validRate];
    const query = { ageYears: 3 };
    const res = createResponse();

    res.locals.validated.query = query;

    jest.spyOn(service, "getAllRates").mockResolvedValue(data);

    await controller.getRates({}, res);

    expect(service.getAllRates).toHaveBeenCalledWith(query);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data
    });
  });

  it("createRate returns the created rate", async () => {
    const data = validRate;
    const body = {
      ageYears: 3,
      amount: 400,
      validFrom: "2026-01-01"
    };
    const res = createResponse();

    res.locals.validated.body = body;

    jest.spyOn(service, "createRate").mockResolvedValue(data);

    await controller.createRate({ user: admin }, res);

    expect(service.createRate).toHaveBeenCalledWith(body, admin);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data
    });
  });

  it("calculate returns the meal cost calculation", async () => {
    const data = {
      childId: "child-1",
      total: "800"
    };
    const body = {
      childId: "child-1",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-02"
    };
    const res = createResponse();

    res.locals.validated.body = body;

    jest.spyOn(service, "calculateMealCost").mockResolvedValue(data);

    await controller.calculate({ user: parentUser }, res);

    expect(service.calculateMealCost).toHaveBeenCalledWith(body, parentUser);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data
    });
  });
});

describe("meals validation", () => {
  const validObjectId = "123456789012123456789012";

  describe("createMealRateSchema", () => {
    it("accepts a valid rate by age", () => {
      const result = createMealRateSchema.validate({
        ageYears: 3,
        amount: 400,
        validFrom: "2026-01-01",
        validTo: null
      });

      expect(result.error).toBeUndefined();
    });

    it("accepts a valid rate by category", () => {
      const result = createMealRateSchema.validate({
        category: "A3",
        amount: 400,
        validFrom: "2026-01-01"
      });

      expect(result.error).toBeUndefined();
    });

    it("rejects missing age and category", () => {
      const result = createMealRateSchema.validate({
        amount: 400,
        validFrom: "2026-01-01"
      });

      expect(result.error).toBeDefined();
    });

    it("rejects both age and category", () => {
      const result = createMealRateSchema.validate({
        ageYears: 3,
        category: "A3",
        amount: 400,
        validFrom: "2026-01-01"
      });

      expect(result.error).toBeDefined();
    });

    it("rejects an invalid amount", () => {
      const result = createMealRateSchema.validate({
        ageYears: 3,
        amount: -10,
        validFrom: "2026-01-01"
      });

      expect(result.error).toBeDefined();
    });

    it("rejects an invalid age", () => {
      const result = createMealRateSchema.validate({
        ageYears: 7,
        amount: 400,
        validFrom: "2026-01-01"
      });

      expect(result.error).toBeDefined();
    });

    it("rejects an invalid category", () => {
      const result = createMealRateSchema.validate({
        category: "A9",
        amount: 400,
        validFrom: "2026-01-01"
      });

      expect(result.error).toBeDefined();
    });

    it("rejects an invalid calendar date", () => {
      const result = createMealRateSchema.validate({
        ageYears: 3,
        amount: 400,
        validFrom: "2026-02-30"
      });

      expect(result.error).toBeDefined();
    });

    it("rejects validTo earlier than validFrom", () => {
      const result = createMealRateSchema.validate({
        ageYears: 3,
        amount: 400,
        validFrom: "2026-05-10",
        validTo: "2026-05-01"
      });

      expect(result.error).toBeDefined();
    });

    it("accepts null validTo", () => {
      const result = createMealRateSchema.validate({
        ageYears: 3,
        amount: 400,
        validFrom: "2026-01-01",
        validTo: null
      });

      expect(result.error).toBeUndefined();
    });
  });

  describe("rateQuerySchema", () => {
    it("accepts an empty query", () => {
      expect(rateQuerySchema.validate({}).error).toBeUndefined();
    });

    it("accepts a query by age", () => {
      expect(
        rateQuerySchema.validate({
          ageYears: 3
        }).error
      ).toBeUndefined();
    });

    it("accepts a query by category", () => {
      expect(
        rateQuerySchema.validate({
          category: "A3"
        }).error
      ).toBeUndefined();
    });

    it("accepts a query by date", () => {
      expect(
        rateQuerySchema.validate({
          onDate: "2026-05-01"
        }).error
      ).toBeUndefined();
    });

    it("rejects simultaneous age and category", () => {
      expect(
        rateQuerySchema.validate({
          ageYears: 3,
          category: "A3"
        }).error
      ).toBeDefined();
    });

    it("rejects an invalid date", () => {
      expect(
        rateQuerySchema.validate({
          onDate: "2026-02-30"
        }).error
      ).toBeDefined();
    });
  });

  describe("calculateMealSchema", () => {
    it("accepts valid calculation data", () => {
      const result = calculateMealSchema.validate({
        childId: validObjectId,
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31",
        ageYears: 3
      });

      expect(result.error).toBeUndefined();
    });

    it("accepts calculation data without optional age", () => {
      const result = calculateMealSchema.validate({
        childId: validObjectId,
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31"
      });

      expect(result.error).toBeUndefined();
    });

    it("rejects an invalid childId", () => {
      const result = calculateMealSchema.validate({
        childId: "invalid-id",
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31"
      });

      expect(result.error).toBeDefined();
    });

    it("rejects a missing childId", () => {
      const result = calculateMealSchema.validate({
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31"
      });

      expect(result.error).toBeDefined();
    });

    it("rejects a missing periodStart", () => {
      const result = calculateMealSchema.validate({
        childId: validObjectId,
        periodEnd: "2026-05-31"
      });

      expect(result.error).toBeDefined();
    });

    it("rejects a missing periodEnd", () => {
      const result = calculateMealSchema.validate({
        childId: validObjectId,
        periodStart: "2026-05-01"
      });

      expect(result.error).toBeDefined();
    });

    it("rejects start date later than end date", () => {
      const result = calculateMealSchema.validate({
        childId: validObjectId,
        periodStart: "2026-05-31",
        periodEnd: "2026-05-01"
      });

      expect(result.error).toBeDefined();
    });

    it("rejects an invalid age", () => {
      const result = calculateMealSchema.validate({
        childId: validObjectId,
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31",
        ageYears: 7
      });

      expect(result.error).toBeDefined();
    });
  });
});

describe("meals routes", () => {
  function getRoute(path, method) {
    return router.stack.find(
      (layer) => layer.route && layer.route.path === path && layer.route.methods[method]
    );
  }

  it("registers authentication middleware", () => {
    const requireAuth = require("../../src/middleware/auth.middleware");

    expect(router.stack[0].handle).toBe(requireAuth);
  });

  it("registers GET /rates with query validation", () => {
    const route = getRoute("/rates", "get");

    expect(route).toBeDefined();
    expect(route.route.stack[0].handle.validationProperty).toBe("query");
    expect(route.route.stack[0].handle.schema).toBe(rateQuerySchema);
  });

  it("registers POST /rates with management roles and body validation", () => {
    const route = getRoute("/rates", "post");

    expect(route).toBeDefined();
    expect(route.route.stack[0].handle.allowedRoles).toEqual(["ADMIN", "MANAGER"]);
    expect(route.route.stack[1].handle.validationProperty).toBe("body");
    expect(route.route.stack[1].handle.schema).toBe(createMealRateSchema);
  });

  it("registers POST /calculate with admin, manager and parent roles", () => {
    const route = getRoute("/calculate", "post");

    expect(route).toBeDefined();
    expect(route.route.stack[0].handle.allowedRoles).toEqual(["ADMIN", "MANAGER", "PARENT"]);
    expect(route.route.stack[1].handle.validationProperty).toBe("body");
    expect(route.route.stack[1].handle.schema).toBe(calculateMealSchema);
  });
});
