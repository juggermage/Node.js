const prisma = require("../../src/config/prisma");
const childParentService = require("../../src/modules/child-parent/child-parent.service");

jest.mock("../../src/config/prisma", () => ({
  child: {
    findUnique: jest.fn()
  },
  parent: {
    findUnique: jest.fn()
  },
  childParent: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  }
}));

const child = { id: "child-1", status: "ACTIVE" };
const parent = { id: "parent-1", status: "ACTIVE" };

const link = {
  id: "link-1",
  childId: "child-1",
  parentId: "parent-1",
  relation: "MOTHER",
  startDate: new Date("2026-01-01"),
  endDate: null,
  child,
  parent
};

const activeRelationshipFilter = {
  OR: [{ endDate: null }, { endDate: { isSet: false } }]
};

beforeEach(() => {
  jest.clearAllMocks();
  prisma.child.findUnique.mockResolvedValue(child);
  prisma.parent.findUnique.mockResolvedValue(parent);
});

describe("Child-Parent service", () => {
  describe("createOrRestore", () => {
    test("creates a new relationship", async () => {
      prisma.childParent.findUnique.mockResolvedValue(null);
      prisma.childParent.create.mockResolvedValue(link);

      const result = await childParentService.createOrRestore({
        childId: "child-1",
        parentId: "parent-1",
        relation: "MOTHER"
      });

      expect(prisma.childParent.create).toHaveBeenCalledWith({
        data: {
          childId: "child-1",
          parentId: "parent-1",
          relation: "MOTHER",
          endDate: null
        },
        include: { child: true, parent: true }
      });

      expect(result).toEqual(link);
    });

    test("rejects when child does not exist", async () => {
      prisma.child.findUnique.mockResolvedValue(null);

      await expect(
        childParentService.createOrRestore({
          childId: "missing",
          parentId: "parent-1",
          relation: "MOTHER"
        })
      ).rejects.toMatchObject({ code: "CHILD_NOT_FOUND" });
    });

    test("rejects archived child", async () => {
      prisma.child.findUnique.mockResolvedValue({
        ...child,
        status: "ARCHIVED"
      });

      await expect(
        childParentService.createOrRestore({
          childId: "child-1",
          parentId: "parent-1",
          relation: "MOTHER"
        })
      ).rejects.toMatchObject({ code: "CHILD_NOT_FOUND" });
    });

    test("rejects when parent does not exist", async () => {
      prisma.parent.findUnique.mockResolvedValue(null);

      await expect(
        childParentService.createOrRestore({
          childId: "child-1",
          parentId: "missing",
          relation: "MOTHER"
        })
      ).rejects.toMatchObject({ code: "PARENT_NOT_FOUND" });
    });

    test("rejects inactive parent", async () => {
      prisma.parent.findUnique.mockResolvedValue({
        ...parent,
        status: "INACTIVE"
      });

      await expect(
        childParentService.createOrRestore({
          childId: "child-1",
          parentId: "parent-1",
          relation: "MOTHER"
        })
      ).rejects.toMatchObject({ code: "PARENT_NOT_FOUND" });
    });

    test("rejects an already active relationship", async () => {
      prisma.childParent.findUnique.mockResolvedValue(link);

      await expect(
        childParentService.createOrRestore({
          childId: "child-1",
          parentId: "parent-1",
          relation: "MOTHER"
        })
      ).rejects.toMatchObject({ code: "CHILD_PARENT_EXISTS" });

      expect(prisma.childParent.create).not.toHaveBeenCalled();
      expect(prisma.childParent.update).not.toHaveBeenCalled();
    });

    test("restores an ended relationship", async () => {
      prisma.childParent.findUnique.mockResolvedValue({
        ...link,
        endDate: new Date("2026-05-01")
      });
      prisma.childParent.update.mockResolvedValue(link);

      const result = await childParentService.createOrRestore({
        childId: "child-1",
        parentId: "parent-1",
        relation: "FATHER"
      });

      expect(prisma.childParent.update).toHaveBeenCalledWith({
        where: { id: "link-1" },
        data: {
          relation: "FATHER",
          startDate: expect.any(Date),
          endDate: null
        },
        include: { child: true, parent: true }
      });

      expect(result).toEqual(link);
    });

    test("converts Prisma unique constraint error", async () => {
      prisma.childParent.findUnique.mockResolvedValue(null);
      prisma.childParent.create.mockRejectedValue({ code: "P2002" });

      await expect(
        childParentService.createOrRestore({
          childId: "child-1",
          parentId: "parent-1",
          relation: "MOTHER"
        })
      ).rejects.toMatchObject({ code: "CHILD_PARENT_EXISTS" });
    });

    test("converts Prisma foreign key error", async () => {
      prisma.childParent.findUnique.mockResolvedValue(null);
      prisma.childParent.create.mockRejectedValue({ code: "P2003" });

      await expect(
        childParentService.createOrRestore({
          childId: "child-1",
          parentId: "parent-1",
          relation: "MOTHER"
        })
      ).rejects.toMatchObject({ code: "RELATED_RECORD_NOT_FOUND" });
    });
  });

  describe("getById", () => {
    test("returns relationship by ID", async () => {
      prisma.childParent.findUnique.mockResolvedValue(link);

      const result = await childParentService.getById("link-1");

      expect(prisma.childParent.findUnique).toHaveBeenCalledWith({
        where: { id: "link-1" },
        include: { child: true, parent: true }
      });

      expect(result).toEqual(link);
    });

    test("rejects when relationship does not exist", async () => {
      prisma.childParent.findUnique.mockResolvedValue(null);

      await expect(childParentService.getById("missing")).rejects.toMatchObject({
        code: "CHILD_PARENT_NOT_FOUND"
      });
    });
  });

  describe("getForChild", () => {
    test("returns only active relationships by default", async () => {
      prisma.childParent.findMany.mockResolvedValue([link]);

      const result = await childParentService.getForChild("child-1");

      expect(prisma.childParent.findMany).toHaveBeenCalledWith({
        where: {
          childId: "child-1",
          ...activeRelationshipFilter
        },
        include: { parent: true },
        orderBy: { startDate: "desc" }
      });

      expect(result).toEqual([link]);
    });

    test("includes ended relationships when requested", async () => {
      prisma.childParent.findMany.mockResolvedValue([link]);

      await childParentService.getForChild("child-1", true);

      expect(prisma.childParent.findMany).toHaveBeenCalledWith({
        where: { childId: "child-1" },
        include: { parent: true },
        orderBy: { startDate: "desc" }
      });
    });

    test("rejects when child does not exist", async () => {
      prisma.child.findUnique.mockResolvedValue(null);

      await expect(childParentService.getForChild("missing")).rejects.toMatchObject({
        code: "CHILD_NOT_FOUND"
      });

      expect(prisma.childParent.findMany).not.toHaveBeenCalled();
    });
  });

  describe("getForParent", () => {
    test("returns only active relationships by default", async () => {
      prisma.childParent.findMany.mockResolvedValue([link]);

      const result = await childParentService.getForParent("parent-1");

      expect(prisma.childParent.findMany).toHaveBeenCalledWith({
        where: {
          parentId: "parent-1",
          ...activeRelationshipFilter
        },
        include: { child: true },
        orderBy: { startDate: "desc" }
      });

      expect(result).toEqual([link]);
    });

    test("includes ended relationships when requested", async () => {
      prisma.childParent.findMany.mockResolvedValue([link]);

      await childParentService.getForParent("parent-1", true);

      expect(prisma.childParent.findMany).toHaveBeenCalledWith({
        where: { parentId: "parent-1" },
        include: { child: true },
        orderBy: { startDate: "desc" }
      });
    });

    test("rejects when parent does not exist", async () => {
      prisma.parent.findUnique.mockResolvedValue(null);

      await expect(childParentService.getForParent("missing")).rejects.toMatchObject({
        code: "PARENT_NOT_FOUND"
      });

      expect(prisma.childParent.findMany).not.toHaveBeenCalled();
    });
  });

  describe("complete", () => {
    test("completes an active relationship", async () => {
      prisma.childParent.findUnique.mockResolvedValue(link);
      prisma.childParent.update.mockResolvedValue({
        ...link,
        endDate: new Date()
      });

      const result = await childParentService.complete("link-1");

      expect(prisma.childParent.update).toHaveBeenCalledWith({
        where: { id: "link-1" },
        data: { endDate: expect.any(Date) },
        include: { child: true, parent: true }
      });

      expect(result.endDate).toBeInstanceOf(Date);
    });

    test("rejects when relationship does not exist", async () => {
      prisma.childParent.findUnique.mockResolvedValue(null);

      await expect(childParentService.complete("missing")).rejects.toMatchObject({
        code: "CHILD_PARENT_NOT_FOUND"
      });
    });

    test("rejects when relationship has already ended", async () => {
      prisma.childParent.findUnique.mockResolvedValue({
        ...link,
        endDate: new Date("2026-05-01")
      });

      await expect(childParentService.complete("link-1")).rejects.toMatchObject({
        code: "RELATIONSHIP_ALREADY_ENDED"
      });

      expect(prisma.childParent.update).not.toHaveBeenCalled();
    });
  });
});
