const AppError = require('../../utils/app-error');
const SETTINGS = Object.freeze({
  groupRooms: 12,
  specialistRooms: 8,
  maxChildrenPerGroup: 20,
  tuitionPerChild: 1500000n,
  rent: 5000000n,
  managerSalary: 8000000n,
  administratorSalary: 6000000n,
  teacherSalary: 4000000n,
  teacherWeeklyCapacityMinutes: 2400,
  mealIncomePerDay: { A2: 10000n, A3: 20000n, A4: 30000n, A5: 40000n },
  foodCostPerDay: { A2: 10000n, A3: 20000n, A4: 30000n, A5: 40000n }
});

const AGE_LIMITS = Object.freeze({ A2: 20, A3: 20, A4: 20, A5: 20 });
const AGE_KEYS = Object.keys(AGE_LIMITS);
const money = (value) => value.toString();

function assertInteger(value, label, min = 0, max = 10000) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new AppError(`${label}: значення має бути цілим числом від ${min} до ${max}`, 422, 'INVALID_OPTIMIZATION_INPUT');
  }
}

function normalizeInput(input) {
  const children = {};
  const attendanceDays = {};
  for (const age of AGE_KEYS) {
    const count = input.children?.[age] ?? 0;
    const days = input.attendanceDays?.[age];
    assertInteger(count, `children.${age}`, 0, 240);
    assertInteger(days, `attendanceDays.${age}`, 0, 31);
    children[age] = count;
    attendanceDays[age] = days;
  }
  const total = AGE_KEYS.reduce((sum, age) => sum + children[age], 0);
  if (total > 240) {
    throw new AppError('Загальна кількість дітей перевищує місткість 12 групових кімнат', 422, 'KINDERGARTEN_CAPACITY_EXCEEDED');
  }
  const weeklyLessonMinutesPerGroup = input.weeklyLessonMinutesPerGroup ?? null;
  const teacherCount = input.teacherCount ?? null;
  const otherMonthlyExpenses = input.otherMonthlyExpenses ?? 0;
  if (teacherCount !== null) {
    assertInteger(teacherCount, 'teacherCount', 0, 100);
  }
  assertInteger(otherMonthlyExpenses, 'otherMonthlyExpenses', 0, 100000000);
  if (weeklyLessonMinutesPerGroup !== null) {
    assertInteger(weeklyLessonMinutesPerGroup, 'weeklyLessonMinutesPerGroup', 0, 2400);
  }
  return { children, attendanceDays, weeklyLessonMinutesPerGroup, teacherCount, otherMonthlyExpenses };
}

function partitionForAge(children, maxSize, groupCount) {
  if (children === 0) return groupCount === 0 ? [] : null;
  if (groupCount < Math.ceil(children / maxSize) || groupCount > children) return null;
  const base = Math.floor(children / groupCount);
  const extra = children % groupCount;
  const sizes = Array.from({ length: groupCount }, (_, index) => base + (index < extra ? 1 : 0));
  return sizes.every((size) => size >= 1 && size <= maxSize) ? sizes : null;
}

function groupPayroll(size) {
  return {
    educator: 200000n * BigInt(size) + 500000n * BigInt(Math.max(0, size - 12)),
    assistant: 2000000n + 300000n * BigInt(Math.max(0, size - 12))
  };
}

function evaluate(groupsByAge, input, name = 'Сценарій') {
  const groups = [];
  let educators = 0n;
  let assistants = 0n;
  let childrenCount = 0;
  let mealIncome = 0n;
  let foodCost = 0n;
  let groupNumber = 1;
  for (const age of AGE_KEYS) {
    const days = input.attendanceDays[age];
    for (const size of groupsByAge[age] || []) {
      const salary = groupPayroll(size);
      educators += salary.educator;
      assistants += salary.assistant;
      childrenCount += size;
      groups.push({ name: `${age}-${groupNumber++}`, ageCategory: age, children: size, educatorSalary: money(salary.educator), assistantSalary: money(salary.assistant) });
    }
    mealIncome += BigInt(input.children[age]) * BigInt(days) * SETTINGS.mealIncomePerDay[age];
    foodCost += BigInt(input.children[age]) * BigInt(days) * SETTINGS.foodCostPerDay[age];
  }
  const groupCount = groups.length;
  const tuition = BigInt(childrenCount) * SETTINGS.tuitionPerChild;
  const teacherMinutes = input.weeklyLessonMinutesPerGroup === null ? null : groupCount * input.weeklyLessonMinutesPerGroup;
  const calculatedTeacherCount = teacherMinutes === null ? null : Math.ceil(teacherMinutes / SETTINGS.teacherWeeklyCapacityMinutes);
  const teacherCount = input.teacherCount ?? calculatedTeacherCount;
  const teacherCost = teacherCount === null ? 0n : BigInt(teacherCount) * SETTINGS.teacherSalary;
  const fixedSalaries = SETTINGS.managerSalary + SETTINGS.administratorSalary;
  const payroll = educators + assistants + fixedSalaries + teacherCost;
  const revenue = tuition + mealIncome;
  const otherCosts = BigInt(input.otherMonthlyExpenses) * 100n;
  const expenses = foodCost + payroll + SETTINGS.rent + otherCosts;
  const warnings = [];
  if (teacherCount === null) warnings.push('Не задано тижневе навантаження занять на групу; зарплата та кількість викладачів не включені до прогнозу.');
  warnings.push('Оплата харчування батьками є цільовими коштами: дохід і витрати на замовлення готової їжі враховані в однаковому розмірі, тому не збільшують і не зменшують прибуток.');
  warnings.push('Інші операційні витрати не задані; комунальні послуги, матеріали та обслуговування не включені.');
  warnings.push('Розрахунок не створює розклад і не перевіряє конкретні часові перетини занять у 8 спеціалізованих кімнатах. Для цього використовується окремий модуль розкладу.');
  if (groupCount > SETTINGS.groupRooms) warnings.push('Перевищено кількість групових кімнат.');
  return {
    name,
    feasible: groupCount <= SETTINGS.groupRooms,
    configuration: { children: childrenCount, groups: groupCount, groupRoomsUsed: groupCount, groupRoomsAvailable: SETTINGS.groupRooms, specialistRoomsAvailable: SETTINGS.specialistRooms, teachers: teacherCount, weeklyLessonMinutes: teacherMinutes },
    groups,
    revenue: { tuition: money(tuition), meals: money(mealIncome), total: money(revenue) },
    expenses: { food: money(foodCost), educators: money(educators), assistants: money(assistants), manager: money(SETTINGS.managerSalary), administrator: money(SETTINGS.administratorSalary), teachers: money(teacherCost), salaries: money(payroll), rent: money(SETTINGS.rent), other: money(otherCosts), total: money(expenses) },
    profit: money(revenue - expenses), warnings
  };
}

