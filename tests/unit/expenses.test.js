
const prisma = require("../../src/config/prisma");
const expensesService = require("../../src/modules/billing/expenses/expenses.service");

jest.mock("../../src/config/prisma", () => ({
  expense: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn()
  }
}));

const expense = {
  id: "expense-1",
  category: "FOOD",
  description: "Food supplies",
  amount: 15000n,
  expenseDate: new Date("2026-10-15T00:00:00.000Z"),
  createdAt: new Date("2026-10-15T10:00:00.000Z")
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Expenses service", () => {
  describe("getAll", () => {
    test("returns all expenses and converts BigInt amount to Number", async () => {
      prisma.expense.findMany.mockResolvedValue([expense]);

      const result = await expensesService.getAll();

      expect(prisma.expense.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: [
          { expenseDate: "desc" },
          { createdAt: "desc" }
        ]
      });

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(15000);
      expect(typeof result[0].amount).toBe("number");
    });

    test("filters expenses by category", async () => {
      prisma.expense.findMany.mockResolvedValue([expense]);

      await expensesService.getAll({ category: "FOOD" });

      expect(prisma.expense.findMany).toHaveBeenCalledWith({
        where: { category: "FOOD" },
        orderBy: [
          { expenseDate: "desc" },
          { createdAt: "desc" }
        ]
      });
    });

    test("filters expenses by date range", async () => {
      prisma.expense.findMany.mockResolvedValue([]);

      await expensesService.getAll({
        from: "2026-10-01",
        to: "2026-10-31"
      });

      expect(prisma.expense.findMany).toHaveBeenCalledWith({
        where: {
          expenseDate: {
            gte: new Date("2026-10-01T00:00:00.000Z"),
            lt: new Date("2026-11-01T00:00:00.000Z")
          }
        },
        orderBy: [
          { expenseDate: "desc" },
          { createdAt: "desc" }
        ]
      });
    });

    test("filters expenses using only the start date", async () => {
      prisma.expense.findMany.mockResolvedValue([]);

      await expensesService.getAll({ from: "2026-10-01" });

      expect(prisma.expense.findMany).toHaveBeenCalledWith({
        where: {
          expenseDate: {
            gte: new Date("2026-10-01T00:00:00.000Z")
          }
        },
        orderBy: [
          { expenseDate: "desc" },
          { createdAt: "desc" }
        ]
      });
    });

    test("filters expenses using only the end date", async () => {
      prisma.expense.findMany.mockResolvedValue([]);

      await expensesService.getAll({ to: "2026-10-31" });

      expect(prisma.expense.findMany).toHaveBeenCalledWith({
        where: {
          expenseDate: {
            lt: new Date("2026-11-01T00:00:00.000Z")
          }
        },
        orderBy: [
          { expenseDate: "desc" },
          { createdAt: "desc" }
        ]
      });
    });

    test("returns an empty array when no expenses exist", async () => {
      prisma.expense.findMany.mockResolvedValue([]);

      const result = await expensesService.getAll();

      expect(result).toEqual([]);
    });
  });

  describe("getById", () => {
    test("returns expense by ID", async () => {
      prisma.expense.findUnique.mockResolvedValue(expense);

      const result = await expensesService.getById("expense-1");

      expect(prisma.expense.findUnique).toHaveBeenCalledWith({
        where: { id: "expense-1" }
      });

      expect(result.amount).toBe(15000);
    });

    test("rejects when expense does not exist", async () => {
      prisma.expense.findUnique.mockResolvedValue(null);

      await expect(
        expensesService.getById("missing")
      ).rejects.toMatchObject({
        code: "EXPENSE_NOT_FOUND"
      });
    });
  });

  describe("create", () => {
    test("creates an expense and converts amount to BigInt", async () => {
      prisma.expense.create.mockResolvedValue(expense);

      const result = await expensesService.create({
        category: "FOOD",
        description: "Food supplies",
        amount: 15000,
        expenseDate: "2026-10-15"
      });

      expect(prisma.expense.create).toHaveBeenCalledWith({
        data: {
          category: "FOOD",
          description: "Food supplies",
          amount: 15000n,
          expenseDate: new Date("2026-10-15T00:00:00.000Z")
        }
      });

      expect(result.amount).toBe(15000);
    });

    test("returns created expense with numeric amount", async () => {
      prisma.expense.create.mockResolvedValue(expense);

      const result = await expensesService.create({
        category: "FOOD",
        description: "Food supplies",
        amount: 15000,
        expenseDate: "2026-10-15"
      });

      expect(typeof result.amount).toBe("number");
    });
  });
});
