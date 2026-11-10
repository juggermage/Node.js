jest.mock("../../src/config/prisma", () => ({
  discount: {
    findFirst: jest.fn(),
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

jest.mock("../../src/middleware/auth.middleware", () => jest.fn((req, res, next) => next()));

jest.mock("../../src/middleware/rbac.middleware", () => jest.fn(() => (req, res, next) => next()));

const prisma = require("../../src/config/prisma");
const auditService = require("../../src/modules/audit/audit.service");
const service = require("../../src/modules/billing/discounts/discounts.service");
const controller = require("../../src/modules/billing/discounts/discounts.controller");
const {
  createDiscountSchema,
  idParamsSchema,
  queryDiscountsSchema
} = require("../../src/modules/billing/discounts/discounts.validation");
const HTTP_STATUS = require("../../src/utils/http-status");
const router = require("../../src/modules/billing/discounts/discounts.routes");

const validId = "507f1f77bcf86cd799439011";
const actorId = "507f1f77bcf86cd799439012";

const discount = {
  id: validId,
  name: "Family discount",
  type: "PERCENTAGE",
  percentage: 10,
  isActive: true
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

describe("Discount validation", () => {
  describe("createDiscountSchema", () => {
    it("should accept valid discount data", () => {
      const { error, value } = createDiscountSchema.validate({
        name: "Family discount",
        value: 10
      });

      expect(error).toBeUndefined();
      expect(value).toEqual({
        name: "Family discount",
        value: 10
      });
    });

    it.each([10, 20, 30])("should accept discount value %i", (value) => {
      const { error } = createDiscountSchema.validate({
        name: "Discount",
        value
      });

      expect(error).toBeUndefined();
    });

    it.each([0, 5, 15, 25, 40, -10])("should reject discount value %i", (value) => {
      const { error } = createDiscountSchema.validate({
        name: "Discount",
        value
      });

      expect(error).toBeDefined();
    });

    it("should reject a non-integer discount value", () => {
      const { error } = createDiscountSchema.validate({
        name: "Discount",
        value: 10.5
      });

      expect(error).toBeDefined();
    });

    it("should trim the discount name", () => {
      const { value } = createDiscountSchema.validate({
        name: "  Family discount  ",
        value: 10
      });

      expect(value.name).toBe("Family discount");
    });

    it("should reject an empty name", () => {
      const { error } = createDiscountSchema.validate({
        name: " ",
        value: 10
      });

      expect(error).toBeDefined();
    });

    it("should reject a missing name", () => {
      const { error } = createDiscountSchema.validate({
        value: 10
      });

      expect(error).toBeDefined();
    });

    it("should reject a name longer than 100 characters", () => {
      const { error } = createDiscountSchema.validate({
        name: "A".repeat(101),
        value: 10
      });

      expect(error).toBeDefined();
    });

    it("should reject a missing value", () => {
      const { error } = createDiscountSchema.validate({
        name: "Discount"
      });

      expect(error).toBeDefined();
    });
  });

  describe("idParamsSchema", () => {
    it("should accept a valid ObjectId", () => {
      const { error } = idParamsSchema.validate({
        id: validId
      });

      expect(error).toBeUndefined();
    });

    it("should reject an invalid ObjectId", () => {
      const { error } = idParamsSchema.validate({
        id: "invalid-id"
      });

      expect(error).toBeDefined();
    });

    it("should reject an ObjectId with incorrect length", () => {
      const { error } = idParamsSchema.validate({
        id: "507f1f77bcf86cd7994390"
      });

      expect(error).toBeDefined();
    });

    it("should reject a missing id", () => {
      const { error } = idParamsSchema.validate({});

      expect(error).toBeDefined();
    });
  });

  describe("queryDiscountsSchema", () => {
    it("should accept includeInactive=true", () => {
      const { error, value } = queryDiscountsSchema.validate({
        includeInactive: "true"
      });

      expect(error).toBeUndefined();
      expect(value.includeInactive).toBe(true);
    });

    it("should accept includeInactive=false", () => {
      const { error, value } = queryDiscountsSchema.validate({
        includeInactive: "false"
      });

      expect(error).toBeUndefined();
      expect(value.includeInactive).toBe(false);
    });

    it("should accept boolean values", () => {
      const { error, value } = queryDiscountsSchema.validate({
        includeInactive: true
      });

      expect(error).toBeUndefined();
      expect(value.includeInactive).toBe(true);
    });

    it("should accept an empty query", () => {
      const { error } = queryDiscountsSchema.validate({});

      expect(error).toBeUndefined();
    });

    it("should reject an invalid boolean value", () => {
      const { error } = queryDiscountsSchema.validate({
        includeInactive: "yes"
      });

      expect(error).toBeDefined();
    });
  });
});

describe("Discount service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("create", () => {
    const tx = {
      discount: {
        create: jest.fn()
      }
    };

    beforeEach(() => {
      tx.discount.create.mockReset();

      prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    });

    it("should create a discount successfully", async () => {
      prisma.discount.findFirst.mockResolvedValue(null);
      tx.discount.create.mockResolvedValue(discount);
      auditService.createLog.mockResolvedValue({});

      const result = await service.create(
        {
          name: " Family discount ",
          value: 10
        },
        actorId
      );

      expect(prisma.discount.findFirst).toHaveBeenCalledWith({
        where: {
          name: {
            equals: "Family discount",
            mode: "insensitive"
          }
        }
      });

      expect(tx.discount.create).toHaveBeenCalledWith({
        data: {
          name: "Family discount",
          type: "PERCENTAGE",
          percentage: 10,
          isActive: true
        }
      });

      expect(auditService.createLog).toHaveBeenCalledWith(
        {
          actorId,
          action: "CREATE",
          entityType: "Discount",
          entityId: discount.id,
          after: discount
        },
        tx
      );

      expect(result).toEqual(discount);
    });

    it("should accept discount value 20", async () => {
      prisma.discount.findFirst.mockResolvedValue(null);
      tx.discount.create.mockResolvedValue({
        ...discount,
        percentage: 20
      });
      auditService.createLog.mockResolvedValue({});

      const result = await service.create(
        {
          name: "Discount 20",
          value: 20
        },
        actorId
      );

      expect(result.percentage).toBe(20);
    });

    it("should accept discount value 30", async () => {
      prisma.discount.findFirst.mockResolvedValue(null);
      tx.discount.create.mockResolvedValue({
        ...discount,
        percentage: 30
      });
      auditService.createLog.mockResolvedValue({});

      const result = await service.create(
        {
          name: "Discount 30",
          value: 30
        },
        actorId
      );

      expect(result.percentage).toBe(30);
    });

    it("should reject an invalid discount value", async () => {
      await expect(
        service.create(
          {
            name: "Discount",
            value: 15
          },
          actorId
        )
      ).rejects.toThrow("Discount value must be 10, 20, or 30");

      expect(prisma.discount.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("should reject when discount name already exists", async () => {
      prisma.discount.findFirst.mockResolvedValue(discount);

      await expect(
        service.create(
          {
            name: "Family discount",
            value: 10
          },
          actorId
        )
      ).rejects.toThrow("Discount name already exists");

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("should convert Prisma P2002 error into an AppError", async () => {
      prisma.discount.findFirst.mockResolvedValue(null);

      prisma.$transaction.mockRejectedValue({
        code: "P2002"
      });

      await expect(
        service.create(
          {
            name: "Family discount",
            value: 10
          },
          actorId
        )
      ).rejects.toThrow("Discount name already exists");
    });

    it("should rethrow unknown Prisma errors", async () => {
      prisma.discount.findFirst.mockResolvedValue(null);

      const error = new Error("Database connection failed");

      prisma.$transaction.mockRejectedValue(error);

      await expect(
        service.create(
          {
            name: "Family discount",
            value: 10
          },
          actorId
        )
      ).rejects.toThrow("Database connection failed");
    });
  });

  describe("getAll", () => {
    it("should return only active discounts by default", async () => {
      prisma.discount.findMany.mockResolvedValue([discount]);

      const result = await service.getAll();

      expect(prisma.discount.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true
        },
        orderBy: {
          percentage: "asc"
        }
      });

      expect(result).toEqual([discount]);
    });

    it("should return only active discounts when includeInactive is false", async () => {
      prisma.discount.findMany.mockResolvedValue([discount]);

      await service.getAll(false);

      expect(prisma.discount.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true
        },
        orderBy: {
          percentage: "asc"
        }
      });
    });

    it("should return all discounts when includeInactive is true", async () => {
      const discounts = [
        discount,
        {
          ...discount,
          id: "507f1f77bcf86cd799439013",
          isActive: false
        }
      ];

      prisma.discount.findMany.mockResolvedValue(discounts);

      const result = await service.getAll(true);

      expect(prisma.discount.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: {
          percentage: "asc"
        }
      });

      expect(result).toEqual(discounts);
    });

    it("should return an empty array when no discounts exist", async () => {
      prisma.discount.findMany.mockResolvedValue([]);

      const result = await service.getAll();

      expect(result).toEqual([]);
    });
  });

  describe("getById", () => {
    it("should return a discount by id", async () => {
      prisma.discount.findUnique.mockResolvedValue(discount);

      const result = await service.getById(validId);

      expect(prisma.discount.findUnique).toHaveBeenCalledWith({
        where: {
          id: validId
        }
      });

      expect(result).toEqual(discount);
    });

    it("should throw when discount does not exist", async () => {
      prisma.discount.findUnique.mockResolvedValue(null);

      await expect(service.getById(validId)).rejects.toThrow("Discount not found");
    });
  });

  describe("deactivate", () => {
    const tx = {
      discount: {
        findUnique: jest.fn(),
        update: jest.fn()
      }
    };

    beforeEach(() => {
      tx.discount.findUnique.mockReset();
      tx.discount.update.mockReset();

      prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    });

    it("should deactivate an active discount and create an audit log", async () => {
      const updatedDiscount = {
        ...discount,
        isActive: false
      };

      tx.discount.findUnique.mockResolvedValue(discount);
      tx.discount.update.mockResolvedValue(updatedDiscount);
      auditService.createLog.mockResolvedValue({});

      const result = await service.deactivate(validId, actorId);

      expect(tx.discount.findUnique).toHaveBeenCalledWith({
        where: {
          id: validId
        }
      });

      expect(tx.discount.update).toHaveBeenCalledWith({
        where: {
          id: validId
        },
        data: {
          isActive: false
        }
      });

      expect(auditService.createLog).toHaveBeenCalledWith(
        {
          actorId,
          action: "ARCHIVE",
          entityType: "Discount",
          entityId: discount.id,
          before: discount,
          after: updatedDiscount
        },
        tx
      );

      expect(result).toEqual(updatedDiscount);
    });

    it("should return the discount without updating when it is already inactive", async () => {
      const inactiveDiscount = {
        ...discount,
        isActive: false
      };

      tx.discount.findUnique.mockResolvedValue(inactiveDiscount);

      const result = await service.deactivate(validId, actorId);

      expect(result).toEqual(inactiveDiscount);
      expect(tx.discount.update).not.toHaveBeenCalled();
      expect(auditService.createLog).not.toHaveBeenCalled();
    });

    it("should throw when discount does not exist", async () => {
      tx.discount.findUnique.mockResolvedValue(null);

      await expect(service.deactivate(validId, actorId)).rejects.toThrow("Discount not found");

      expect(tx.discount.update).not.toHaveBeenCalled();
      expect(auditService.createLog).not.toHaveBeenCalled();
    });

    it("should convert Prisma P2025 error into an AppError", async () => {
      tx.discount.findUnique.mockResolvedValue(discount);

      tx.discount.update.mockRejectedValue({
        code: "P2025"
      });

      await expect(service.deactivate(validId, actorId)).rejects.toThrow("Discount not found");
    });

    it("should rethrow unknown Prisma errors", async () => {
      tx.discount.findUnique.mockResolvedValue(discount);

      const error = new Error("Database connection failed");

      tx.discount.update.mockRejectedValue(error);

      await expect(service.deactivate(validId, actorId)).rejects.toThrow(
        "Database connection failed"
      );
    });
  });
});

describe("Discount controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("create", () => {
    it("should create a discount and return 201", async () => {
      jest.spyOn(service, "create").mockResolvedValue(discount);

      const req = {
        user: {
          id: actorId
        }
      };

      const res = createResponse();

      res.locals.validated.body = {
        name: "Family discount",
        value: 10
      };

      await controller.create(req, res);

      expect(service.create).toHaveBeenCalledWith(res.locals.validated.body, actorId);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: discount
      });
    });
  });

  describe("getAll", () => {
    it("should return discounts with includeInactive=true", async () => {
      jest.spyOn(service, "getAll").mockResolvedValue([discount]);

      const req = {};
      const res = createResponse();

      res.locals.validated.query = {
        includeInactive: true
      };

      await controller.getAll(req, res);

      expect(service.getAll).toHaveBeenCalledWith(true);
      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [discount]
      });
    });

    it("should return active discounts when includeInactive is false", async () => {
      jest.spyOn(service, "getAll").mockResolvedValue([discount]);

      const req = {};
      const res = createResponse();

      res.locals.validated.query = {
        includeInactive: false
      };

      await controller.getAll(req, res);

      expect(service.getAll).toHaveBeenCalledWith(false);
    });

    it("should pass false when includeInactive is missing", async () => {
      jest.spyOn(service, "getAll").mockResolvedValue([]);

      const req = {};
      const res = createResponse();

      await controller.getAll(req, res);

      expect(service.getAll).toHaveBeenCalledWith(false);
    });
  });

  describe("getById", () => {
    it("should return a discount by id", async () => {
      jest.spyOn(service, "getById").mockResolvedValue(discount);

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
        data: discount
      });
    });
  });

  describe("deactivate", () => {
    it("should deactivate a discount and return 200", async () => {
      const updatedDiscount = {
        ...discount,
        isActive: false
      };

      jest.spyOn(service, "deactivate").mockResolvedValue(updatedDiscount);

      const req = {
        user: {
          id: actorId
        }
      };

      const res = createResponse();

      res.locals.validated.params = {
        id: validId
      };

      await controller.deactivate(req, res);

      expect(service.deactivate).toHaveBeenCalledWith(validId, actorId);
      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: updatedDiscount
      });
    });
  });
});

describe("Discount routes", () => {
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
        path: "/",
        methods: {
          post: true
        }
      },
      {
        path: "/:id",
        methods: {
          get: true
        }
      },
      {
        path: "/:id/deactivate",
        methods: {
          patch: true
        }
      }
    ]);
  });

  it("should register authentication and role middleware", () => {
    const middlewareLayers = router.stack.filter((layer) => !layer.route);

    expect(middlewareLayers.length).toBeGreaterThanOrEqual(2);
  });

  it("should register validation middleware on all routes", () => {
    const routes = router.stack.filter((layer) => layer.route);

    routes.forEach((layer) => {
      expect(layer.route.stack.length).toBe(2);
    });
  });
});
