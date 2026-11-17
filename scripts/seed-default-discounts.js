require("dotenv").config();

const prisma = require("../src/config/prisma");

const discounts = [
  { name: "Знижка 10%", percentage: 10 },
  { name: "Знижка 20%", percentage: 20 },
  { name: "Знижка 30%", percentage: 30 },
  { name: "Річна передоплата 12%", percentage: 12 }
];

async function main() {
  for (const item of discounts) {
    const existing = await prisma.discount.findFirst({
      where: { name: item.name }
    });

    if (existing) {
      if (
        !existing.isActive ||
        existing.type !== "PERCENTAGE" ||
        existing.percentage !== item.percentage
      ) {
        await prisma.discount.update({
          where: { id: existing.id },
          data: {
            type: "PERCENTAGE",
            percentage: item.percentage,
            fixedAmount: null,
            isActive: true
          }
        });
      }
      continue;
    }

    await prisma.discount.create({
      data: {
        name: item.name,
        type: "PERCENTAGE",
        percentage: item.percentage,
        isActive: true
      }
    });
  }

  process.stdout.write(
    "Стандартні знижки 10%, 20%, 30% і річну знижку 12% перевірено. Існуючі записи не видалялися.\n"
  );
}

main()
  .catch((error) => {
    process.stderr.write(`Помилка створення стандартних знижок: ${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
