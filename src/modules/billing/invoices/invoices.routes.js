const { Router } = require("express");

const validate = require("../../../middleware/validate.middleware");
const requireAuth = require("../../../middleware/auth.middleware");
const authorizeRoles = require("../../../middleware/rbac.middleware");

const controller = require("./invoices.controller");

const {
  createMonthlyInvoiceSchema,
  createAnnualInvoiceSchema,
  invoiceQuerySchema,
  invoiceIdSchema,
  adjustmentIdSchema,
  createInvoiceAdjustmentSchema
} = require("./invoices.validation");

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  authorizeRoles("ADMIN", "MANAGER", "PARENT"),
  validate(invoiceQuerySchema, "query"),
  controller.getAll
);

router.post(
  "/monthly",
  authorizeRoles("ADMIN", "MANAGER"),
  validate(createMonthlyInvoiceSchema, "body"),
  controller.createMonthly
);

router.post(
  "/annual",
  authorizeRoles("ADMIN", "MANAGER"),
  validate(createAnnualInvoiceSchema, "body"),
  controller.createAnnual
);

router.get(
  "/:id/adjustments",
  authorizeRoles("ADMIN", "MANAGER", "PARENT"),
  validate(invoiceIdSchema, "params"),
  controller.getAdjustmentHistory
);

router.post(
  "/:id/adjustments",
  authorizeRoles("ADMIN", "MANAGER"),
  validate(invoiceIdSchema, "params"),
  validate(createInvoiceAdjustmentSchema, "body"),
  controller.createAdjustment
);

router.patch(
  "/adjustments/:adjustmentId/cancel",
  authorizeRoles("ADMIN", "MANAGER"),
  validate(adjustmentIdSchema, "params"),
  controller.cancelAdjustment
);

router.get(
  "/:id",
  authorizeRoles("ADMIN", "MANAGER", "PARENT"),
  validate(invoiceIdSchema, "params"),
  controller.getById
);

router.patch(
  "/:id/cancel",
  authorizeRoles("ADMIN", "MANAGER"),
  validate(invoiceIdSchema, "params"),
  controller.cancel
);

module.exports = router;
