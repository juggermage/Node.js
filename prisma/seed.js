require("dotenv").config();

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  const databaseName = new URL(databaseUrl).pathname.slice(1);

  if (databaseName !== "kindergarten_dev") {
    throw new Error("Seed is allowed only for kindergarten_dev");
  }

  console.log("Seeding database:", databaseName);

  // 1. Test rooms
  const classroom = await prisma.room.upsert({
    where: {
      name: "Seed Classroom A"
    },
    update: {},
    create: {
      name: "Seed Classroom A",
      purpose: "Main classroom",
      capacity: 20
    }
  });

  await prisma.room.upsert({
    where: {
      name: "Seed Music Room"
    },
    update: {},
    create: {
      name: "Seed Music Room",
      purpose: "Music lessons",
      capacity: 15
    }
  });

  console.log("Rooms seeded");

  // 2. Test group
  await prisma.group.upsert({
    where: {
      name: "Seed Group A"
    },
    update: {},
    create: {
      name: "Seed Group A",
      ageFromMonths: 24,
      ageToMonths: 71,
      capacity: 20,
      mainRoomId: classroom.id
    }
  });

  console.log("Groups seeded");

  // 3. Test children
  const children = [
    {
      childCode: "SEED-CHILD-001",
      firstName: "Olena",
      lastName: "Koval",
      birthDate: new Date("2022-05-14T00:00:00.000Z")
    },
    {
      childCode: "SEED-CHILD-002",
      firstName: "Andrii",
      lastName: "Melnyk",
      birthDate: new Date("2023-03-20T00:00:00.000Z")
    },
    {
      childCode: "SEED-CHILD-003",
      firstName: "Sofiia",
      lastName: "Bondarenko",
      birthDate: new Date("2021-11-08T00:00:00.000Z")
    }
  ];

  for (const childData of children) {
    await prisma.child.upsert({
      where: {
        childCode: childData.childCode
      },
      update: {},
      create: childData
    });
  }

  console.log("Children seeded");
  console.log("Seed completed successfully");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
