require("dotenv").config();

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const CHILD_COUNT = 100;

const GROUPS = [
  { name: "A2 Сонечко 1", category: "A2", from: 24, to: 35, count: 13 },
  { name: "A2 Сонечко 2", category: "A2", from: 24, to: 35, count: 12 },
  { name: "A3 Веселка 1", category: "A3", from: 36, to: 47, count: 13 },
  { name: "A3 Веселка 2", category: "A3", from: 36, to: 47, count: 12 },
  { name: "A4 Зірочки 1", category: "A4", from: 48, to: 59, count: 13 },
  { name: "A4 Зірочки 2", category: "A4", from: 48, to: 59, count: 12 },
  { name: "A5 Джерельце 1", category: "A5", from: 60, to: 71, count: 13 },
  { name: "A5 Джерельце 2", category: "A5", from: 60, to: 71, count: 12 }
];

const FIRST_NAMES = [
  "Артем",
  "Софія",
  "Максим",
  "Анна",
  "Данило",
  "Марія",
  "Матвій",
  "Єва",
  "Олександр",
  "Злата",
  "Михайло",
  "Вікторія",
  "Дмитро",
  "Поліна",
  "Богдан",
  "Анастасія",
  "Іван",
  "Мілана",
  "Тимофій",
  "Вероніка"
];

const LAST_NAMES = [
  "Коваленко",
  "Мельник",
  "Бондаренко",
  "Шевченко",
  "Ткаченко",
  "Кравченко",
  "Олійник",
  "Поліщук",
  "Лисенко",
  "Романюк",
  "Савченко",
  "Мороз",
  "Петренко",
  "Клименко",
  "Бойко",
  "Іваненко"
];

const PARENT_FIRST_NAMES = [
  "Олена",
  "Андрій",
  "Наталія",
  "Олег",
  "Ірина",
  "Сергій",
  "Тетяна",
  "Віталій",
  "Юлія",
  "Роман",
  "Світлана",
  "Володимир"
];

const SUBJECTS = [
  ["Математика та логіка", "Логічне мислення, лічба та базові математичні поняття"],
  ["Мовленнєвий розвиток", "Розвиток мовлення та комунікації"],
  ["Англійська мова", "Початкове знайомство з англійською мовою"],
  ["Пізнання світу та природи", "Пізнання навколишнього світу"],
  ["Мистецтво та творчість", "Малювання, аплікація та творчі заняття"],
  ["Музика", "Музичний розвиток і ритміка"],
  ["Фізичний розвиток", "Рухова активність та координація"],
  ["Конструювання та робототехніка", "Конструювання та прості STEM-завдання"]
];

const SPECIAL_ROOM_NAMES = [
  "Математика та логіка",
  "Мовленнєвий розвиток та англійська",
  "Пізнання світу та природи",
  "Мистецтво та творчість",
  "Музична зала",
  "Танцювальна зала",
  "Спортивна зала",
  "Конструювання та робототехніка"
];

const SPECIAL_ROOM_PURPOSES = [
  "SPECIALIST_MATH_LOGIC",
  "SPECIALIST_LANGUAGE",
  "SPECIALIST_WORLD_DISCOVERY",
  "SPECIALIST_ARTS",
  "SPECIALIST_MUSIC",
  "SPECIALIST_DANCE",
  "SPECIALIST_SPORTS",
  "SPECIALIST_ROBOTICS"
];

function pick(list, index) {
  return list[index % list.length];
}

