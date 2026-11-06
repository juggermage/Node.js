const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const createDiscountSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  value: Joi.number().integer().valid(10, 20, 30).required()
});

const idParamsSchema = Joi.object({
  id: objectId.required()
});

const queryDiscountsSchema = Joi.object({
  includeInactive: Joi.boolean().truthy("true").falsy("false")
});

module.exports = {
  createDiscountSchema,
  idParamsSchema,
  queryDiscountsSchema
};
