const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const createAssignmentSchema = Joi.object({
  employeeId: objectId.required(),
  subjectId: objectId.required()
});

const idParamsSchema = Joi.object({
  id: objectId.required()
});

const employeeParamsSchema = Joi.object({
  employeeId: objectId.required()
});

module.exports = {
  createAssignmentSchema,
  idParamsSchema,
  employeeParamsSchema
};