function dateAtUtc(year, month, day, hour = 0, minute = 0) {
  return new Date(Date.UTC(year, month, day, hour, minute));
}

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function ageBirthDate(months, offset) {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  date.setUTCDate(3 + (offset % 24));
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function money(value) {
  return BigInt(value);
}

async function ensureRelation(model, where, data) {
  const existing = await model.findFirst({ where });
  return existing || model.create({ data });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("У .env не задано DATABASE_URL.");
  }

  const databaseName = new URL(process.env.DATABASE_URL).pathname.replace(/^\/+/, "").split("?")[0];

  const confirmation = process.env.DEMO_SEED_CONFIRM_DB;

  if (!confirmation || confirmation !== databaseName) {
    throw new Error(
      `Захист від випадкового запуску. Поточна база: "${databaseName}". ` +
        `Додай у .env DEMO_SEED_CONFIRM_DB="${databaseName}" і повтори запуск.`
    );
  }

  console.log(`Демонстраційне наповнення бази: ${databaseName}`);
  console.log("Скрипт не видаляє наявні записи.");

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const startOfMonth = dateAtUtc(today.getUTCFullYear(), today.getUTCMonth(), 1);

  const enrollmentDate = dateAtUtc(today.getUTCFullYear(), today.getUTCMonth() - 2, 1);

  const rooms = [];

  for (let i = 1; i <= 12; i++) {
    rooms.push(
      await prisma.room.upsert({
        where: {
          name: `Групова кімната ${String(i).padStart(2, "0")}`
        },
        update: {
          purpose: "GROUP_BASE",
          capacity: 20,
          status: "ACTIVE",
          archivedAt: null
        },
        create: {
          name: `Групова кімната ${String(i).padStart(2, "0")}`,
          purpose: "GROUP_BASE",
          capacity: 20
        }
      })
    );
  }

  for (let i = 0; i < SPECIAL_ROOM_NAMES.length; i++) {
    rooms.push(
      await prisma.room.upsert({
        where: {
          name: SPECIAL_ROOM_NAMES[i]
        },
        update: {
          purpose: SPECIAL_ROOM_PURPOSES[i],
          capacity: 20,
          status: "ACTIVE",
          archivedAt: null
        },
        create: {
          name: SPECIAL_ROOM_NAMES[i],
          purpose: SPECIAL_ROOM_PURPOSES[i],
          capacity: 20
        }
      })
    );
  }

  const roomByName = new Map(rooms.map((room) => [room.name, room]));

  const groupRecords = [];
  let groupIndex = 0;

  for (const spec of GROUPS) {
    const room = roomByName.get(`Групова кімната ${String(groupIndex + 1).padStart(2, "0")}`);

    const group = await prisma.group.upsert({
      where: {
        name: spec.name
      },
      update: {
        ageFromMonths: spec.from,
        ageToMonths: spec.to,
        capacity: 20,
        mealCategory: spec.category,
        mainRoomId: room.id,
        status: "ACTIVE",
        archivedAt: null
      },
      create: {
        name: spec.name,
        ageFromMonths: spec.from,
        ageToMonths: spec.to,
        capacity: 20,
        mealCategory: spec.category,
        mainRoomId: room.id
      }
    });

    groupRecords.push({
      ...spec,
      record: group,
      room
    });

    groupIndex++;
  }

  const manager = await prisma.employee.upsert({
    where: { employeeCode: "DEMO-MANAGER-001" },
    update: {
      firstName: "Оксана",
      lastName: "Керівник",
      role: "MANAGER",
      status: "ACTIVE",
      archivedAt: null
    },
    create: {
      employeeCode: "DEMO-MANAGER-001",
      firstName: "Оксана",
      lastName: "Керівник",
      role: "MANAGER",
      phone: "+380670000001",
      email: "manager.demo@kindergarten.local"
    }
  });

  const educators = [];
  const assistants = [];

  for (let i = 0; i < groupRecords.length; i++) {
    const educator = await prisma.employee.upsert({
      where: {
        employeeCode: `DEMO-EDU-${String(i + 1).padStart(3, "0")}`
      },
      update: {
        role: "EDUCATOR",
        status: "ACTIVE",
        archivedAt: null
      },
      create: {
        employeeCode: `DEMO-EDU-${String(i + 1).padStart(3, "0")}`,
        firstName: pick(PARENT_FIRST_NAMES, i),
        lastName: pick(LAST_NAMES, i + 2),
        role: "EDUCATOR",
        phone: `+380670100${String(i).padStart(3, "0")}`,
        email: `educator${i + 1}@kindergarten.local`
      }
    });

    const assistant = await prisma.employee.upsert({
      where: {
        employeeCode: `DEMO-AST-${String(i + 1).padStart(3, "0")}`
      },
      update: {
        role: "ASSISTANT",
        status: "ACTIVE",
        archivedAt: null
      },
      create: {
        employeeCode: `DEMO-AST-${String(i + 1).padStart(3, "0")}`,
        firstName: pick(PARENT_FIRST_NAMES, i + 4),
        lastName: pick(LAST_NAMES, i + 5),
        role: "ASSISTANT",
        phone: `+380670200${String(i).padStart(3, "0")}`,
        email: `assistant${i + 1}@kindergarten.local`
      }
    });

    educators.push(educator);
    assistants.push(assistant);

    await ensureRelation(
      prisma.staffAssignment,
      {
        employeeId: educator.id,
        groupId: groupRecords[i].record.id,
        endDate: null
      },
      {
        employeeId: educator.id,
        groupId: groupRecords[i].record.id,
        role: "EDUCATOR",
        startDate: enrollmentDate
      }
    );

    await ensureRelation(
      prisma.staffAssignment,
      {
        employeeId: assistant.id,
        groupId: groupRecords[i].record.id,
        endDate: null
      },
      {
        employeeId: assistant.id,
        groupId: groupRecords[i].record.id,
        role: "ASSISTANT",
        startDate: enrollmentDate
      }
    );
  }

  const teachers = [];

  for (let i = 0; i < SUBJECTS.length; i++) {
    const employee = await prisma.employee.upsert({
      where: {
        employeeCode: `DEMO-TEACH-${String(i + 1).padStart(3, "0")}`
      },
      update: {
        role: "TEACHER",
        status: "ACTIVE",
        archivedAt: null
      },
      create: {
        employeeCode: `DEMO-TEACH-${String(i + 1).padStart(3, "0")}`,
        firstName: pick(PARENT_FIRST_NAMES, i + 2),
        lastName: pick(LAST_NAMES, i + 7),
        role: "TEACHER",
        phone: `+380670300${String(i).padStart(3, "0")}`,
        email: `teacher${i + 1}@kindergarten.local`
      }
    });

    teachers.push(employee);
  }

  const subjects = [];

  for (const [name, description] of SUBJECTS) {
    subjects.push(
      await prisma.subject.upsert({
        where: { name },
        update: {
          description,
          status: "ACTIVE",
          archivedAt: null
        },
        create: { name, description }
      })
    );
  }

  for (let i = 0; i < teachers.length; i++) {
    await ensureRelation(
      prisma.teacherSubject,
      {
        employeeId: teachers[i].id,
        subjectId: subjects[i].id
      },
      {
        employeeId: teachers[i].id,
        subjectId: subjects[i].id
      }
    );
  }

  const createdChildren = [];
  let childNumber = 0;

  for (let groupIndex = 0; groupIndex < groupRecords.length; groupIndex++) {
    const groupSpec = groupRecords[groupIndex];

    for (let j = 0; j < groupSpec.count && childNumber < CHILD_COUNT; j++) {
      childNumber++;

      const code = `DEMO-CH-${String(childNumber).padStart(3, "0")}`;

      const child = await prisma.child.upsert({
        where: { childCode: code },
        update: {
          status: "ACTIVE",
          archivedAt: null
        },
        create: {
          childCode: code,
          firstName: pick(FIRST_NAMES, childNumber * 3 + groupIndex),
          lastName: pick(LAST_NAMES, childNumber + groupIndex),
          birthDate: ageBirthDate(
            groupSpec.from + ((j * 3) % (groupSpec.to - groupSpec.from + 1)),
            childNumber
          ),
          enrolledAt: enrollmentDate,
          status: "ACTIVE",
          dietaryNotes:
            childNumber % 13 === 0
              ? "Без горіхів"
              : childNumber % 17 === 0
                ? "Не вживати цитрусові"
                : null,
          notes: childNumber % 19 === 0 ? "Демонстраційний запис для перевірки картки дитини" : null
        }
      });

      createdChildren.push({
        child,
        group: groupSpec.record,
        category: groupSpec.category,
        index: childNumber
      });

      await ensureRelation(
        prisma.groupEnrollment,
        {
          childId: child.id,
          endDate: null
        },
        {
          childId: child.id,
          groupId: groupSpec.record.id,
          startDate: enrollmentDate
        }
      );

      const parentCount = childNumber % 4 === 0 ? 2 : 1;

      for (let parentIndex = 0; parentIndex < parentCount; parentIndex++) {
        const parentCode = `DEMO-P-${String(childNumber).padStart(3, "0")}-${parentIndex + 1}`;

        const phone = `+380${String(670000000 + childNumber * 10 + parentIndex).padStart(9, "0")}`;

        const parentFirstName = pick(PARENT_FIRST_NAMES, childNumber + parentIndex * 3);

        const parentLastName = pick(LAST_NAMES, childNumber + parentIndex * 5);

        const userEmail = `${parentCode.toLowerCase()}@demo.kindergarten.local`;

        let parent = await prisma.parent.findFirst({
          where: { phone }
        });

        let user = await prisma.user.findUnique({
          where: { email: userEmail }
        });

        if (!user) {
          user = await prisma.user.create({
            data: {
              email: userEmail,
              name: `${parentFirstName} ${parentLastName}`,
              role: "PARENT",
              isActive: true
            }
          });
        }

        if (!parent) {
          parent = await prisma.parent.create({
            data: {
              firstName: parentFirstName,
              lastName: parentLastName,
              phone,
              email: `${parentCode.toLowerCase()}@example.local`,
              status: "ACTIVE",
              userId: user.id
            }
          });
        } else if (!parent.userId) {
          parent = await prisma.parent.update({
            where: { id: parent.id },
            data: { userId: user.id }
          });
        }

        const relation =
          parentIndex === 0 ? (childNumber % 2 === 0 ? "MOTHER" : "FATHER") : "GUARDIAN";

        await ensureRelation(
          prisma.childParent,
          {
            childId: child.id,
            parentId: parent.id
          },
          {
            childId: child.id,
            parentId: parent.id,
            relation,
            startDate: enrollmentDate
          }
        );

        await prisma.creditBalance.upsert({
          where: { parentId: parent.id },
          update: {},
          create: {
            parentId: parent.id,
            balance: money(0)
          }
        });
      }
    }
  }

  for (const item of createdChildren) {
    for (let dayOffset = 1; dayOffset <= 28; dayOffset++) {
      const date = addDays(today, -dayOffset);

      if (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
        continue;
      }

      const dayVariant = (item.index + dayOffset) % 17;

      const status =
        dayVariant === 0
          ? "ABSENT"
          : dayVariant === 1
            ? "LATE"
            : dayVariant === 2
              ? "EXCUSED"
              : "PRESENT";

      const dateOnly = dateAtUtc(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

      const existing = await prisma.attendance.findFirst({
        where: {
          childId: item.child.id,
          date: dateOnly
        }
      });

      if (!existing) {
        await prisma.attendance.create({
          data: {
            childId: item.child.id,
            recordedById:
              educators[groupRecords.findIndex((g) => g.record.id === item.group.id)].id,
            date: dateOnly,
            status,
            checkIn:
              status === "PRESENT" || status === "LATE"
                ? dateAtUtc(
                    date.getUTCFullYear(),
                    date.getUTCMonth(),
                    date.getUTCDate(),
                    status === "LATE" ? 9 : 8,
                    status === "LATE" ? 17 : 45
                  )
                : null,
            checkOut:
              status === "PRESENT" || status === "LATE"
                ? dateAtUtc(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 17, 0)
                : null,
            absenceReason:
              status === "ABSENT"
                ? "Демонстраційна відсутність"
                : status === "EXCUSED"
                  ? "Поважна причина"
                  : null
          }
        });
      }
    }
  }

  const tuition = await prisma.tuitionRate.findFirst({
    where: {
      name: "Демонстраційний місячний тариф",
      validTo: null
    }
  });

  if (!tuition) {
    await prisma.tuitionRate.create({
      data: {
        name: "Демонстраційний місячний тариф",
        amount: money(15000),
        validFrom: startOfMonth
      }
    });
  }

  const mealRates = [
    { category: "A2", ageYears: 2, amount: money(300) },
    { category: "A3", ageYears: 3, amount: money(400) },
    { category: "A4", ageYears: 4, amount: money(500) },
    { category: "A5", ageYears: 5, amount: money(600) }
  ];

  for (const rate of mealRates) {
    const exists = await prisma.mealRate.findFirst({
      where: {
        category: rate.category,
        validTo: null
      }
    });

    if (!exists) {
      await prisma.mealRate.create({
        data: {
          ...rate,
          validFrom: startOfMonth
        }
      });
    }
  }

  const salarySpecs = [
    ...educators.map((employee) => ({
      employeeId: employee.id,
      type: "MIXED",
      baseAmount: money(0),
      perChildAmount: money(2000),
      childThreshold: 12,
      extraChildBonusAmount: money(5000)
    })),
    ...assistants.map((employee) => ({
      employeeId: employee.id,
      type: "MIXED",
      baseAmount: money(20000),
      perChildAmount: money(0),
      childThreshold: 12,
      extraChildBonusAmount: money(3000)
    })),
    {
      employeeId: manager.id,
      type: "FIXED",
      baseAmount: money(80000),
      perChildAmount: money(0),
      childThreshold: null,
      extraChildBonusAmount: money(0)
    },
    ...teachers.map((employee) => ({
      employeeId: employee.id,
      type: "FIXED",
      baseAmount: money(40000),
      perChildAmount: money(0),
      childThreshold: null,
      extraChildBonusAmount: money(0)
    }))
  ];

  for (const rate of salarySpecs) {
    const exists = await prisma.salaryRate.findFirst({
      where: {
        employeeId: rate.employeeId,
        validTo: null
      }
    });

    if (!exists) {
      await prisma.salaryRate.create({
        data: {
          employeeId: rate.employeeId,
          type: rate.type,
          baseAmount: rate.baseAmount,
          perChildAmount: rate.perChildAmount,
          childThreshold: rate.childThreshold,
          extraChildBonusAmount: rate.extraChildBonusAmount,
          validFrom: startOfMonth
        }
      });
    }
  }

  console.log("\nГотово. Демонстраційні дані створено/доповнено:");
  console.log(`- Приміщення: ${rooms.length}`);
  console.log(`- Групи: ${groupRecords.length}`);
  console.log(`- Діти: ${createdChildren.length}`);
  console.log(`- Вихователі: ${educators.length}`);
  console.log(`- Помічники: ${assistants.length}`);
  console.log(`- Викладачі: ${teachers.length}`);
  console.log(`- Предмети: ${subjects.length}`);
  console.log("- Відвідування: до 4 попередніх тижнів");
  console.log("- Тарифи та ставки зарплат: перевірено/створено");
  console.log("\nРозклад не створювався — його потрібно згенерувати на сайті.");
  console.log("Адміністратор не створювався — використовуй окремий скрипт.");
}

main()
  .catch((error) => {
    console.error("Помилка seed-demo:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
