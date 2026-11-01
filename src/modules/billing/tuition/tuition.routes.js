const { Router } = require("express");

const validate = require("../../../middleware/validate.middleware");

const controller = require("./tuition.controller");

const {
  createTuitionRateSchema,
  rateQuerySchema,
  calculateMonthlyTuitionSchema,
  calculateAnnualTuitionSchema
} = require("./tuition.validation");

const router = Router();

router.get(
  "/rates",
  validate(rateQuerySchema, "query"),
  controller.getRates
);

router.post(
  "/rates",
  validate(createTuitionRateSchema, "body"),
  controller.createRate
);

router.post(
  "/calculate/monthly",
  validate(calculateMonthlyTuitionSchema, "body"),
  controller.calculateMonthly
);

router.post(
  "/calculate/annual",
  validate(calculateAnnualTuitionSchema, "body"),
  controller.calculateAnnual
);

module.exports = router;