const express = require("express");
const controller = require("./optimization.controller");
const validate = require("../../middleware/validate.middleware");
const requireAuth = require("../../middleware/auth.middleware");
const authorizeRoles = require("../../middleware/rbac.middleware");
const {
  databaseScenarioSchema,
  periodSchema,
  optimizationInput,
  manualScenarioSchema,
  compareForecastsSchema
} = require("./optimization.validation");

const router = express.Router();

router.use(requireAuth);
router.use(authorizeRoles("ADMIN", "MANAGER"));

router.get("/", validate(periodSchema, "query"), controller.getReport);
router.post(
  "/from-database",
  validate(databaseScenarioSchema, "body"),
  controller.optimizeFromDatabase
);
router.post("/optimize", validate(optimizationInput, "body"), controller.optimize);
router.post("/manual", validate(manualScenarioSchema, "body"), controller.calculateManual);
router.post("/compare", validate(compareForecastsSchema, "body"), controller.compareForecasts);

module.exports = router;
