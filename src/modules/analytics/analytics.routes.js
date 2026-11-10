const { Router } = require("express");
const validate = require("../../middleware/validate.middleware");
const requireAuth = require("../../middleware/auth.middleware");
const authorizeRoles = require("../../middleware/rbac.middleware");
const controller = require("./analytics.controller");
const { periodSchema, attendanceReportSchema } = require("./analytics.validation");

const router = Router();

router.use(requireAuth);
router.use(authorizeRoles("ADMIN", "MANAGER"));

router.get("/summary", validate(periodSchema, "query"), controller.getSummary);
router.get("/income", validate(periodSchema, "query"), controller.getIncomeReport);
router.get("/expenses", validate(periodSchema, "query"), controller.getExpensesReport);
router.get("/debts", validate(periodSchema, "query"), controller.getDebtsReport);
router.get("/profitability", validate(periodSchema, "query"), controller.getProfitabilityReport);
router.get("/groups", validate(periodSchema, "query"), controller.getGroupReport);
router.get(
  "/attendance",
  validate(attendanceReportSchema, "query"),
  controller.getAttendanceReport
);

router.get(
  "/attendance",
  validate(attendanceReportSchema, "query"),
  controller.getAttendanceReport
);

module.exports = router;
