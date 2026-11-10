
jest.mock("../../src/config/prisma", () => ({
  expense: {
    findMany: jest.fn(),
    findUnique: jest.fn()
  },
  $transaction: jest.fn()
}));

jest.mock("../../src/modules/audit/audit.service", () => ({
  createLog: jest.fn()
}));

jest.mock("../../src/middleware/validate.middleware", () =>
  jest.fn(() => (req, res, next) => next())
);

jest.mock("../../src/middleware/auth.middleware", () =>
  jest.fn((req, res, next) => next())
);

jest.mock("../../src/middleware/rbac.middleware", () =>
  jest.fn(() => (req, res, next) => next())
);

const prisma = require("../../src/config/prisma");
const auditService = require("../../src/modules/audit/audit.service");
const { ExpenseCategory } = require("@prisma/client");

const service = require("../../src/modules/billing/expenses/expenses.service");
const controller = require("../../src/modules/billing/expenses/expenses.controller");

const {
  createExpenseSchema,
  expenseIdSchema,
  listExpensesSchema
} = require("../../src/modules/billing/expenses/expenses.validation");

const HTTP_STATUS = require("../../src/utils/http-status");
const router = require("../../src/modules/billing/expenses/expenses.routes");

const validId = "507f1f77bcf86cd799439011";
const groupId = "507f1f77bcf86cd799439012";
const actorId = "507f1f77bcf86cd799439013";

const category = Object.values(ExpenseCategory)[0];

const expense = {
  id: validId,
  category,
  description: "Office supplies",
  amount: BigInt(15000),
  expenseDate: new Date("2026-01-15T00:00:00.000Z"),
  groupId: null,
  createdAt: new Date("2026-01-15T10:00:00.000Z")
};

const serializedExpense = {
  ...expense,
  amount: 15000
};

function createResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    locals: {
      validated: {
        body: {},
        query: {},
        params: {}
      }
    }
  };
}

