const Joi = require("joi");
const { ScheduleStatus, ScheduleItemType } = require("@prisma/client");

const { WORKING_DAYS } = require("./schedules.config");
const { toMinutes } = require("./schedules.rules");

const SCHEDULE_STATUSES = Object.values(ScheduleStatus);
const ITEM_TYPES = Object.values(ScheduleItemType);

const objectIdSchema = Joi.string().pattern(/^[0-9a-fA-F]{24}$/);

const dateSchema = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .custom((value, helpers) => {
    const date = new Date(`${value}T00:00:00.000Z`);

    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      return helpers.error("any.invalid");
    }

    return value;
  })
  .messages({
    "string.pattern.base": "Date must be in YYYY-MM-DD format",
    "any.invalid": "Date must be a real calendar date"
  });

const timeSchema = Joi.string()
  .pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
  .messages({
    "string.pattern.base": "Time must be in HH:MM format"
  });

const dayOfWeekSchema = Joi.number()
  .integer()
  .valid(...WORKING_DAYS)
  .messages({
    "any.only": `dayOfWeek must be one of ${WORKING_DAYS.join(", ")} (1 = Monday)`
  });

function ensurePeriodOrder(value, helpers) {
  if (value.validFrom && value.validTo && value.validTo < value.validFrom) {
    return helpers.message("validTo must not be earlier than validFrom");
  }

  return value;
}

function ensureTimeOrder(value, helpers) {
  if (value.startTime && value.endTime && toMinutes(value.endTime) <= toMinutes(value.startTime)) {
    return helpers.message("endTime must be later than startTime");
  }

  return value;
}

const scheduleIdSchema = Joi.object({
  id: objectIdSchema.required()
});

const itemParamsSchema = Joi.object({
  id: objectIdSchema.required(),
  itemId: objectIdSchema.required()
});

const listSchedulesSchema = Joi.object({
  groupId: objectIdSchema,
  status: Joi.string().valid(...SCHEDULE_STATUSES)
});

const createScheduleSchema = Joi.object({
  groupId: objectIdSchema.required(),
  name: Joi.string().trim().min(1).max(100).required(),
  validFrom: dateSchema.required(),
  validTo: dateSchema.allow(null)
}).custom(ensurePeriodOrder);

const updateScheduleSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100),
  validFrom: dateSchema,
  validTo: dateSchema.allow(null)
})
  .min(1)
  .custom(ensurePeriodOrder);

// Для LESSON обов'язкові предмет, викладач і кімната, для інших типів предмет і викладач заборонені.
const lessonOnlyRequired = (schema) =>
  Joi.any().when("type", {
    is: "LESSON",
    then: schema.required(),
    otherwise: Joi.forbidden()
  });

const createItemSchema = Joi.object({
  type: Joi.string()
    .valid(...ITEM_TYPES)
    .required(),
  dayOfWeek: dayOfWeekSchema.required(),
  startTime: timeSchema.required(),
  endTime: timeSchema.required(),
  subjectId: lessonOnlyRequired(objectIdSchema),
  teacherId: lessonOnlyRequired(objectIdSchema),
  roomId: Joi.any().when("type", {
    is: "LESSON",
    then: objectIdSchema.required(),
    otherwise: objectIdSchema
  })
}).custom(ensureTimeOrder);

const updateItemSchema = Joi.object({
  dayOfWeek: dayOfWeekSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  subjectId: objectIdSchema,
  teacherId: objectIdSchema,
  roomId: objectIdSchema
})
  .min(1)
  .custom(ensureTimeOrder);

const cancelItemSchema = Joi.object({
  reason: Joi.string().trim().min(1).max(500).required()
});

module.exports = {
  scheduleIdSchema,
  itemParamsSchema,
  listSchedulesSchema,
  createScheduleSchema,
  updateScheduleSchema,
  createItemSchema,
  updateItemSchema,
  cancelItemSchema
};
