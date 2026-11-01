jest.mock("../../src/config/prisma", () => ({
  tuitionRate: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn()
  },
  child: {
    findUnique: jest.fn()
  },
  childDiscount: {
    findMany: jest.fn()
  }
}));

const prisma = require("../../src/config/prisma");
const HTTP_STATUS = require("../../src/utils/http-status");

const service = require("../../src/modules/billing/tuition/tuition.service");

const {
  createTuitionRateSchema,
  rateQuerySchema,
  calculateMonthlyTuitionSchema,
  calculateAnnualTuitionSchema
} = require("../../src/modules/billing/tuition/tuition.validation");

const childId = "507f1f77bcf86cd799439011";

const rate = {
  id: "rate-1",
  name: "Основний тариф",
  amount: 15000n,
  validFrom: new Date("2026-01-01T00:00:00.000Z"),
  validTo: null
};

beforeEach(() => {
  jest.clearAllMocks();

  prisma.tuitionRate.findMany.mockResolvedValue([]);
  prisma.tuitionRate.findFirst.mockResolvedValue(null);
  prisma.tuitionRate.create.mockResolvedValue(rate);

  prisma.child.findUnique.mockResolvedValue({
    id: childId,
    status: "ACTIVE"
  });

  prisma.childDiscount.findMany.mockResolvedValue([]);
});

describe("Tuition validation", () => {
  describe("createTuitionRateSchema", () => {
    const validData = {
      name: "Основний тариф",
      amount: 15000,
      validFrom: "2026-01-01",
      validTo: null
    };

    test("should accept valid tuition rate", () => {
      const { error } = createTuitionRateSchema.validate(validData);

      expect(error).toBeUndefined();
    });

    test("should reject short name", () => {
      const { error } = createTuitionRateSchema.validate({
        ...validData,
        name: "A"
      });

      expect(error).toBeDefined();
    });

    test("should reject negative amount", () => {
      const { error } = createTuitionRateSchema.validate({
        ...validData,
        amount: -100
      });

      expect(error).toBeDefined();
    });

    test("should reject invalid date format", () => {
      const { error } = createTuitionRateSchema.validate({
        ...validData,
        validFrom: "01-01-2026"
      });

      expect(error).toBeDefined();
    });

    test("should reject invalid calendar date", () => {
      const { error } = createTuitionRateSchema.validate({
        ...validData,
        validFrom: "2026-02-30"
      });

      expect(error).toBeDefined();
    });

    test("should reject validTo earlier than validFrom", () => {
      const { error } = createTuitionRateSchema.validate({
        ...validData,
        validTo: "2025-12-31"
      });

      expect(error).toBeDefined();
    });

    test("should apply default amount", () => {
      const { value } = createTuitionRateSchema.validate({
        name: "Основний тариф",
        validFrom: "2026-01-01"
      });

      expect(value.amount).toBe(15000);
    });
  });

  describe("rateQuerySchema", () => {
    test("should accept valid onDate", () => {
      const { error } = rateQuerySchema.validate({
        onDate: "2026-01-15"
      });

      expect(error).toBeUndefined();
    });

    test("should reject invalid onDate", () => {
      const { error } = rateQuerySchema.validate({
        onDate: "2026-02-30"
      });

      expect(error).toBeDefined();
    });

    test("should accept empty query", () => {
      const { error } = rateQuerySchema.validate({});

      expect(error).toBeUndefined();
    });
  });

  describe("calculateMonthlyTuitionSchema", () => {
    const validData = {
      childId,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31"
    };

    test("should accept valid monthly calculation data", () => {
      const { error } = calculateMonthlyTuitionSchema.validate(validData);

      expect(error).toBeUndefined();
    });

    test("should reject invalid childId", () => {
      const { error } = calculateMonthlyTuitionSchema.validate({
        ...validData,
        childId: "invalid"
      });

      expect(error).toBeDefined();
    });

    test("should reject periodStart later than periodEnd", () => {
      const { error } = calculateMonthlyTuitionSchema.validate({
        ...validData,
        periodStart: "2026-02-01",
        periodEnd: "2026-01-31"
      });

      expect(error).toBeDefined();
    });
  });

  describe("calculateAnnualTuitionSchema", () => {
    test("should accept valid annual calculation data", () => {
      const { error } = calculateAnnualTuitionSchema.validate({
        childId,
        periodStart: "2026-01-01"
      });

      expect(error).toBeUndefined();
    });

    test("should reject invalid childId", () => {
      const { error } = calculateAnnualTuitionSchema.validate({
        childId: "invalid",
        periodStart: "2026-01-01"
      });

      expect(error).toBeDefined();
    });

    test("should require periodStart", () => {
      const { error } = calculateAnnualTuitionSchema.validate({
        childId
      });

      expect(error).toBeDefined();
    });
  });
});

