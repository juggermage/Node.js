const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const createRateSchema = Joi.object({
  employeeId: objectId.required(),
  validFrom: Joi.date().iso().required(),
  validTo: Joi.date().iso().greater(Joi.ref("validFrom")).allow(null)
});

const createCalculationSchema = Joi.object({
  periodYear: Joi.number().integer().min(2000).max(2100).required(),
  periodMonth: Joi.number().integer().min(1).max(12).required(),
  employeeId: objectId.optional()
});

const listRatesSchema = Joi.object({
  employeeId: objectId.optional()
});

const listCalculationsSchema = Joi.object({
  employeeId: objectId.optional(),
  periodYear: Joi.number().integer().min(2000).max(2100),
  periodMonth: Joi.number().integer().min(1).max(12),
  status: Joi.string().valid("DRAFT", "APPROVED", "PAID", "CANCELLED")
})
  .with("periodMonth", "periodYear")
  .with("periodYear", "periodMonth");

const idParamsSchema = Joi.object({
  id: objectId.required()
});

module.exports = {
  createRateSchema,
  createCalculationSchema,
  listRatesSchema,
  listCalculationsSchema,
  idParamsSchema
};
