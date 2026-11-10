const Joi = require("joi");

const isoDate = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .custom((value, helpers) => {
    const date = new Date(`${value}T00:00:00.000Z`);

    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      return helpers.error("date.invalid");
    }

    return value;
  })
  .messages({
    "string.pattern.base": "Date must use YYYY-MM-DD format",
    "date.invalid": "Date must be a valid calendar date"
  });

const periodSchema = Joi.object({
  from: isoDate.required(),
  to: isoDate.required()
})
  .custom((value, helpers) => {
    if (value.from > value.to) {
      return helpers.error("date.range");
    }

    return value;
  })
  .messages({
    "date.range": '"from" must be earlier than or equal to "to"'
  });

const scenarioSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  children: Joi.number().integer().min(0).max(10000).required(),
  groups: Joi.number().integer().min(0).max(1000).required(),
  employees: Joi.number().integer().min(0).max(1000).required(),
  rooms: Joi.number().integer().min(0).max(1000).required()
})
  .custom((value, helpers) => {
    if (value.children > 0 && value.groups === 0) {
      return helpers.error("scenario.groups");
    }

    if (value.children > 0 && value.rooms === 0) {
      return helpers.error("scenario.rooms");
    }

    if (value.children > 0 && value.employees === 0) {
      return helpers.error("scenario.employees");
    }

    return value;
  })
  .messages({
    "scenario.groups": "A scenario with children must include at least one group",
    "scenario.rooms": "A scenario with children must include at least one room",
    "scenario.employees": "A scenario with children must include at least one employee"
  });

const compareScenariosSchema = periodSchema.keys({
  scenarios: Joi.array().items(scenarioSchema).min(1).max(20).required()
});

module.exports = {
  periodSchema,
  compareScenariosSchema
};
