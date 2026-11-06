const express = require("express");

const paymentsController = require("./payments.controller");

const validate = require("../../../middleware/validate.middleware");
const requireAuth = require("../../../middleware/auth.middleware");
const authorizeRoles = require("../../../middleware/rbac.middleware");

const {
  createPaymentSchema,
  paymentIdSchema,
  listPaymentsSchema
} = require("./payments.validation");

const router = express.Router();

router.use(requireAuth);

router.get(
  "/",
  authorizeRoles("ADMIN", "MANAGER", "PARENT"),
  validate(listPaymentsSchema, "query"),
  paymentsController.getAll
);

router.get(
  "/:id",
  authorizeRoles("ADMIN", "MANAGER", "PARENT"),
  validate(paymentIdSchema, "params"),
  paymentsController.getById
);

router.post(
  "/",
  authorizeRoles("ADMIN", "MANAGER", "PARENT"),
  validate(createPaymentSchema, "body"),
  paymentsController.create
);

router.patch(
  "/:id/cancel",
  authorizeRoles("ADMIN", "MANAGER"),
  validate(paymentIdSchema, "params"),
  paymentsController.cancel
);

module.exports = router;