describe("Expenses validation", () => {
  describe("createExpenseSchema", () => {
    const validData = {
      category,
      description: "Office supplies",
      amount: 15000,
      expenseDate: "2026-01-15"
    };

    it("should accept valid expense data", () => {
      const { error, value } = createExpenseSchema.validate(validData);

      expect(error).toBeUndefined();
      expect(value).toEqual(validData);
    });

    it("should accept a valid groupId", () => {
      const { error } = createExpenseSchema.validate({
        ...validData,
        groupId
      });

      expect(error).toBeUndefined();
    });

    it("should accept a null groupId", () => {
      const { error } = createExpenseSchema.validate({
        ...validData,
        groupId: null
      });

      expect(error).toBeUndefined();
    });

    it("should reject an invalid category", () => {
      const { error } = createExpenseSchema.validate({
        ...validData,
        category: "INVALID_CATEGORY"
      });

      expect(error).toBeDefined();
    });

    it("should reject a missing category", () => {
      const { category: ignored, ...data } = validData;

      const { error } = createExpenseSchema.validate(data);

      expect(error).toBeDefined();
    });

    it("should trim the description", () => {
      const { value } = createExpenseSchema.validate({
        ...validData,
        description: "  Office supplies  "
      });

      expect(value.description).toBe("Office supplies");
    });

    it("should reject an empty description", () => {
      const { error } = createExpenseSchema.validate({
        ...validData,
        description: "   "
      });

      expect(error).toBeDefined();
    });

    it("should reject a description longer than 500 characters", () => {
      const { error } = createExpenseSchema.validate({
        ...validData,
        description: "A".repeat(501)
      });

      expect(error).toBeDefined();
    });

    it("should reject a missing description", () => {
      const { description: ignored, ...data } = validData;

      const { error } = createExpenseSchema.validate(data);

      expect(error).toBeDefined();
    });

    it("should accept a positive integer amount", () => {
      const { error } = createExpenseSchema.validate({
        ...validData,
        amount: 100
      });

      expect(error).toBeUndefined();
    });

    it("should reject a zero amount", () => {
      const { error } = createExpenseSchema.validate({
        ...validData,
        amount: 0
      });

      expect(error).toBeDefined();
    });

    it("should reject a negative amount", () => {
      const { error } = createExpenseSchema.validate({
        ...validData,
        amount: -100
      });

      expect(error).toBeDefined();
    });

    it("should reject a decimal amount", () => {
      const { error } = createExpenseSchema.validate({
        ...validData,
        amount: 10.5
      });

      expect(error).toBeDefined();
    });

    it("should reject a missing amount", () => {
      const { amount: ignored, ...data } = validData;

      const { error } = createExpenseSchema.validate(data);

      expect(error).toBeDefined();
    });

    it("should reject an invalid date format", () => {
      const { error } = createExpenseSchema.validate({
        ...validData,
        expenseDate: "15-01-2026"
      });

      expect(error).toBeDefined();
    });

    it("should reject an impossible calendar date", () => {
      const { error } = createExpenseSchema.validate({
        ...validData,
        expenseDate: "2026-02-30"
      });

      expect(error).toBeDefined();
    });

    it("should reject a missing expenseDate", () => {
      const { expenseDate: ignored, ...data } = validData;

      const { error } = createExpenseSchema.validate(data);

      expect(error).toBeDefined();
    });

    it("should reject an invalid groupId", () => {
      const { error } = createExpenseSchema.validate({
        ...validData,
        groupId: "invalid-id"
      });

      expect(error).toBeDefined();
    });
  });

  describe("expenseIdSchema", () => {
    it("should accept a valid ObjectId", () => {
      const { error } = expenseIdSchema.validate({
        id: validId
      });

      expect(error).toBeUndefined();
    });

    it("should reject an invalid ObjectId", () => {
      const { error } = expenseIdSchema.validate({
        id: "invalid-id"
      });

      expect(error).toBeDefined();
    });

    it("should reject an ObjectId with incorrect length", () => {
      const { error } = expenseIdSchema.validate({
        id: "507f1f77bcf86cd7994390"
      });

      expect(error).toBeDefined();
    });

    it("should reject a missing id", () => {
      const { error } = expenseIdSchema.validate({});

      expect(error).toBeDefined();
    });
  });

  describe("listExpensesSchema", () => {
    it("should accept an empty query", () => {
      const { error } = listExpensesSchema.validate({});

      expect(error).toBeUndefined();
    });

    it("should accept a valid category", () => {
      const { error } = listExpensesSchema.validate({
        category
      });

      expect(error).toBeUndefined();
    });

    it("should reject an invalid category", () => {
      const { error } = listExpensesSchema.validate({
        category: "INVALID_CATEGORY"
      });

      expect(error).toBeDefined();
    });

    it("should accept a valid groupId", () => {
      const { error } = listExpensesSchema.validate({
        groupId
      });

      expect(error).toBeUndefined();
    });

    it("should reject an invalid groupId", () => {
      const { error } = listExpensesSchema.validate({
        groupId: "invalid-id"
      });

      expect(error).toBeDefined();
    });

    it("should accept valid date filters", () => {
      const { error } = listExpensesSchema.validate({
        from: "2026-01-01",
        to: "2026-01-31"
      });

      expect(error).toBeUndefined();
    });

    it("should reject an invalid from date", () => {
      const { error } = listExpensesSchema.validate({
        from: "2026-02-30"
      });

      expect(error).toBeDefined();
    });

    it("should reject an invalid to date", () => {
      const { error } = listExpensesSchema.validate({
        to: "01-31-2026"
      });

      expect(error).toBeDefined();
    });

    it("should reject when from is later than to", () => {
      const { error } = listExpensesSchema.validate({
        from: "2026-02-01",
        to: "2026-01-01"
      });

      expect(error).toBeDefined();
      expect(error.message).toContain("from must not be later than to");
    });

    it("should accept when from equals to", () => {
      const { error } = listExpensesSchema.validate({
        from: "2026-01-15",
        to: "2026-01-15"
      });

      expect(error).toBeUndefined();
    });
  });
});