function optimize(input) {
  const normalized = normalizeInput(input);
  const partitions = {};
  for (const age of AGE_KEYS) {
    partitions[age] = [];
    const count = normalized.children[age];
    const limit = AGE_LIMITS[age];
    const minGroups = count === 0 ? 0 : Math.ceil(count / limit);
    for (let groups = minGroups; groups <= Math.min(count, SETTINGS.groupRooms); groups += 1) {
      const sizes = partitionForAge(count, limit, groups);
      if (sizes) partitions[age].push({ groups, sizes });
    }
  }
  let best = null;
  let bestGroupPayroll = null;
  function combine(index, chosen, totalGroups, payroll) {
    if (totalGroups > SETTINGS.groupRooms) return;
    if (index === AGE_KEYS.length) {
      const result = evaluate(chosen, normalized, 'Найприбутковіший сценарій');
      const totalCost = BigInt(result.expenses.educators) + BigInt(result.expenses.assistants) + BigInt(result.expenses.teachers);
      if (best === null || totalCost < bestGroupPayroll) {
        best = result;
        bestGroupPayroll = totalCost;
      }
      return;
    }
    const age = AGE_KEYS[index];
    for (const candidate of partitions[age]) {
      chosen[age] = candidate.sizes;
      combine(index + 1, chosen, totalGroups + candidate.groups, payroll + 0n);
    }
  }
  combine(0, {}, 0, 0n);
  if (!best) {
    throw new AppError('Неможливо розмістити введену кількість дітей у 12 групах', 422, 'NO_VALID_GROUP_CONFIGURATION');
  }
  return { rules: { groupRooms: SETTINGS.groupRooms, specialistRooms: SETTINGS.specialistRooms, maxChildrenPerGroup: SETTINGS.maxChildrenPerGroup, tuitionPerChild: money(SETTINGS.tuitionPerChild), rentTotalPerMonth: money(SETTINGS.rent), managerSalary: money(SETTINGS.managerSalary), administratorSalary: money(SETTINGS.administratorSalary), teacherSalary: money(SETTINGS.teacherSalary), maxChildrenPerGroupByAge: AGE_LIMITS }, input: normalized, result: best };
}

function compare(input) {
  const results = input.scenarios.map((scenario) => ({ ...optimize(scenario).result, name: scenario.name }));
  results.sort((a, b) => { const left = BigInt(a.profit); const right = BigInt(b.profit); return left === right ? 0 : left > right ? -1 : 1; });
  return { scenarios: results.map((item, index) => ({ ...item, rank: index + 1 })), mostProfitable: results[0] || null };
}

function calculateManual(input) {
  const normalized = normalizeInput(input);
  if (!Array.isArray(input.groups) || input.groups.length > SETTINGS.groupRooms) {
    throw new AppError('Можна задати не більше 12 груп', 422, 'INVALID_GROUP_COUNT');
  }
  const groupsByAge = Object.fromEntries(AGE_KEYS.map((age) => [age, []]));
  for (const group of input.groups) {
    if (!AGE_KEYS.includes(group.ageCategory)) throw new AppError(`Невідома вікова категорія: ${group.ageCategory}`, 422, 'INVALID_AGE_CATEGORY');
    assertInteger(group.children, 'group.children', 1, AGE_LIMITS[group.ageCategory]);
    groupsByAge[group.ageCategory].push(group.children);
  }
  for (const age of AGE_KEYS) {
    const sum = groupsByAge[age].reduce((a, b) => a + b, 0);
    if (sum !== normalized.children[age]) {
      throw new AppError(`Сума дітей у групах ${age} (${sum}) не дорівнює заданій кількості (${normalized.children[age]})`, 422, 'GROUP_CHILDREN_MISMATCH');
    }
  }
  return evaluate(groupsByAge, normalized, input.name || 'Ручний сценарій');
}

module.exports = { SETTINGS, AGE_LIMITS, optimize, calculateManual, compare };
