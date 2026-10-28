const express = require("express");

const expensesController = require("./expenses.controller");
const validate = require("../../../middleware/validate.middleware");

const {
  createExpenseSchema,
  expenseIdSchema,
  listExpensesSchema
} = require("./expenses.validation");

const router = express.Router();

router.get("/", validate(listExpensesSchema, "query"), expensesController.getAll);

router.get("/:id", validate(expenseIdSchema, "params"), expensesController.getById);

router.post("/", validate(createExpenseSchema), expensesController.create);

module.exports = router;
