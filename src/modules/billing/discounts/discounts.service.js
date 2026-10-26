const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/AppError");
const { HTTP_STATUS } = require("../../../utils/http-status");

function fail(message, status, code) {
  throw new AppError(message, status, code);
}

async function create({ name, value }) {
  const normalizedName = name.trim();

  const existing = await prisma.discount.findFirst({
    where: {
      name: { equals: normalizedName, mode: "insensitive" }
    }
  });

  if (existing) {
    fail("Discount name already exists", HTTP_STATUS.CONFLICT, "DISCOUNT_NAME_EXISTS");
  }

  if (![10, 20, 30].includes(value)) {
    fail("Discount value must be 10, 20, or 30", HTTP_STATUS.BAD_REQUEST, "INVALID_DISCOUNT_VALUE");
  }

  try {
    return await prisma.discount.create({
      data: {
        name: normalizedName,
        type: "PERCENTAGE",
        value,
        isActive: true
      }
    });
  } catch (error) {
    if (error.code === "P2002") {
      fail("Discount name already exists", HTTP_STATUS.CONFLICT, "DISCOUNT_NAME_EXISTS");
    }

    throw error;
  }
}

async function getAll(includeInactive = false) {
  return prisma.discount.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { value: "asc" }
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

async function deactivate(id) {
  await getById(id);

  return prisma.discount.update({
    where: { id },
    data: { isActive: false }
  });
}

module.exports = {
  create,
  getAll,
  getById,
  deactivate
};
