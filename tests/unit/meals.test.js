jest.mock("../../src/config/prisma", () => ({
  child: {
    findUnique: jest.fn()
  },
  mealRate: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn()
  }
}));

const prisma = require("../../src/config/prisma");
const mealsService = require("../../src/modules/billing/meals/meals.service");

describe("Meals service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("calculateAge", () => {
    test("calculates child's age correctly", () => {
      expect(
        mealsService.calculateAge("2022-05-10", new Date("2026-05-10T00:00:00.000Z"))
      ).toBe(4);
    });

    test("does not increase age before birthday", () => {
      expect(
        mealsService.calculateAge("2022-05-10", new Date("2026-05-09T00:00:00.000Z"))
      ).toBe(3);
    });

    test("rejects invalid birth date", () => {
      expect(() =>
        mealsService.calculateAge("invalid", new Date("2026-05-10T00:00:00.000Z"))
      ).toThrow("Invalid birth date");
    });
  });

  describe("validatePeriod", () => {
    test("calculates inclusive period length", () => {
      const result = mealsService.validatePeriod("2026-05-01", "2026-05-31");

      expect(result.days).toBe(31);
    });

    test("accepts a single-day period", () => {
      const result = mealsService.validatePeriod("2026-05-10", "2026-05-10");

      expect(result.days).toBe(1);
    });

    test("rejects period when start is after end", () => {
      expect(() =>
        mealsService.validatePeriod("2026-05-20", "2026-05-10")
      ).toThrow("Period start is after period end");
    });

    test("rejects invalid date format", () => {
      expect(() =>
        mealsService.validatePeriod("10.05.2026", "2026-05-20")
      ).toThrow("Invalid date");
    });
  });

  describe("calculateAmount", () => {
    test.each([
      [300, 10, 31, 3000n],
      [400, 15, 31, 6000n],
      [500, 20, 31, 10000n],
      [600, 31, 31, 18600n],
      [300, 0, 31, 0n]
    ])(
      "calculates amount for rate %i and %i attended days",
      (rate, attendedDays, maximumDays, expected) => {
        expect(
          mealsService.calculateAmount(rate, attendedDays, maximumDays)
        ).toBe(expected);
      }
    );

    test("rejects negative attendance days", () => {
      expect(() =>
        mealsService.calculateAmount(300, -1, 31)
      ).toThrow("Invalid attendance days");
    });

    test("rejects attendance days exceeding period", () => {
      expect(() =>
        mealsService.calculateAmount(300, 32, 31)
      ).toThrow("Invalid attendance days");
    });

    test("rejects invalid meal rate", () => {
      expect(() =>
        mealsService.calculateAmount(0, 10, 31)
      ).toThrow("Invalid meal rate");
    });
  });

  describe("calculateMealCost", () => {
    test("calculates meal cost using child's actual age and applicable rate", async () => {
      prisma.child.findUnique.mockResolvedValue({
        id: "child-1",
        birthDate: new Date("2022-05-10T00:00:00.000Z"),
        status: "ACTIVE"
      });

      prisma.mealRate.findFirst.mockResolvedValue({
        id: "rate-1",
        ageYears: 4,
        amount: 500n,
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
        validTo: null
      });

      const result = await mealsService.calculateMealCost({
        childId: "child-1",
        periodStart: "2026-05-10",
        periodEnd: "2026-05-20",
        attendedDays: 8
      });

      expect(result).toEqual({
        childId: "child-1",
        ageYears: 4,
        periodStart: "2026-05-10",
        periodEnd: "2026-05-20",
        attendedDays: 8,
        rateId: "rate-1",
        dailyRate: "500",
        total: "4000",
        currency: "UAH"
      });
    });

    test("rejects missing child", async () => {
      prisma.child.findUnique.mockResolvedValue(null);

      await expect(
        mealsService.calculateMealCost({
          childId: "missing-child",
          periodStart: "2026-05-10",
          periodEnd: "2026-05-20",
          attendedDays: 8
        })
      ).rejects.toThrow("Child not found");
    });

    test("rejects age category mismatch", async () => {
      prisma.child.findUnique.mockResolvedValue({
        id: "child-1",
        birthDate: new Date("2022-05-10T00:00:00.000Z"),
        status: "ACTIVE"
      });

      await expect(
        mealsService.calculateMealCost({
          childId: "child-1",
          periodStart: "2026-05-10",
          periodEnd: "2026-05-20",
          attendedDays: 8,
          ageYears: 3
        })
      ).rejects.toThrow("Age category does not match child");

      expect(prisma.mealRate.findFirst).not.toHaveBeenCalled();
    });
  });
});