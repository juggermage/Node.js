
require("dotenv").config();

const prisma = require("../src/config/prisma");

async function main() {
  await prisma.$connect();

  const userCount = await prisma.user.count();

  console.log("MongoDB connected successfully!");
  console.log("Users in database:", userCount);
}

main()
  .catch((error) => {
    console.error("Database connection failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
