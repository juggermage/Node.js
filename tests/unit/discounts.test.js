const prisma = require("../../src/config/prisma");
const discountsService = require("../../src/modules/billing/discounts/discounts.service");

jest.mock("../../src/config/prisma", () => ({
  discount: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  }
}));

const discount = {
  id: "discount-1",
  name: "Sibling discount",
  type: "PERCENTAGE",
  percentage: 10,
  isActive: true
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Discounts service", () => {
  describe("create", () => {
    test("creates a discount with normalized name", async () => {
      prisma.discount.findFirst.mockResolvedValue(null);
      prisma.discount.create.mockResolvedValue(discount);

      const result = await discountsService.create({
        name: "  Sibling discount  ",
        value: 10
      });

      expect(prisma.discount.findFirst).toHaveBeenCalledWith({
        where: {
          name: {
            equals: "Sibling discount",
            mode: "insensitive"
          }
        }
      });

      expect(prisma.discount.create).toHaveBeenCalledWith({
        data: {
          name: "Sibling discount",
          type: "PERCENTAGE",
          percentage: 10,
          isActive: true
        }
      });

      expect(result).toEqual(discount);
    });

    test.each([10, 20, 30])("accepts discount value %i", async (value) => {
      prisma.discount.findFirst.mockResolvedValue(null);
      prisma.discount.create.mockResolvedValue({
        ...discount,
        percentage: value
      });

      await expect(discountsService.create({ name: "Discount", value })).resolves.toMatchObject({
        percentage: value
      });
    });

    test("rejects unsupported discount value", async () => {
      await expect(discountsService.create({ name: "Discount", value: 15 })).rejects.toMatchObject({
        code: "INVALID_DISCOUNT_VALUE"
      });

      expect(prisma.discount.create).not.toHaveBeenCalled();
    });

    test("rejects duplicate discount name", async () => {
      prisma.discount.findFirst.mockResolvedValue(discount);

      await expect(
        discountsService.create({ name: "Sibling discount", value: 10 })
      ).rejects.toMatchObject({ code: "DISCOUNT_NAME_EXISTS" });

      expect(prisma.discount.create).not.toHaveBeenCalled();
    });

    test("converts Prisma unique constraint error", async () => {
      prisma.discount.findFirst.mockResolvedValue(null);
      prisma.discount.create.mockRejectedValue({ code: "P2002" });

      await expect(discountsService.create({ name: "Discount", value: 10 })).rejects.toMatchObject({
        code: "DISCOUNT_NAME_EXISTS"
      });
    });
  });

  describe("getAll", () => {
    test("returns only active discounts by default", async () => {
      prisma.discount.findMany.mockResolvedValue([discount]);

      const result = await discountsService.getAll();

      expect(prisma.discount.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { percentage: "asc" }
      });

      expect(result).toEqual([discount]);
    });

    test("includes inactive discounts when requested", async () => {
      prisma.discount.findMany.mockResolvedValue([discount]);

      await discountsService.getAll(true);

      expect(prisma.discount.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { percentage: "asc" }
      });
    });
  });

  describe("getById", () => {
    test("returns discount by ID", async () => {
      prisma.discount.findUnique.mockResolvedValue(discount);

      const result = await discountsService.getById("discount-1");

      expect(prisma.discount.findUnique).toHaveBeenCalledWith({
        where: { id: "discount-1" }
      });

      expect(result).toEqual(discount);
    });

    test("rejects when discount does not exist", async () => {
      prisma.discount.findUnique.mockResolvedValue(null);

      await expect(discountsService.getById("missing")).rejects.toMatchObject({
        code: "DISCOUNT_NOT_FOUND"
      });
    });
  });

  describe("deactivate", () => {
    test("deactivates an existing discount", async () => {
      prisma.discount.findUnique.mockResolvedValue(discount);
      prisma.discount.update.mockResolvedValue({
        ...discount,
        isActive: false
      });

      const result = await discountsService.deactivate("discount-1");

      expect(prisma.discount.update).toHaveBeenCalledWith({
        where: { id: "discount-1" },
        data: { isActive: false }
      });

      expect(result.isActive).toBe(false);
    });

    test("rejects when discount does not exist", async () => {
      prisma.discount.findUnique.mockResolvedValue(null);

      await expect(discountsService.deactivate("missing")).rejects.toMatchObject({
        code: "DISCOUNT_NOT_FOUND"
      });

      expect(prisma.discount.update).not.toHaveBeenCalled();
    });

    test("converts Prisma record not found error", async () => {
      prisma.discount.findUnique.mockResolvedValue(discount);
      prisma.discount.update.mockRejectedValue({ code: "P2025" });

      await expect(discountsService.deactivate("discount-1")).rejects.toMatchObject({
        code: "DISCOUNT_NOT_FOUND"
      });
    });
  });
});
