const Joi = require("joi");

const roomStatusSchema = Joi.string().valid("ACTIVE", "INACTIVE");

const createRoomSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  purpose: Joi.string().trim().min(1).max(255).required(),
  capacity: Joi.number().integer().min(1).required(),
  status: roomStatusSchema.default("ACTIVE")
});

const updateRoomSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100),
  purpose: Joi.string().trim().min(1).max(255),
  capacity: Joi.number().integer().min(1),
  status: roomStatusSchema
}).min(1);

const roomIdSchema = Joi.object({
  id: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
});

const searchRoomSchema = Joi.object({
  search: Joi.string().trim().max(100).allow(""),
  purpose: Joi.string().trim().max(255).allow(""),
  status: Joi.string().valid("ACTIVE", "INACTIVE", "ARCHIVED")
});

module.exports = {
  createRoomSchema,
  updateRoomSchema,
  roomIdSchema,
  searchRoomSchema
};