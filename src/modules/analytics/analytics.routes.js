const { Router } = require("express");

const validate = require("../../middleware/validate.middleware");
const controller = require("./analytics.controller");
const { periodSchema } = require("./analytics.validation");

const router = Router();

router.get(
  "/summary",
  validate(periodSchema, "query"),
  controller.getSummary
);

router.get(
  "/groups",
  validate(periodSchema, "query"),
  controller.getGroupReport
);

module.exports = router;