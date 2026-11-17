require("dotenv").config();

const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const name = process.env.ADMIN_NAME;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL не налаштований у .env");
  }

  if (!name || !email || !password) {
    throw new Error("Вкажи ADMIN_NAME, ADMIN_EMAIL та ADMIN_PASSWORD у файлі .env");
  }

  if (password.length < 8) {
    throw new Error("Пароль повинен містити мінімум 8 символів");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      passwordHash,
      role: "ADMIN",
      isActive: true
    },
    create: {
      name,
      email,
      passwordHash,
      role: "ADMIN",
      isActive: true
    }
  });

  console.log("Адміністратора успішно створено або оновлено!");
  console.log("Email:", admin.email);
  console.log("Роль:", admin.role);
}

main()
  .catch((error) => {
    console.error("Помилка створення адміністратора:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
