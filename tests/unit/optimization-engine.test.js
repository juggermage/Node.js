const { optimize, calculateManual } = require('../../src/modules/optimization/optimization.engine');

const base = {
  children: { A2: 0, A3: 43, A4: 0, A5: 0 },
  attendanceDays: { A2: 0, A3: 20, A4: 0, A5: 0 },
  weeklyLessonMinutesPerGroup: 600
};

describe('Optimization engine', () => {
  test('allocates exact child counts without exceeding room and group limits', () => {
    const result = optimize(base).result;
    expect(result.configuration.children).toBe(43);
    expect(result.configuration.groups).toBeLessThanOrEqual(12);
    expect(result.groups.reduce((sum, group) => sum + group.children, 0)).toBe(43);
    expect(result.groups.every((group) => group.children <= 20)).toBe(true);
  });

  test('uses one total monthly rent amount, not rent per room', () => {
    const result = optimize(base).result;
    expect(result.expenses.rent).toBe('5000000');
  });

  test('keeps parent meal income separate from tuition', () => {
    const result = optimize(base).result;
    expect(BigInt(result.revenue.tuition)).toBe(64500000n);
    expect(BigInt(result.revenue.meals)).toBe(32000000n);
  });

  test('enforces the A2 group capacity', () => {
    expect(() => optimize({ ...base, children: { A2: 16, A3: 0, A4: 0, A5: 0 }, attendanceDays: { A2: 20, A3: 0, A4: 0, A5: 0 } })).not.toThrow();
    const result = optimize({ ...base, children: { A2: 16, A3: 0, A4: 0, A5: 0 }, attendanceDays: { A2: 20, A3: 0, A4: 0, A5: 0 } }).result;
    expect(result.groups.length).toBeGreaterThanOrEqual(2);
    expect(result.groups.every((group) => group.children <= 15)).toBe(true);
  });

  test('manual configuration must match entered child totals', () => {
    expect(() => calculateManual({ ...base, groups: [{ ageCategory: 'A3', children: 42 }] })).toThrow('не дорівнює');
  });
});
  test('uses the active teacher count supplied by the database', () => {
    const result = optimize({ ...base, weeklyLessonMinutesPerGroup: null, teacherCount: 8 }).result;
    expect(result.configuration.teachers).toBe(8);
    expect(result.expenses.teachers).toBe('32000000');
    expect(result.warnings.some((warning) => warning.includes('Не задано тижневе навантаження'))).toBe(false);
  });

