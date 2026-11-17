const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/app-error");
const HTTP_STATUS = require("../../../utils/http-status");
const auditService = require("../../audit/audit.service");

function fail(message, status, code) {
  throw new AppError(message, status, code);
}

function handlePrismaError(error) {
  if (error.code === "P2002") {
    fail("Discount name already exists", HTTP_STATUS.CONFLICT, "DISCOUNT_NAME_EXISTS");
  }

  if (error.code === "P2025") {
    fail("Discount not found", HTTP_STATUS.NOT_FOUND, "DISCOUNT_NOT_FOUND");
  }

  throw error;
}

async function create({ name, value }, actorId) {
  const normalizedName = name.trim();

  if (![10, 12, 20, 30].includes(value)) {
    fail(
      "Discount value must be 10, 20, or 30",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      "INVALID_DISCOUNT_VALUE"
    );
  }

  const existing = await prisma.discount.findFirst({
    where: {
      name: {
        equals: normalizedName,
        mode: "insensitive"
      }
    }
  });

  if (existing) {
    fail("Discount name already exists", HTTP_STATUS.CONFLICT, "DISCOUNT_NAME_EXISTS");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const discount = await tx.discount.create({
        data: {
          name: normalizedName,
          type: "PERCENTAGE",
          percentage: value,
          isActive: true
        }
      });

      await auditService.createLog(
        {
          actorId,
          action: "CREATE",
          entityType: "Discount",
          entityId: discount.id,
          after: discount
        },
        tx
      );

      return discount;
    });
  } catch (error) {
    handlePrismaError(error);
  }
}

async function ensureDefaultDiscounts() {
  const defaults = [
    { name: "Знижка 10%", percentage: 10 },
    { name: "Знижка 20%", percentage: 20 },
    { name: "Знижка 30%", percentage: 30 },
    { name: "Річна передоплата 12%", percentage: 12 }
  ];

  for (const item of defaults) {
    const existing = await prisma.discount.findFirst({
      where: { percentage: item.percentage }
    });

    if (existing) {
      if (!existing.isActive || existing.type !== "PERCENTAGE") {
        await prisma.discount.update({
          where: { id: existing.id },
          data: { isActive: true, type: "PERCENTAGE", fixedAmount: null }
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
}

async function getAll(includeInactive = false) {
  await ensureDefaultDiscounts();

  return prisma.discount.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: {
      percentage: "asc"
    }
  });
}

async function getById(id) {
  const discount = await prisma.discount.findUnique({
    where: { id }
  });

  if (!discount) {
    fail("Discount not found", HTTP_STATUS.NOT_FOUND, "DISCOUNT_NOT_FOUND");
  }

  return discount;
}

async function deactivate(id, actorId) {
  try {
    return await prisma.$transaction(async (tx) => {
      const discount = await tx.discount.findUnique({
        where: { id }
      });

      if (!discount) {
        fail("Discount not found", HTTP_STATUS.NOT_FOUND, "DISCOUNT_NOT_FOUND");
      }

      if (!discount.isActive) {
        return discount;
      }

      const updatedDiscount = await tx.discount.update({
        where: { id },
        data: {
          isActive: false
        }
      });

      await auditService.createLog(
        {
          actorId,
          action: "ARCHIVE",
          entityType: "Discount",
          entityId: discount.id,
          before: discount,
          after: updatedDiscount
        },
        tx
      );

      return updatedDiscount;
    });
  } catch (error) {
    handlePrismaError(error);
  }
}

module.exports = {
  create,
  getAll,
  getById,
  deactivate
};
