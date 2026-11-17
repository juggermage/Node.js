const Joi = require("joi");
const entity = Joi.string().valid(
  "children",
  "parents",
  "groups",
  "employees",
  "rooms",
  "subjects"
);
const paramsSchema = Joi.object({
  entity: entity.required(),
  id: Joi.string().hex().length(24).required()
});
module.exports = { paramsSchema };
