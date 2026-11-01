jest.mock("../../src/config/prisma", () => ({
  auditLog: {
    create: jest.fn(),
    findMany: jest.fn()
  }
}));

const prisma = require("../../src/config/prisma");
const auditService = require("../../src/modules/audit/audit.service");

describe("Audit service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("prepareSnapshot", () => {
    test("returns null for null or undefined", () => {
      expect(auditService.prepareSnapshot(null)).toBeNull();
      expect(auditService.prepareSnapshot(undefined)).toBeNull();
    });

    test("converts Date and BigInt values", () => {
      const date = new Date("2026-10-31T12:00:00.000Z");

      expect(
        auditService.prepareSnapshot({
          createdAt: date,
          amount: 1500n
        })
      ).toEqual({
        createdAt: "2026-10-31T12:00:00.000Z",
        amount: "1500"
      });
    });

    test("removes confidential fields recursively", () => {
      const result = auditService.prepareSnapshot({
        name: "Test",
        password: "secret",
        accessToken: "token",
        details: {
          apiKey: "key",
          email: "test@example.com"
        }
      });

      expect(result).toEqual({
        name: "Test",
        details: {
          email: "test@example.com"
        }
      });
    });

    test("processes arrays", () => {
      expect(
        auditService.prepareSnapshot([
          { name: "First", password: "secret" },
          { name: "Second", token: "secret" }
        ])
      ).toEqual([
        { name: "First" },
        { name: "Second" }
      ]);
    });
  });

  describe("createLog", () => {
    test("creates an audit record with valid data", async () => {
      const data = {
        actorId: "507f1f77bcf86cd799439011",
        action: "CREATE",
        entityType: "Employee",
        entityId: "employee-1",
        before: null,
        after: { name: "Test Employee" }
      };

      prisma.auditLog.create.mockResolvedValue({
        id: "audit-1",
        ...data
      });

      await auditService.createLog(data);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          ...data,
          entityType: "Employee",
          entityId: "employee-1"
        }
      });
    });

    test("rejects unsupported action", async () => {
      await expect(
        auditService.createLog({
          action: "INVALID",
          entityType: "Employee",
          entityId: "employee-1"
        })
      ).rejects.toThrow("Invalid audit action");

      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    test("rejects missing entity information", async () => {
      await expect(
        auditService.createLog({
          action: "CREATE",
          entityType: "",
          entityId: ""
        })
      ).rejects.toThrow("Entity type and entity ID are required");

      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    test("rejects invalid actor ID", async () => {
      await expect(
        auditService.createLog({
          actorId: "invalid-id",
          action: "CREATE",
          entityType: "Employee",
          entityId: "employee-1"
        })
      ).rejects.toThrow("Invalid audit actor ID");

      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    test("trims entity type and entity ID", async () => {
      prisma.auditLog.create.mockResolvedValue({ id: "audit-1" });

      await auditService.createLog({
        action: "UPDATE",
        entityType: " Employee ",
        entityId: " employee-1 "
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entityType: "Employee",
          entityId: "employee-1"
        })
      });
    });
  });

  describe("getAll", () => {
    test("returns audit records with all filters", async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);

      await auditService.getAll({
        from: "2026-10-01",
        to: "2026-10-31",
        entityType: "Payment",
        action: "PAYMENT"
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: new Date("2026-10-01"),
            lte: new Date("2026-10-31")
          },
          entityType: "Payment",
          action: "PAYMENT"
        },
        orderBy: { createdAt: "desc" },
        take: 100
      });
    });

    test("returns records without filters", async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);

      await auditService.getAll();

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: "desc" },
        take: 100
      });
    });
  });
});