const Joi = require("joi");

// Дозволені типи дій із prisma/schema.prisma.
const auditActionSchema = Joi.string().valid(
  "CREATE",
  "UPDATE",
  "DELETE",
  "ARCHIVE",
  "RESTORE",
  "PAYMENT",
  "CANCEL"
);

// Фільтри для пошуку записів аудиту.
const auditFiltersSchema = Joi.object({
  from: Joi.date().iso(),
  to: Joi.date().iso(),
  entityType: Joi.string().trim().min(1).max(100),
  action: auditActionSchema
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

module.exports = {
  auditActionSchema,
  auditFiltersSchema
};
