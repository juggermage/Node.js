const express = require("express");

const salariesController = require("./salaries.controller");
const validate = require("../../../middleware/validate.middleware");
const requireAuth = require("../../../middleware/auth.middleware");
const authorizeRoles = require("../../../middleware/rbac.middleware");

const {
  createRateSchema,
  createCalculationSchema,
  listRatesSchema,
  listCalculationsSchema,
  idParamsSchema
} = require("./salaries.validation");

const router = express.Router();

router.use(requireAuth);
router.use(authorizeRoles("ADMIN", "MANAGER"));

router.get("/rates", validate(listRatesSchema, "query"), salariesController.getRates);

router.post("/rates", validate(createRateSchema, "body"), salariesController.createRate);

router.get(
  "/calculations",
  validate(listCalculationsSchema, "query"),
  salariesController.getCalculations
);

router.post(
  "/calculations",
  validate(createCalculationSchema, "body"),
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
