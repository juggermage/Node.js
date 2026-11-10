const express = require("express");
const controller = require("./optimization.controller");
const validate = require("../../middleware/validate.middleware");
const requireAuth = require("../../middleware/auth.middleware");
const authorizeRoles = require("../../middleware/rbac.middleware");
const { periodSchema, compareScenariosSchema } = require("./optimization.validation");

const router = express.Router();

router.use(requireAuth);
router.use(authorizeRoles("ADMIN", "MANAGER"));

router.get("/", validate(periodSchema, "query"), controller.getReport);
router.post("/scenarios", validate(compareScenariosSchema, "body"), controller.compareScenarios);

module.exports = router;
