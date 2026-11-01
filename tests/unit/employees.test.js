
const prisma = require("../../src/config/prisma");
const employeesService = require("../../src/modules/employees/employees.service");

jest.mock("../../src/config/prisma", () => ({
  employee: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  staffAssignment: {
    count: jest.fn()
  },
  teacherSubject: {
    count: jest.fn()
  },
  scheduleItem: {
    count: jest.fn()
  }
}));

const employee = {
  id: "employee-1",
  employeeCode: "EMP001",
  firstName: "Ivan",
  lastName: "Petrenko",
  role: "TEACHER",
  phone: "123456789",
  email: "ivan@example.com",
  status: "ACTIVE"
};

beforeEach(() => {
  jest.clearAllMocks();

  prisma.staffAssignment.count.mockResolvedValue(0);
  prisma.teacherSubject.count.mockResolvedValue(0);
  prisma.scheduleItem.count.mockResolvedValue(0);
});

describe("Employees service", () => {
  describe("getAll", () => {
    test("returns employees excluding archived by default", async () => {
      prisma.employee.findMany.mockResolvedValue([employee]);

      const result = await employeesService.getAll();

      expect(prisma.employee.findMany).toHaveBeenCalledWith({
        where: { status: { not: "ARCHIVED" } },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
      });

      expect(result).toEqual([employee]);
    });

    test("filters employees by status and role", async () => {
      prisma.employee.findMany.mockResolvedValue([employee]);

      await employeesService.getAll({
        status: "ACTIVE",
        role: "TEACHER"
      });

      expect(prisma.employee.findMany).toHaveBeenCalledWith({
        where: {
          status: "ACTIVE",
          role: "TEACHER"
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
      });
    });

    test("searches by first name, last name and employee code", async () => {
      prisma.employee.findMany.mockResolvedValue([employee]);

      await employeesService.getAll({ search: " Ivan " });

      expect(prisma.employee.findMany).toHaveBeenCalledWith({
        where: {
          status: { not: "ARCHIVED" },
          OR: [
            { firstName: { contains: "Ivan", mode: "insensitive" } },
            { lastName: { contains: "Ivan", mode: "insensitive" } },
            { employeeCode: { contains: "Ivan", mode: "insensitive" } }
          ]
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
      });
    });
  });

  describe("getById", () => {
    test("returns employee by ID", async () => {
      prisma.employee.findUnique.mockResolvedValue(employee);

      const result = await employeesService.getById("employee-1");

      expect(result).toEqual(employee);
    });

    test("rejects when employee does not exist", async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        employeesService.getById("missing")
      ).rejects.toMatchObject({ code: "EMPLOYEE_NOT_FOUND" });
    });

    test("rejects archived employee", async () => {
      prisma.employee.findUnique.mockResolvedValue({
        ...employee,
        status: "ARCHIVED"
      });

      await expect(
        employeesService.getById("employee-1")
      ).rejects.toMatchObject({ code: "EMPLOYEE_NOT_FOUND" });
    });
  });

  describe("create", () => {
    test("creates employee with default active status", async () => {
      prisma.employee.findUnique.mockResolvedValue(null);
      prisma.employee.create.mockResolvedValue(employee);

      const result = await employeesService.create({
        employeeCode: "EMP001",
        firstName: "Ivan",
        lastName: "Petrenko",
        role: "TEACHER",
        phone: "123456789",
        email: "ivan@example.com"
      });

      expect(prisma.employee.create).toHaveBeenCalledWith({
        data: {
          employeeCode: "EMP001",
          firstName: "Ivan",
          lastName: "Petrenko",
          role: "TEACHER",
          phone: "123456789",
          email: "ivan@example.com",
          status: "ACTIVE"
        }
      });

      expect(result).toEqual(employee);
    });

    test("converts empty phone and email to null", async () => {
      prisma.employee.findUnique.mockResolvedValue(null);
      prisma.employee.create.mockResolvedValue(employee);

      await employeesService.create({
        employeeCode: "EMP001",
        firstName: "Ivan",
        lastName: "Petrenko",
        role: "TEACHER",
        phone: "",
        email: ""
      });

      expect(prisma.employee.create).toHaveBeenCalledWith({
        data: {
          employeeCode: "EMP001",
          firstName: "Ivan",
          lastName: "Petrenko",
          role: "TEACHER",
          phone: null,
          email: null,
          status: "ACTIVE"
        }
      });
    });

    test("rejects duplicate employee code", async () => {
      prisma.employee.findUnique.mockResolvedValue(employee);

      await expect(
        employeesService.create({
          employeeCode: "EMP001",
          firstName: "Ivan",
          lastName: "Petrenko",
          role: "TEACHER"
        })
      ).rejects.toMatchObject({ code: "EMPLOYEE_CODE_EXISTS" });

      expect(prisma.employee.create).not.toHaveBeenCalled();
    });

    test("converts Prisma unique constraint error", async () => {
      prisma.employee.findUnique.mockResolvedValue(null);
      prisma.employee.create.mockRejectedValue({ code: "P2002" });

      await expect(
        employeesService.create({
          employeeCode: "EMP001",
          firstName: "Ivan",
          lastName: "Petrenko",
          role: "TEACHER"
        })
      ).rejects.toMatchObject({ code: "EMPLOYEE_CODE_EXISTS" });
    });
  });

  describe("update", () => {
    beforeEach(() => {
      prisma.employee.findUnique.mockImplementation(({ where }) => {
        if (where.id) return Promise.resolve(employee);
        return Promise.resolve(null);
      });
      prisma.employee.update.mockResolvedValue(employee);
    });

    test("updates employee data", async () => {
      const result = await employeesService.update("employee-1", {
        firstName: "Petro"
      });

      expect(prisma.employee.update).toHaveBeenCalledWith({
        where: { id: "employee-1" },
        data: { firstName: "Petro" }
      });

      expect(result).toEqual(employee);
    });

    test("converts empty phone and email to null", async () => {
      await employeesService.update("employee-1", {
        phone: "",
        email: ""
      });

      expect(prisma.employee.update).toHaveBeenCalledWith({
        where: { id: "employee-1" },
        data: { phone: null, email: null }
      });
    });

    test("rejects update when employee does not exist", async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        employeesService.update("missing", { firstName: "Petro" })
      ).rejects.toMatchObject({ code: "EMPLOYEE_NOT_FOUND" });

      expect(prisma.employee.update).not.toHaveBeenCalled();
    });

    test("rejects duplicate employee code", async () => {
      prisma.employee.findUnique.mockImplementation(({ where }) => {
        if (where.id) return Promise.resolve(employee);
        return Promise.resolve({ id: "employee-2", employeeCode: "EMP002" });
      });

      await expect(
        employeesService.update("employee-1", {
          employeeCode: "EMP002"
        })
      ).rejects.toMatchObject({ code: "EMPLOYEE_CODE_EXISTS" });
    });

    test("rejects role change when employee has active group assignments", async () => {
      prisma.staffAssignment.count.mockResolvedValue(1);

      await expect(
        employeesService.update("employee-1", { role: "MANAGER" })
      ).rejects.toMatchObject({ code: "EMPLOYEE_HAS_ASSIGNMENTS" });

      expect(prisma.employee.update).not.toHaveBeenCalled();
    });

    test("rejects role change when employee has assigned subjects", async () => {
      prisma.teacherSubject.count.mockResolvedValue(1);

      await expect(
        employeesService.update("employee-1", { role: "MANAGER" })
      ).rejects.toMatchObject({ code: "EMPLOYEE_HAS_SUBJECTS" });
    });

    test("rejects role change when employee has active scheduled lessons", async () => {
      prisma.scheduleItem.count.mockResolvedValue(1);

      await expect(
        employeesService.update("employee-1", { role: "MANAGER" })
      ).rejects.toMatchObject({ code: "EMPLOYEE_HAS_SCHEDULE_ITEMS" });
    });

    test("allows update when employee has no active responsibilities", async () => {
      prisma.employee.update.mockResolvedValue({
        ...employee,
        firstName: "Petro"
      });

      const result = await employeesService.update("employee-1", {
        firstName: "Petro"
      });

      expect(result.firstName).toBe("Petro");
      expect(prisma.employee.update).toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    test("archives employee when there are no active responsibilities", async () => {
      prisma.employee.findUnique.mockResolvedValue(employee);
      prisma.employee.update.mockResolvedValue({
        ...employee,
        status: "ARCHIVED"
      });

      const result = await employeesService.remove("employee-1");

      expect(prisma.employee.update).toHaveBeenCalledWith({
        where: { id: "employee-1" },
        data: {
          status: "ARCHIVED",
          archivedAt: expect.any(Date)
        }
      });

      expect(result.status).toBe("ARCHIVED");
    });

    test("rejects removal when employee has active responsibilities", async () => {
      prisma.employee.findUnique.mockResolvedValue(employee);
      prisma.staffAssignment.count.mockResolvedValue(1);

      await expect(
        employeesService.remove("employee-1")
      ).rejects.toMatchObject({
        code: "EMPLOYEE_HAS_RESPONSIBILITIES"
      });

      expect(prisma.employee.update).not.toHaveBeenCalled();
    });

    test("rejects removal when employee does not exist", async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        employeesService.remove("missing")
      ).rejects.toMatchObject({ code: "EMPLOYEE_NOT_FOUND" });

      expect(prisma.employee.update).not.toHaveBeenCalled();
    });
  });
});
