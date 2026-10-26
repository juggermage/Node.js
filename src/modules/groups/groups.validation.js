const Joi = require("joi");

const objectIdSchema = Joi.string().hex().length(24);

const idParamsSchema = Joi.object({
  id: objectIdSchema.required()
});

const enrollmentParamsSchema = Joi.object({
  enrollmentId: objectIdSchema.required()
});

const childParamsSchema = Joi.object({
  childId: objectIdSchema.required()
});

const createGroupSchema = Joi.object({
  name: Joi.string().trim().min(1).max(50).required(),
  ageFromMonths: Joi.number().integer().min(24).max(71).required(),
  ageToMonths: Joi.number().integer().min(24).max(71).required(),
  capacity: Joi.number().integer().min(1).max(20).default(20),
  mainRoomId: objectIdSchema.allow(null)
});

const updateGroupSchema = Joi.object({
  name: Joi.string().trim().min(1).max(50),
  ageFromMonths: Joi.number().integer().min(24).max(71),
  ageToMonths: Joi.number().integer().min(24).max(71),
  capacity: Joi.number().integer().min(1).max(20),
  mainRoomId: objectIdSchema.allow(null),
  status: Joi.string().valid("ACTIVE", "INACTIVE")
}).min(1);

const queryGroupsSchema = Joi.object({
  search: Joi.string().trim().allow(""),
  status: Joi.string().valid("ACTIVE", "INACTIVE", "ARCHIVED")
});

const enrollChildSchema = Joi.object({
  childId: objectIdSchema.required()
});

const transferChildSchema = Joi.object({
  childId: objectIdSchema.required(),
  toGroupId: objectIdSchema.required()
});

module.exports = {
  idParamsSchema,
  enrollmentParamsSchema,
  childParamsSchema,
  createGroupSchema,
  updateGroupSchema,
  queryGroupsSchema,
  enrollChildSchema,
  transferChildSchema
};
