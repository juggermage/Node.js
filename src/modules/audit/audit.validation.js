const Joi = require("joi");

const objectIdSchema = Joi.string()
  .hex()
  .length(24);

const auditActionSchema = Joi.string().valid(
  "CREATE",
  "UPDATE",
  "DELETE",
  "ARCHIVE",
  "RESTORE",
  "PAYMENT",
  "CANCEL"
);

const auditFiltersSchema = Joi.object({
  from: Joi.date().iso(),
  to: Joi.date().iso(),
  actorId: objectIdSchema,
  entityType: Joi.string().trim().min(1).max(100),
  action: auditActionSchema,
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
})
  .custom((value, helpers) => {
    if (value.from && value.to && value.from > value.to) {
      return helpers.error("date.range");
    }

    return value;
  })
  .messages({
    "date.range": '"from" must be earlier than or equal to "to"'
  });

const auditIdSchema = Joi.object({
  id: objectIdSchema.required()
});

module.exports = {
  auditActionSchema,
  auditFiltersSchema,
  auditIdSchema
};