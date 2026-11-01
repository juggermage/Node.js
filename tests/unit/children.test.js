const prisma = require("../../src/config/prisma");
const childrenService = require("../../src/modules/children/children.service");

jest.mock("node:crypto", () => ({
  randomUUID: jest.fn(() => "generated-uuid")
}));

jest.mock("../../src/config/prisma", () => ({
  child: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn()
  }
}));

const child = {
  id: "child-1",
  childCode: "generated-uuid",
  firstName: "Ivan",
  lastName: "Petrenko",
  birthDate: new Date("2020-05-15T00:00:00.000Z"),
  status: "ACTIVE"
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Children service", () => {
  describe("getAll", () => {
    test("returns children excluding archived by default", async () => {
      prisma.child.findMany.mockResolvedValue([child]);

      const result = await childrenService.getAll();

      expect(prisma.child.findMany).toHaveBeenCalledWith({
        where: { status: { not: "ARCHIVED" } },
        orderBy: { createdAt: "desc" }
      });

      expect(result).toEqual([child]);
    });

    test("filters children by status", async () => {
      prisma.child.findMany.mockResolvedValue([child]);

      await childrenService.getAll({ status: "ACTIVE" });

      expect(prisma.child.findMany).toHaveBeenCalledWith({
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "desc" }
      });
    });

    test("searches by first and last name", async () => {
      prisma.child.findMany.mockResolvedValue([child]);

      await childrenService.getAll({ search: "Ivan Petrenko" });

      expect(prisma.child.findMany).toHaveBeenCalledWith({
        where: {
          status: { not: "ARCHIVED" },
          OR: [
            {
              firstName: { contains: "Ivan", mode: "insensitive" },
              lastName: { contains: "Petrenko", mode: "insensitive" }
            },
            {
              firstName: { contains: "Petrenko", mode: "insensitive" },
              lastName: { contains: "Ivan", mode: "insensitive" }
            }
          ]
        },
        orderBy: { createdAt: "desc" }
      });
    });

    test("searches by a single name", async () => {
      prisma.child.findMany.mockResolvedValue([child]);

      await childrenService.getAll({ search: "Ivan" });

      expect(prisma.child.findMany).toHaveBeenCalledWith({
        where: {
          status: { not: "ARCHIVED" },
          OR: [
            { firstName: { contains: "Ivan", mode: "insensitive" } },
            { lastName: { contains: "Ivan", mode: "insensitive" } }
          ]
        },
        orderBy: { createdAt: "desc" }
      });
    });

    test("trims search text", async () => {
      prisma.child.findMany.mockResolvedValue([child]);

      await childrenService.getAll({ search: "  Ivan  " });

      expect(prisma.child.findMany).toHaveBeenCalledWith({
        where: {
          status: { not: "ARCHIVED" },
          OR: [
            { firstName: { contains: "Ivan", mode: "insensitive" } },
            { lastName: { contains: "Ivan", mode: "insensitive" } }
          ]
        },
        orderBy: { createdAt: "desc" }
      });
    });

    test("does not apply search for empty text", async () => {
      prisma.child.findMany.mockResolvedValue([]);

      await childrenService.getAll({ search: "   " });

      expect(prisma.child.findMany).toHaveBeenCalledWith({
        where: { status: { not: "ARCHIVED" } },
        orderBy: { createdAt: "desc" }
      });
    });
  });

  describe("getById", () => {
    test("returns child by ID", async () => {
      prisma.child.findFirst.mockResolvedValue(child);

      const result = await childrenService.getById("child-1");

      expect(prisma.child.findFirst).toHaveBeenCalledWith({
        where: {
          id: "child-1",
          status: { not: "ARCHIVED" }
        }
      });

      expect(result).toEqual(child);
    });

    test("rejects when child does not exist", async () => {
      prisma.child.findFirst.mockResolvedValue(null);

      await expect(childrenService.getById("missing")).rejects.toMatchObject({
        code: "CHILD_NOT_FOUND"
      });
    });
  });

  describe("create", () => {
    test("creates child with generated UUID", async () => {
      prisma.child.create.mockResolvedValue(child);

      const result = await childrenService.create({
        firstName: "Ivan",
        lastName: "Petrenko",
        birthDate: "2020-05-15",
        status: "ACTIVE"
      });

      expect(prisma.child.create).toHaveBeenCalledWith({
        data: {
          firstName: "Ivan",
          lastName: "Petrenko",
          birthDate: new Date("2020-05-15T00:00:00.000Z"),
          status: "ACTIVE",
          childCode: "generated-uuid"
        }
      });

      expect(result).toEqual(child);
    });

    test("creates child without changing birthDate when it is not provided", async () => {
      prisma.child.create.mockResolvedValue(child);

      await childrenService.create({
        firstName: "Ivan",
        lastName: "Petrenko"
      });

      expect(prisma.child.create).toHaveBeenCalledWith({
        data: {
          firstName: "Ivan",
          lastName: "Petrenko",
          childCode: "generated-uuid"
        }
      });
    });
  });

  describe("update", () => {
    test("updates child and returns updated data", async () => {
      prisma.child.updateMany.mockResolvedValue({ count: 1 });
      prisma.child.findFirst.mockResolvedValue({
        ...child,
        firstName: "Petro"
      });

      const result = await childrenService.update("child-1", {
        firstName: "Petro",
        birthDate: "2020-06-20"
      });

      expect(prisma.child.updateMany).toHaveBeenCalledWith({
        where: {
          id: "child-1",
          status: { not: "ARCHIVED" }
        },
        data: {
          firstName: "Petro",
          birthDate: new Date("2020-06-20T00:00:00.000Z")
        }
      });

      expect(result.firstName).toBe("Petro");
    });

    test("rejects when child does not exist", async () => {
      prisma.child.updateMany.mockResolvedValue({ count: 0 });

      await expect(childrenService.update("missing", { firstName: "Petro" })).rejects.toMatchObject(
        { code: "CHILD_NOT_FOUND" }
      );

      expect(prisma.child.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    test("archives child instead of deleting it", async () => {
      prisma.child.updateMany.mockResolvedValue({ count: 1 });

      await childrenService.remove("child-1");

      expect(prisma.child.updateMany).toHaveBeenCalledWith({
        where: {
          id: "child-1",
          status: { not: "ARCHIVED" }
        },
        data: {
          status: "ARCHIVED",
          archivedAt: expect.any(Date)
        }
      });
    });

    test("rejects when child does not exist or is already archived", async () => {
      prisma.child.updateMany.mockResolvedValue({ count: 0 });

      await expect(childrenService.remove("missing")).rejects.toMatchObject({
        code: "CHILD_NOT_FOUND"
      });
    });
  });
});
