jest.mock("../../src/config/prisma", () => ({
  $transaction: jest.fn(),
  child: {},
  parent: {},
  group: {},
  employee: {},
  room: {},
  subject: {}
}));
jest.mock("../../src/modules/audit/audit.service", () => ({ createLog: jest.fn() }));

const prisma = require("../../src/config/prisma");
const audit = require("../../src/modules/audit/audit.service");
const service = require("../../src/modules/lifecycle/lifecycle.service");
const { paramsSchema } = require("../../src/modules/lifecycle/lifecycle.validation");

const id = "507f1f77bcf86cd799439011";
const user = { id, role: "ADMIN" };

describe("Lifecycle validation", () => {
  test("accepts supported entities and object ids", () => {
    expect(paramsSchema.validate({ entity: "children", id }).error).toBeUndefined();
  });
  test("rejects unsupported entities", () => {
    expect(paramsSchema.validate({ entity: "invoices", id }).error).toBeDefined();
  });
  test("rejects malformed ids", () => {
    expect(paramsSchema.validate({ entity: "children", id: "bad" }).error).toBeDefined();
  });
});

describe("Lifecycle service", () => {
  const record = { id, status: "ACTIVE", archivedAt: null, firstName: "Test" };
  let tx;
  beforeEach(() => {
    tx = {
      child: {
        findUnique: jest.fn().mockResolvedValue(record),
        update: jest.fn().mockResolvedValue({ ...record, status: "ARCHIVED", archivedAt: new Date() }),
        delete: jest.fn().mockResolvedValue(record)
      },
      auditLog: { create: jest.fn() }
    };
    prisma.$transaction.mockImplementation(callback => callback(tx));
    audit.createLog.mockResolvedValue({});
  });

  test("archives a record and audits before and after", async () => {
    const result = await service.archive("children", id, user);
    expect(tx.child.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id },
      data: expect.objectContaining({ status: "ARCHIVED" })
    }));
    expect(audit.createLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "ARCHIVE", before: record, after: result
    }), tx);
  });

  test("restores only archived records", async () => {
    tx.child.findUnique.mockResolvedValue({ ...record, status: "ARCHIVED", archivedAt: new Date() });
    tx.child.update.mockResolvedValue({ ...record, status: "ACTIVE" });
    const result = await service.restore("children", id, user);
    expect(result.status).toBe("ACTIVE");
    expect(audit.createLog).toHaveBeenCalledWith(expect.objectContaining({ action: "RESTORE" }), tx);
  });

  test("requires archive before hard delete", async () => {
    await expect(service.hardDelete("children", id, user)).rejects.toMatchObject({
      code: "ARCHIVE_REQUIRED"
    });
    expect(tx.child.delete).not.toHaveBeenCalled();
  });

  test("blocks hard delete when references exist", async () => {
    tx.child.findUnique.mockResolvedValue({ ...record, status: "ARCHIVED" });
    tx.childParent = { count: jest.fn().mockResolvedValue(1) };
    const error = await service.hardDelete("children", id, user).catch(value => value);
    expect(error.code).toBe("RECORD_HAS_DEPENDENCIES");
    expect(tx.child.delete).not.toHaveBeenCalled();
  });

  test("rejects non-management users", async () => {
    await expect(service.archive("children", id, { id, role: "PARENT" })).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
  });
});
