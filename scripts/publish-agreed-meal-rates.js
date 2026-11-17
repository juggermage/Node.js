const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const RATES = [
  { ageYears: 2, amount: 100n },
  { ageYears: 3, amount: 200n },
  { ageYears: 4, amount: 300n },
  { ageYears: 5, amount: 400n }
];

async function main() {
  const validFrom = new Date();
  validFrom.setUTCHours(0, 0, 0, 0);
  const previousDay = new Date(validFrom);
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);

  for (const rate of RATES) {
    const current = await prisma.mealRate.findFirst({
      where: { ageYears: rate.ageYears, validTo: null },
      orderBy: { validFrom: "desc" }
    });

    if (current && current.amount === rate.amount) {
      console.log(`A${rate.ageYears}: current rate already matches`);
      continue;
    }

    await prisma.$transaction(async (tx) => {
      if (current && current.validFrom >= validFrom) {
        await tx.mealRate.update({
          where: { id: current.id },
          data: { amount: rate.amount }
        });
        return;
      }
      if (current) {
        await tx.mealRate.update({
          where: { id: current.id },
          data: { validTo: previousDay }
        });
      }

      await tx.mealRate.create({
        data: {
          ageYears: rate.ageYears,
          amount: rate.amount,
          validFrom,
          validTo: null
        }
      });
    });

    console.log(`A${rate.ageYears}: new rate ${Number(rate.amount)} UAH/day published`);
  }
}

main()
  .catch((error) => {
    console.error("Failed to publish meal rates:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
