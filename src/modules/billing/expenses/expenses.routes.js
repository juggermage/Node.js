const express = require("express");

const expensesController = require("./expenses.controller");
const validate = require("../../../middleware/validate.middleware");
const requireAuth = require("../../../middleware/auth.middleware");
const authorizeRoles = require("../../../middleware/rbac.middleware");

const {
  createExpenseSchema,
  expenseIdSchema,
  listExpensesSchema
} = require("./expenses.validation");

const router = express.Router();

router.use(requireAuth);
router.use(authorizeRoles("ADMIN", "MANAGER"));

router.get(
  "/",
  validate(listExpensesSchema, "query"),
  expensesController.getAll
);

router.get(
  "/:id",
  validate(expenseIdSchema, "params"),
  expensesController.getById
);

router.post(
  "/",
  validate(createExpenseSchema, "body"),
  expensesController.create
);

module.exports = router;