describe("Expenses service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getAll", () => {
    it("should return all expenses without filters", async () => {
      prisma.expense.findMany.mockResolvedValue([expense]);

      const result = await service.getAll();

      expect(prisma.expense.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: [
          { expenseDate: "desc" },
          { createdAt: "desc" }
        ]
      });

      expect(result).toEqual([serializedExpense]);
      expect(typeof result[0].amount).toBe("number");
    });

    it("should filter expenses by category", async () => {
      prisma.expense.findMany.mockResolvedValue([expense]);

      await service.getAll({
        category
      });

      expect(prisma.expense.findMany).toHaveBeenCalledWith({
        where: {
          category
        },
        orderBy: [
          { expenseDate: "desc" },
          { createdAt: "desc" }
        ]
      });
    });

    it("should filter expenses by groupId", async () => {
      prisma.expense.findMany.mockResolvedValue([]);

      await service.getAll({
        groupId
      });

      expect(prisma.expense.findMany).toHaveBeenCalledWith({
        where: {
          groupId
        },
        orderBy: [
          { expenseDate: "desc" },
          { createdAt: "desc" }
        ]
      });
    });

    it("should filter expenses by from date", async () => {
      prisma.expense.findMany.mockResolvedValue([]);

      await service.getAll({
        from: "2026-01-01"
      });

      expect(prisma.expense.findMany).toHaveBeenCalledWith({
        where: {
          expenseDate: {
            gte: new Date("2026-01-01T00:00:00.000Z")
          }
        },
        orderBy: [
          { expenseDate: "desc" },
          { createdAt: "desc" }
        ]
      });
    });

    it("should filter expenses by to date including the entire day", async () => {
      prisma.expense.findMany.mockResolvedValue([]);

      await service.getAll({
        to: "2026-01-31"
      });

      expect(prisma.expense.findMany).toHaveBeenCalledWith({
        where: {
          expenseDate: {
            lt: new Date("2026-02-01T00:00:00.000Z")
          }
        },
        orderBy: [
          { expenseDate: "desc" },
          { createdAt: "desc" }
        ]
      });
    });

    it("should filter expenses by both from and to dates", async () => {
      prisma.expense.findMany.mockResolvedValue([]);

      await service.getAll({
        from: "2026-01-01",
        to: "2026-01-31"
      });

      expect(prisma.expense.findMany).toHaveBeenCalledWith({
        where: {
          expenseDate: {
            gte: new Date("2026-01-01T00:00:00.000Z"),
            lt: new Date("2026-02-01T00:00:00.000Z")
          }
        },
        orderBy: [
          { expenseDate: "desc" },
          { createdAt: "desc" }
        ]
      });
    });

    it("should combine all filters", async () => {
      prisma.expense.findMany.mockResolvedValue([expense]);

      await service.getAll({
        category,
        groupId,
        from: "2026-01-01",
        to: "2026-01-31"
      });

      expect(prisma.expense.findMany).toHaveBeenCalledWith({
        where: {
          category,
          groupId,
          expenseDate: {
            gte: new Date("2026-01-01T00:00:00.000Z"),
            lt: new Date("2026-02-01T00:00:00.000Z")
          }
        },
        orderBy: [
          { expenseDate: "desc" },
          { createdAt: "desc" }
        ]
      });
    });

    it("should return an empty array when no expenses exist", async () => {
      prisma.expense.findMany.mockResolvedValue([]);

      const result = await service.getAll();

      expect(result).toEqual([]);
    });

    it("should serialize BigInt amounts into numbers", async () => {
      prisma.expense.findMany.mockResolvedValue([
        {
          ...expense,
          amount: BigInt(25000)
        }
      ]);

      const result = await service.getAll();

      expect(result[0].amount).toBe(25000);
      expect(typeof result[0].amount).toBe("number");
    });
  });

  describe("getById", () => {
    it("should return an expense by id", async () => {
      prisma.expense.findUnique.mockResolvedValue(expense);

      const result = await service.getById(validId);

      expect(prisma.expense.findUnique).toHaveBeenCalledWith({
        where: {
          id: validId
        }
      });

      expect(result).toEqual(serializedExpense);
    });

    it("should throw when expense does not exist", async () => {
      prisma.expense.findUnique.mockResolvedValue(null);

      await expect(
        service.getById(validId)
      ).rejects.toThrow("Expense not found");
    });
  });

  describe("create", () => {
    const tx = {
      group: {
        findUnique: jest.fn()
      },
      expense: {
        create: jest.fn()
      }
    };

    const createData = {
      category,
      description: "Office supplies",
      amount: 15000,
      expenseDate: "2026-01-15"
    };

    beforeEach(() => {
      tx.group.findUnique.mockReset();
      tx.expense.create.mockReset();

      prisma.$transaction.mockImplementation(async (callback) =>
        callback(tx)
      );
    });

    it("should create an expense successfully without a group", async () => {
      tx.expense.create.mockResolvedValue(expense);
      auditService.createLog.mockResolvedValue({});

      const result = await service.create(createData, actorId);

      expect(tx.group.findUnique).not.toHaveBeenCalled();

      expect(tx.expense.create).toHaveBeenCalledWith({
        data: {
          category,
          description: "Office supplies",
          amount: BigInt(15000),
          expenseDate: new Date("2026-01-15T00:00:00.000Z")
        }
      });

      expect(auditService.createLog).toHaveBeenCalledWith(
        {
          actorId,
          action: "CREATE",
          entityType: "Expense",
          entityId: expense.id,
          after: expense
        },
        tx
      );

      expect(result).toEqual(serializedExpense);
    });

    it("should create an expense connected to an existing group", async () => {
      tx.group.findUnique.mockResolvedValue({
        id: groupId
      });

      tx.expense.create.mockResolvedValue({
        ...expense,
        groupId
      });

      auditService.createLog.mockResolvedValue({});

      const result = await service.create(
        {
          ...createData,
          groupId
        },
        actorId
      );

      expect(tx.group.findUnique).toHaveBeenCalledWith({
        where: {
          id: groupId
        }
      });

      expect(tx.expense.create).toHaveBeenCalledWith({
        data: {
          group: {
            connect: {
              id: groupId
            }
          },
          category,
          description: "Office supplies",
          amount: BigInt(15000),
          expenseDate: new Date("2026-01-15T00:00:00.000Z")
        }
      });

      expect(result.amount).toBe(15000);
    });

    it("should throw when the specified group does not exist", async () => {
      tx.group.findUnique.mockResolvedValue(null);

      await expect(
        service.create(
          {
            ...createData,
            groupId
          },
          actorId
        )
      ).rejects.toThrow("Group not found");

      expect(tx.expense.create).not.toHaveBeenCalled();
      expect(auditService.createLog).not.toHaveBeenCalled();
    });

    it("should create an audit log after creating the expense", async () => {
      tx.expense.create.mockResolvedValue(expense);
      auditService.createLog.mockResolvedValue({});

      await service.create(createData, actorId);

      expect(auditService.createLog).toHaveBeenCalledTimes(1);
      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId,
          action: "CREATE",
          entityType: "Expense",
          entityId: validId
        }),
        tx
      );
    });

    it("should propagate errors from the transaction", async () => {
      const error = new Error("Database error");

      prisma.$transaction.mockRejectedValue(error);

      await expect(
        service.create(createData, actorId)
      ).rejects.toThrow("Database error");
    });
  });
});

