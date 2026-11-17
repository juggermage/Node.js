require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function ageInMonths(birthDate, referenceDate = new Date()) {
  const birth = new Date(birthDate);
  const reference = new Date(referenceDate);
  let months = (reference.getUTCFullYear() - birth.getUTCFullYear()) * 12 + reference.getUTCMonth() - birth.getUTCMonth();
  if (reference.getUTCDate() < birth.getUTCDate()) months--;
  return months;
}

function isActive(enrollment) {
  return enrollment.endDate === null || enrollment.endDate === undefined;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("У .env не задано DATABASE_URL.");
  const databaseName = new URL(process.env.DATABASE_URL).pathname.replace(/^\/+/, "").split("?")[0];
  const confirmation = process.env.DEMO_ENROLLMENT_REPAIR_CONFIRM_DB;
  if (!confirmation || confirmation !== databaseName) {
    throw new Error(`Захист від випадкового запуску. Поточна база: "${databaseName}". Додай у .env DEMO_ENROLLMENT_REPAIR_CONFIRM_DB="${databaseName}" і повтори запуск.`);
  }

  await prisma.group.updateMany({
    where: { status: "ACTIVE" },
    data: { capacity: 20 }
  });

  await prisma.room.updateMany({
    where: { purpose: "GROUP_BASE", status: "ACTIVE" },
    data: { capacity: 20 }
  });

  const [groups, children, allEnrollments] = await Promise.all([
    prisma.group.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
    prisma.child.findMany({ where: { status: "ACTIVE", childCode: { startsWith: "DEMO-CH-" } }, orderBy: { childCode: "asc" } }),
    prisma.groupEnrollment.findMany({
      where: { OR: [{ endDate: null }, { endDate: { isSet: false } }] },
      include: { child: true, group: true },
      orderBy: { startDate: "desc" }
    })
  ]);

  if (!groups.length) throw new Error("У базі немає активних груп.");
  if (!children.length) throw new Error("Не знайдено активних DEMO-CH дітей.");

  const demoIds = new Set(children.map(child => child.id));
  const now = new Date();
  const counts = new Map(groups.map(group => [group.id, 0]));
  const activeByChild = new Map();
  for (const enrollment of allEnrollments) {
    if (!groups.some(group => group.id === enrollment.groupId)) continue;
    if (!activeByChild.has(enrollment.childId)) activeByChild.set(enrollment.childId, []);
    activeByChild.get(enrollment.childId).push(enrollment);
  }

  const closeIds = [];
  const retained = new Set();
  for (const [childId, enrollments] of activeByChild.entries()) {
    const child = enrollments[0].child;
    const valid = enrollments.filter(item => {
      const group = groups.find(g => g.id === item.groupId);
      if (!group || !child || child.status !== "ACTIVE") return false;
      const age = ageInMonths(child.birthDate, now);
      return age >= group.ageFromMonths && age <= group.ageToMonths;
    });

    if (!demoIds.has(childId)) {
      for (const item of enrollments) {
        retained.add(item.id);
        counts.set(item.groupId, (counts.get(item.groupId) || 0) + 1);
      }
      continue;
    }

    if (valid.length) {
      const keep = valid[0];
      retained.add(keep.id);
      counts.set(keep.groupId, (counts.get(keep.groupId) || 0) + 1);
      for (const item of enrollments) if (item.id !== keep.id) closeIds.push(item.id);
    } else {
      for (const item of enrollments) closeIds.push(item.id);
    }
  }

  for (const group of groups) {
    const count = counts.get(group.id) || 0;
    if (count > group.capacity) {
      const demoInGroup = allEnrollments
        .filter(item => item.groupId === group.id && demoIds.has(item.childId) && retained.has(item.id))
        .sort((a, b) => b.startDate - a.startDate);
      for (const item of demoInGroup) {
        if ((counts.get(group.id) || 0) <= group.capacity) break;
        retained.delete(item.id);
        closeIds.push(item.id);
        counts.set(group.id, counts.get(group.id) - 1);
      }
    }
  }

  const uniqueCloseIds = [...new Set(closeIds)];
  if (uniqueCloseIds.length) {
    await prisma.groupEnrollment.updateMany({ where: { id: { in: uniqueCloseIds } }, data: { endDate: now } });
  }

  const existingDemoActive = new Set([...retained].map(id => allEnrollments.find(item => item.id === id)?.childId).filter(Boolean));
  const assignments = [];
  const skipped = [];

  for (const child of children) {
    if (existingDemoActive.has(child.id)) continue;
    const age = ageInMonths(child.birthDate, now);
    const candidates = groups
      .filter(group => age >= group.ageFromMonths && age <= group.ageToMonths && (counts.get(group.id) || 0) < group.capacity)
      .sort((a, b) => (counts.get(a.id) || 0) - (counts.get(b.id) || 0));
    const group = candidates[0];
    if (!group) {
      skipped.push({ child: child.childCode, age, reason: "Немає групи відповідного віку з вільним місцем" });
      continue;
    }
    await prisma.groupEnrollment.create({ data: { childId: child.id, groupId: group.id, startDate: child.enrolledAt || now } });
    counts.set(group.id, (counts.get(group.id) || 0) + 1);
    existingDemoActive.add(child.id);
    assignments.push({ child: child.childCode, group: group.name });
  }

  const finalEnrollments = await prisma.groupEnrollment.findMany({
    where: { OR: [{ endDate: null }, { endDate: { isSet: false } }] },
    select: { groupId: true }
  });
  const countMap = new Map();
  for (const item of finalEnrollments) countMap.set(item.groupId, (countMap.get(item.groupId) || 0) + 1);

  console.log(`База: ${databaseName}`);
  console.log(`Активних груп: ${groups.length}`);
  console.log(`Активних демонстраційних дітей: ${children.length}`);
  console.log(`Закрито неправильних/дубльованих зарахувань: ${uniqueCloseIds.length}`);
  console.log(`Створено нових зарахувань: ${assignments.length}`);
  console.log("Поточне наповнення груп:");
  for (const group of groups) console.log(`- ${group.name}: ${countMap.get(group.id) || 0}/${group.capacity}`);
  if (skipped.length) {
    console.log("Діти без відповідної вікової групи:");
    for (const item of skipped) console.log(`- ${item.child}: ${item.age} міс. — ${item.reason}`);
  }
  console.log("Зарахування дітей, які не належать до DEMO-набору, не змінювалися.");
}

main().catch(error => {
  console.error("Помилка відновлення зарахувань:", error.message);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
