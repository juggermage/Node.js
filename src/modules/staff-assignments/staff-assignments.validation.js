const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const createAssignmentSchema = Joi.object({
  employeeId: objectId.required(),
  groupId: objectId.required(),
  role: Joi.string().valid("EDUCATOR", "ASSISTANT").required()
});

const idParamsSchema = Joi.object({
  id: objectId.required()
});

const groupParamsSchema = Joi.object({
  groupId: objectId.required()
});

const employeeParamsSchema = Joi.object({
  employeeId: objectId.required()
});

module.exports = {
  createAssignmentSchema,
  idParamsSchema,
  groupParamsSchema,
  employeeParamsSchema
};