describe("Tuition service", () => {
  describe("getAllRates", () => {
    test("should return all rates", async () => {
      prisma.tuitionRate.findMany.mockResolvedValue([rate]);

      const result = await service.getAllRates();

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe("15000");

      expect(prisma.tuitionRate.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { validFrom: "desc" }
      });
    });

    test("should filter rates by date", async () => {
      await service.getAllRates({
        onDate: "2026-01-15"
      });

      const date = new Date("2026-01-15T00:00:00.000Z");

      expect(prisma.tuitionRate.findMany).toHaveBeenCalledWith({
        where: {
          validFrom: { lte: date },
          OR: [{ validTo: null }, { validTo: { gte: date } }]
        },
        orderBy: { validFrom: "desc" }
      });
    });
  });

  describe("getApplicableRate", () => {
    test("should return applicable rate", async () => {
      prisma.tuitionRate.findFirst.mockResolvedValue(rate);

      const result = await service.getApplicableRate("2026-01-15");

      expect(result).toEqual(rate);
    });

    test("should throw when rate is not found", async () => {
      await expect(service.getApplicableRate("2026-01-15")).rejects.toMatchObject({
        statusCode: HTTP_STATUS.NOT_FOUND,
        code: "TUITION_RATE_NOT_FOUND"
      });
    });
  });

  describe("createRate", () => {
    test("should create a tuition rate", async () => {
      prisma.tuitionRate.create.mockResolvedValue(rate);

      const result = await service.createRate({
        name: " Основний тариф ",
        amount: 15000,
        validFrom: "2026-01-01"
      });

      expect(prisma.tuitionRate.create).toHaveBeenCalledWith({
        data: {
          name: "Основний тариф",
          amount: 15000n,
          validFrom: new Date("2026-01-01T00:00:00.000Z"),
          validTo: null
        }
      });

      expect(result.amount).toBe("15000");
    });

    test("should reject invalid amount", async () => {
      await expect(
        service.createRate({
          name: "Основний тариф",
          amount: -100,
          validFrom: "2026-01-01"
        })
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.UNPROCESSABLE_ENTITY,
        code: "INVALID_TUITION_RATE"
      });

      expect(prisma.tuitionRate.create).not.toHaveBeenCalled();
    });

    test("should reject empty name", async () => {
      await expect(
        service.createRate({
          name: "   ",
          amount: 15000,
          validFrom: "2026-01-01"
        })
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.UNPROCESSABLE_ENTITY,
        code: "INVALID_RATE_NAME"
      });
    });

    test("should reject invalid period", async () => {
      await expect(
        service.createRate({
          name: "Основний тариф",
          amount: 15000,
          validFrom: "2026-02-01",
          validTo: "2026-01-01"
        })
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.UNPROCESSABLE_ENTITY,
        code: "INVALID_PERIOD"
      });
    });

    test("should reject overlapping rates", async () => {
      prisma.tuitionRate.findFirst.mockResolvedValue(rate);

      await expect(
        service.createRate({
          name: "Новий тариф",
          amount: 18000,
          validFrom: "2026-02-01"
        })
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.CONFLICT,
        code: "TUITION_RATE_CONFLICT"
      });

      expect(prisma.tuitionRate.create).not.toHaveBeenCalled();
    });
  });

  describe("validatePeriod", () => {
    test("should return valid period with number of days", () => {
      const result = service.validatePeriod("2026-01-01", "2026-01-31");

      expect(result.days).toBe(31);
      expect(result.from).toEqual(new Date("2026-01-01T00:00:00.000Z"));
      expect(result.to).toEqual(new Date("2026-01-31T00:00:00.000Z"));
    });

    test("should reject invalid date", () => {
      expect(() => service.validatePeriod("2026-02-30", "2026-03-01")).toThrow(
        expect.objectContaining({
          code: "INVALID_DATE"
        })
      );
    });

    test("should reject reversed period", () => {
      expect(() => service.validatePeriod("2026-02-01", "2026-01-01")).toThrow(
        expect.objectContaining({
          code: "INVALID_PERIOD"
        })
      );
    });
  });

  describe("roundPercentage", () => {
    test("should calculate percentage with rounding", () => {
      expect(service.roundPercentage(10000n, 10)).toBe(9000n);
      expect(service.roundPercentage(10000n, 20)).toBe(8000n);
      expect(service.roundPercentage(10000n, 30)).toBe(7000n);
    });

    test("should round the result correctly", () => {
      expect(service.roundPercentage(1001n, 10)).toBe(901n);
    });
  });

  describe("calculateMonthlyTuitionCost", () => {
    test("should calculate monthly tuition without discount", async () => {
      prisma.tuitionRate.findFirst.mockResolvedValue(rate);

      const result = await service.calculateMonthlyTuitionCost({
        childId,
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31"
      });

      expect(result).toMatchObject({
        childId,
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31",
        months: 1,
        monthlyAmount: "15000",
        baseAmount: "15000",
        discount: null,
        annualPrepaymentDiscount: null,
        total: "15000",
        currency: "UAH"
      });
    });

    test("should calculate monthly tuition with discount", async () => {
      prisma.tuitionRate.findFirst.mockResolvedValue(rate);

      prisma.childDiscount.findMany.mockResolvedValue([
        {
          validFrom: new Date("2025-12-01T00:00:00.000Z"),
          validTo: null,
          discount: {
            id: "discount-1",
            name: "Знижка 10%",
            type: "PERCENTAGE",
            percentage: 10,
            isActive: true
          }
        }
      ]);

      const result = await service.calculateMonthlyTuitionCost({
        childId,
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31"
      });

      expect(result.total).toBe("13500");

      expect(result.discount).toMatchObject({
        id: "discount-1",
        name: "Знижка 10%",
        percentage: 10,
        amount: "1500"
      });
    });

    test("should reject incomplete calendar month", async () => {
      await expect(
        service.calculateMonthlyTuitionCost({
          childId,
          periodStart: "2026-01-05",
          periodEnd: "2026-01-31"
        })
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.UNPROCESSABLE_ENTITY,
        code: "INVALID_TUITION_PERIOD"
      });
    });

    test("should reject inactive child", async () => {
      prisma.child.findUnique.mockResolvedValue({
        id: childId,
        status: "INACTIVE"
      });

      await expect(
        service.calculateMonthlyTuitionCost({
          childId,
          periodStart: "2026-01-01",
          periodEnd: "2026-01-31"
        })
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.NOT_FOUND,
        code: "CHILD_NOT_FOUND"
      });
    });

    test("should reject when rate changes during period", async () => {
      prisma.tuitionRate.findFirst.mockResolvedValue({
        ...rate,
        validTo: new Date("2026-01-15T00:00:00.000Z")
      });

      await expect(
        service.calculateMonthlyTuitionCost({
          childId,
          periodStart: "2026-01-01",
          periodEnd: "2026-01-31"
        })
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.CONFLICT,
        code: "RATE_PERIOD_CONFLICT"
      });
    });

    test("should reject multiple applicable discounts", async () => {
      prisma.tuitionRate.findFirst.mockResolvedValue(rate);

      prisma.childDiscount.findMany.mockResolvedValue([
        {
          validFrom: new Date("2025-12-01T00:00:00.000Z"),
          validTo: null,
          discount: {
            id: "discount-1",
            name: "Знижка 10%",
            type: "PERCENTAGE",
            percentage: 10
          }
        },
        {
          validFrom: new Date("2025-12-01T00:00:00.000Z"),
          validTo: null,
          discount: {
            id: "discount-2",
            name: "Знижка 20%",
            type: "PERCENTAGE",
            percentage: 20
          }
        }
      ]);

      await expect(
        service.calculateMonthlyTuitionCost({
          childId,
          periodStart: "2026-01-01",
          periodEnd: "2026-01-31"
        })
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.CONFLICT,
        code: "MULTIPLE_DISCOUNTS"
      });
    });
  });

  describe("calculateAnnualTuitionCost", () => {
    test("should calculate annual tuition with prepayment discount", async () => {
      prisma.tuitionRate.findFirst.mockResolvedValue(rate);

      const result = await service.calculateAnnualTuitionCost({
        childId,
        periodStart: "2026-01-01"
      });

      expect(result).toMatchObject({
        childId,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
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
    });

    test("should calculate annual tuition with regular discount", async () => {
      prisma.tuitionRate.findFirst.mockResolvedValue(rate);

      prisma.childDiscount.findMany.mockResolvedValue([
        {
          validFrom: new Date("2025-12-01T00:00:00.000Z"),
          validTo: null,
          discount: {
            id: "discount-1",
            name: "Знижка 10%",
            type: "PERCENTAGE",
            percentage: 10
          }
        }
      ]);

      const result = await service.calculateAnnualTuitionCost({
        childId,
        periodStart: "2026-01-01"
      });

      expect(result.baseAmount).toBe("180000");
      expect(result.discount.amount).toBe("18000");
      expect(result.annualPrepaymentDiscount.amount).toBe("19440");
      expect(result.total).toBe("142560");
    });

    test("should reject annual period not starting on first day", async () => {
      await expect(
        service.calculateAnnualTuitionCost({
          childId,
          periodStart: "2026-01-15"
        })
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.UNPROCESSABLE_ENTITY,
        code: "INVALID_TUITION_PERIOD"
      });
    });

    test("should reject inactive child", async () => {
      prisma.child.findUnique.mockResolvedValue(null);

      await expect(
        service.calculateAnnualTuitionCost({
          childId,
          periodStart: "2026-01-01"
        })
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.NOT_FOUND,
        code: "CHILD_NOT_FOUND"
      });
    });
  });
});
