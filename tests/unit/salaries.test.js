jest.mock("../../src/config/prisma", () => ({
  $transaction: jest.fn()
}));

const prisma = require("../../src/config/prisma");
const salariesService = require("../../src/modules/billing/salaries/salaries.service");

describe("Salaries service", () => {
  let tx;

  beforeEach(() => {
    jest.clearAllMocks();

    tx = {
      employee: {
        findMany: jest.fn()
      },
      salaryRate: {
        findFirst: jest.fn()
      },
      staffAssignment: {
        findMany: jest.fn()
      },
      groupEnrollment: {
        findMany: jest.fn()
      },
      salaryCalculation: {
        create: jest.fn()
      }
    };

    prisma.$transaction.mockImplementation((callback) => callback(tx));
  });

  function mockRate(overrides = {}) {
    return {
      id: "rate-1",
      type: "FIXED",
      baseAmount: 80000n,
      perChildAmount: 0n,
      childThreshold: null,
      extraChildBonusAmount: 0n,
      validFrom: new Date("2027-01-01T00:00:00.000Z"),
      validTo: null,
      ...overrides
    };
  }

  function mockEmployee(role, overrides = {}) {
    return {
      id: "employee-1",
      role,
      status: "ACTIVE",
      ...overrides
    };
  }

  function mockCalculation(data) {
    return {
      id: "calculation-1",
      ...data,
      employee: { id: data.employeeId },
      calculatedAt: new Date("2027-01-01T00:00:00.000Z")
    };
  }

  async function calculateForEmployee(employee, rate, children = []) {
    tx.employee.findMany.mockResolvedValue([employee]);
    tx.salaryRate.findFirst.mockResolvedValue(rate);

    if (employee.role === "EDUCATOR" || employee.role === "ASSISTANT") {
      tx.staffAssignment.findMany.mockResolvedValue([
        {
          groupId: "group-1",
          endDate: null
        }
      ]);
      tx.groupEnrollment.findMany.mockResolvedValue(children);
    }

    tx.salaryCalculation.create.mockImplementation(({ data }) =>
      Promise.resolve(mockCalculation(data))
    );

    return salariesService.createCalculations({
      periodYear: 2027,
      periodMonth: 1,
      employeeId: employee.id
    });
  }

  test("calculates fixed salary for manager", async () => {
    const result = await calculateForEmployee(
      mockEmployee("MANAGER"),
      mockRate()
    );

    expect(result[0].totalAmount).toBe(80000);
    expect(result[0].baseAmount).toBe(80000);
    expect(result[0].childrenCount).toBe(0);
    expect(result[0].status).toBe("DRAFT");
  });

  test("calculates fixed salary for teacher", async () => {
    const result = await calculateForEmployee(
      mockEmployee("TEACHER"),
      mockRate({
        baseAmount: 40000n
      })
    );

    expect(result[0].totalAmount).toBe(40000);
  });

  test("calculates educator salary for 12 children", async () => {
    const children = Array.from({ length: 12 }, () => ({
      endDate: null
    }));

    const result = await calculateForEmployee(
      mockEmployee("EDUCATOR"),
      mockRate({
        type: "MIXED",
        baseAmount: 0n,
        perChildAmount: 2000n,
        childThreshold: 12,
        extraChildBonusAmount: 5000n
      }),
      children
    );

    expect(result[0].childrenCount).toBe(12);
    expect(result[0].perChildTotal).toBe(24000);
    expect(result[0].bonusAmount).toBe(0);
    expect(result[0].totalAmount).toBe(24000);
  });

  test("calculates educator bonus for children above threshold", async () => {
    const children = Array.from({ length: 16 }, () => ({
      endDate: null
    }));

    const result = await calculateForEmployee(
      mockEmployee("EDUCATOR"),
      mockRate({
        type: "MIXED",
        baseAmount: 0n,
        perChildAmount: 2000n,
        childThreshold: 12,
        extraChildBonusAmount: 5000n
      }),
      children
    );

    expect(result[0].childrenCount).toBe(16);
    expect(result[0].perChildTotal).toBe(32000);
    expect(result[0].bonusAmount).toBe(20000);
    expect(result[0].totalAmount).toBe(52000);
  });

  test("calculates assistant bonus for children above threshold", async () => {
    const children = Array.from({ length: 16 }, () => ({
      endDate: null
    }));

    const result = await calculateForEmployee(
      mockEmployee("ASSISTANT"),
      mockRate({
        type: "MIXED",
        baseAmount: 20000n,
        perChildAmount: 0n,
        childThreshold: 12,
        extraChildBonusAmount: 3000n
      }),
      children
    );

    expect(result[0].childrenCount).toBe(16);
    expect(result[0].bonusAmount).toBe(12000);
    expect(result[0].totalAmount).toBe(32000);
  });

  test("counts only children enrolled at the beginning of the month", async () => {
    const children = [
      { endDate: null },
      { endDate: null },
      { endDate: new Date("2027-02-01T00:00:00.000Z") },
      { endDate: new Date("2026-12-31T00:00:00.000Z") }
    ];

    const result = await calculateForEmployee(
      mockEmployee("EDUCATOR"),
      mockRate({
        type: "MIXED",
        baseAmount: 0n,
        perChildAmount: 2000n,
        childThreshold: 12,
        extraChildBonusAmount: 5000n
      }),
      children
    );

    expect(result[0].childrenCount).toBe(3);
    expect(result[0].totalAmount).toBe(6000);
  });

  test("rejects invalid period month", async () => {
    await expect(
      salariesService.createCalculations({
        periodYear: 2027,
        periodMonth: 13
      })
    ).rejects.toThrow("Invalid period month");

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test("rejects calculation when employee is not found", async () => {
    tx.employee.findMany.mockResolvedValue([]);

    await expect(
      salariesService.createCalculations({
        periodYear: 2027,
        periodMonth: 1,
        employeeId: "missing-employee"
      })
    ).rejects.toThrow("Active employee not found");
  });

  test("rejects calculation when salary rate is missing", async () => {
    tx.employee.findMany.mockResolvedValue([
      mockEmployee("MANAGER")
    ]);
    tx.salaryRate.findFirst.mockResolvedValue(null);

    await expect(
      salariesService.createCalculations({
        periodYear: 2027,
        periodMonth: 1,
        employeeId: "employee-1"
      })
    ).rejects.toThrow("Salary rate not found for the calculation period");
  });

  test("rejects duplicate salary calculation", async () => {
    tx.employee.findMany.mockResolvedValue([
      mockEmployee("MANAGER")
    ]);
    tx.salaryRate.findFirst.mockResolvedValue(mockRate());

    tx.salaryCalculation.create.mockRejectedValue({
      code: "P2002"
    });

    await expect(
      salariesService.createCalculations({
        periodYear: 2027,
        periodMonth: 1,
        employeeId: "employee-1"
      })
    ).rejects.toThrow("Salary calculation already exists for this employee and period");
  });
});