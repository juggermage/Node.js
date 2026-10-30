const express = require("express");

const paymentsController = require("./payments.controller");
const validate = require("../../../middleware/validate.middleware");
const {
  createPaymentSchema,
  paymentIdSchema,
  listPaymentsSchema
} = require("./payments.validation");

const router = express.Router();

router.get("/", validate(listPaymentsSchema, "query"), paymentsController.getAll);
router.get("/:id", validate(paymentIdSchema, "params"), paymentsController.getById);
router.post("/", validate(createPaymentSchema), paymentsController.create);
router.patch("/:id/cancel", validate(paymentIdSchema, "params"), paymentsController.cancel);

module.exports = router;