describe("Expenses controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getAll", () => {
    it("should return all expenses", async () => {
      jest.spyOn(service, "getAll").mockResolvedValue([
        serializedExpense
      ]);

      const req = {};
      const res = createResponse();

      res.locals.validated.query = {
        category
      };

      await controller.getAll(req, res);

      expect(service.getAll).toHaveBeenCalledWith({
        category
      });

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [serializedExpense]
      });
    });
  });

  describe("getById", () => {
    it("should return an expense by id", async () => {
      jest.spyOn(service, "getById").mockResolvedValue(
        serializedExpense
      );

      const req = {};
      const res = createResponse();

      res.locals.validated.params = {
        id: validId
      };

      await controller.getById(req, res);

      expect(service.getById).toHaveBeenCalledWith(validId);
      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: serializedExpense
      });
    });
  });

  describe("create", () => {
    it("should create an expense and return 201", async () => {
      jest.spyOn(service, "create").mockResolvedValue(
        serializedExpense
      );

      const req = {
        user: {
          id: actorId
        }
      };

      const res = createResponse();

      res.locals.validated.body = {
        category,
        description: "Office supplies",
        amount: 15000,
        expenseDate: "2026-01-15"
      };

      await controller.create(req, res);

      expect(service.create).toHaveBeenCalledWith(
        res.locals.validated.body,
        actorId
      );

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: serializedExpense
      });
    });
  });
});

describe("Expenses routes", () => {
  it("should register the expected routes", () => {
    const routes = router.stack
      .filter((layer) => layer.route)
      .map((layer) => ({
        path: layer.route.path,
        methods: layer.route.methods
      }));

    expect(routes).toEqual([
      {
        path: "/",
        methods: {
          get: true
        }
      },
      {
        path: "/:id",
        methods: {
          get: true
        }
      },
      {
        path: "/",
        methods: {
          post: true
        }
      }
    ]);
  });

  it("should register authentication and role middleware", () => {
    const middlewareLayers = router.stack.filter(
      (layer) => !layer.route
    );

    expect(middlewareLayers.length).toBeGreaterThanOrEqual(2);
  });

  it("should register validation middleware on all routes", () => {
    const routes = router.stack.filter((layer) => layer.route);

    routes.forEach((layer) => {
      expect(layer.route.stack).toHaveLength(2);
    });
  });
});
