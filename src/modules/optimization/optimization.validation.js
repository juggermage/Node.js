const Joi = require('joi');

const isoDate = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).custom((value, helpers) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : helpers.error('date.invalid');
});

const periodSchema = Joi.object({ from: isoDate.required(), to: isoDate.required() }).custom((value, helpers) => value.from <= value.to ? value : helpers.error('date.range'));

const countMap = Joi.object({ A2: Joi.number().integer().min(0).max(240).required(), A3: Joi.number().integer().min(0).max(240).required(), A4: Joi.number().integer().min(0).max(240).required(), A5: Joi.number().integer().min(0).max(240).required() }).required();
const optimizationInput = Joi.object({
  children: countMap,
  attendanceDays: Joi.object({ A2: Joi.number().integer().min(0).max(31).required(), A3: Joi.number().integer().min(0).max(31).required(), A4: Joi.number().integer().min(0).max(31).required(), A5: Joi.number().integer().min(0).max(31).required() }).required(),
  weeklyLessonMinutesPerGroup: Joi.number().integer().min(0).max(2400).allow(null).optional(),
  otherMonthlyExpenses: Joi.number().integer().min(0).max(100000000).optional()
}).custom((value, helpers) => Object.values(value.children).reduce((a, b) => a + b, 0) <= 240 ? value : helpers.error('children.capacity'));

const compareForecastsSchema = Joi.object({ scenarios: Joi.array().items(optimizationInput.keys({ name: Joi.string().trim().min(1).max(100).required() })).min(2).max(20).required() });

const manualScenarioSchema = optimizationInput.keys({
  name: Joi.string().trim().max(100).allow('').optional(),
  groups: Joi.array().items(Joi.object({ ageCategory: Joi.string().valid('A2', 'A3', 'A4', 'A5').required(), children: Joi.number().integer().min(1).max(20).required() })).max(12).required()
});

const compareScenariosSchema = Joi.object({ scenarios: Joi.array().items(optimizationInput.keys({ name: Joi.string().trim().min(1).max(100).required() })).min(1).max(20).required() });

const databaseScenarioSchema = Joi.object({ from: isoDate.required(), to: isoDate.required() }).custom((value, helpers) => value.from <= value.to ? value : helpers.error('date.range'));

module.exports = { databaseScenarioSchema, periodSchema, compareScenariosSchema, optimizationInput, manualScenarioSchema, compareForecastsSchema };
