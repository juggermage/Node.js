const Joi = require("joi");
const { PaymentMethod, PaymentStatus } = require("@prisma/client");

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const METHODS = Object.values(PaymentMethod);
const STATUSES = Object.values(PaymentStatus);

const createPaymentSchema = Joi.object({
  payerId: Joi.string().pattern(OBJECT_ID).required(),
  idempotencyKey: Joi.string().trim().min(8).max(128).required(),
  amount: Joi.number().integer().positive().max(Number.MAX_SAFE_INTEGER).required(),
  method: Joi.string()
    .valid(...METHODS)
    .required(),
  paidAt: Joi.date().iso().optional(),
  allocations: Joi.array()
    .items(
      Joi.object({
        invoiceId: Joi.string().pattern(OBJECT_ID).required(),
        amount: Joi.number().integer().positive().max(Number.MAX_SAFE_INTEGER).required()
      }).required()
    )
    .min(1)
    .unique("invoiceId")
    .required()
}).custom((value, helpers) => {
  const allocatedAmount = value.allocations.reduce((sum, item) => sum + item.amount, 0);

  if (!Number.isSafeInteger(allocatedAmount) || allocatedAmount !== value.amount) {
    return helpers.message("The sum of allocations must equal the payment amount");
  }

  return value;
});

const paymentIdSchema = Joi.object({
  id: Joi.string().pattern(OBJECT_ID).required()
});

const listPaymentsSchema = Joi.object({
  payerId: Joi.string().pattern(OBJECT_ID),
  status: Joi.string().valid(...STATUSES),
  from: Joi.date().iso(),
  to: Joi.date().iso()
}).custom((value, helpers) => {
  if (value.from && value.to && value.from > value.to) {
    return helpers.message("from must not be later than to");
  }

  return value;
});

module.exports = {
  createPaymentSchema,
  paymentIdSchema,
  listPaymentsSchema
};
