const express = require("express");

const salariesController = require("./salaries.controller");
const validate = require("../../../middleware/validate.middleware");
const {
  createRateSchema,
  createCalculationSchema,
  listRatesSchema,
  listCalculationsSchema,
  idParamsSchema
} = require("./salaries.validation");

const router = express.Router();

router.get("/rates", validate(listRatesSchema, "query"), salariesController.getRates);
router.post("/rates", validate(createRateSchema), salariesController.createRate);
router.get(
  "/calculations",
  validate(listCalculationsSchema, "query"),
  salariesController.getCalculations
);
router.post(
  "/calculations",
  validate(createCalculationSchema),
  salariesController.createCalculations
);
router.get(
  "/calculations/:id",
  validate(idParamsSchema, "params"),
  salariesController.getCalculationById
);
router.patch(
  "/calculations/:id/cancel",
  validate(idParamsSchema, "params"),
  salariesController.cancelCalculation
);

module.exports = router;
