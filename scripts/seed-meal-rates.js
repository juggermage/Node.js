const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const DEFAULT_RATES = [
  { ageYears: 2, amount: 300n },
  { ageYears: 3, amount: 400n },
  { ageYears: 4, amount: 500n },
  { ageYears: 5, amount: 600n }
];

async function main() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (const rate of DEFAULT_RATES) {
    const existingRate = await prisma.mealRate.findFirst({
      where: { ageYears: rate.ageYears },
      select: { id: true }
    });

    if (existingRate) {
      console.log(`A${rate.ageYears}: existing tariff found, skipped`);
      continue;
    }

    await prisma.mealRate.create({
      data: {
        ...rate,
        validFrom: today,
        validTo: null
      }
    });

    console.log(`A${rate.ageYears}: default tariff created`);
  }
}

main()
  .catch((error) => {
    console.error("Failed to seed meal rates:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
