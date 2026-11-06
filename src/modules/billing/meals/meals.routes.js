
const { Router } = require("express");

const validate = require("../../../middleware/validate.middleware");
const requireAuth = require("../../../middleware/auth.middleware");
const authorizeRoles = require("../../../middleware/rbac.middleware");

const controller = require("./meals.controller");

const {
  createMealRateSchema,
  rateQuerySchema,
  calculateMealSchema
} = require("./meals.validation");

const router = Router();

router.use(requireAuth);

router.get(
  "/rates",
  validate(rateQuerySchema, "query"),
  controller.getRates
);

router.post(
  "/rates",
  authorizeRoles("ADMIN", "MANAGER"),
  validate(createMealRateSchema, "body"),
  controller.createRate
);

router.post(
  "/calculate",
  authorizeRoles("ADMIN", "MANAGER", "PARENT"),
  validate(calculateMealSchema, "body"),
  controller.calculate
);

module.exports = router;
