const { Router } = require("express");

const validate = require("../../../middleware/validate.middleware");

const controller = require("./meals.controller");

const {
  createMealRateSchema,
  rateQuerySchema,
  calculateMealSchema
} = require("./meals.validation");

const router = Router();
router.get("/rates", validate(rateQuerySchema, "query"), controller.getRates);
router.post("/rates", validate(createMealRateSchema, "body"), controller.createRate);
router.post("/calculate", validate(calculateMealSchema, "body"), controller.calculate);
module.exports = router;
