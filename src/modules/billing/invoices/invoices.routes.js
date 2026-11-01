const { Router } = require("express");

const validate = require("../../../middleware/validate.middleware");
const controller = require("./invoices.controller");

const {
  createMonthlyInvoiceSchema,
  createAnnualInvoiceSchema,
  invoiceQuerySchema,
  invoiceIdSchema
} = require("./invoices.validation");

const router = Router();

router.get(
  "/",
  validate(invoiceQuerySchema, "query"),
  controller.getAll
);

router.post(
  "/monthly",
  validate(createMonthlyInvoiceSchema, "body"),
  controller.createMonthly
);

router.post(
  "/annual",
  validate(createAnnualInvoiceSchema, "body"),
  controller.createAnnual
);

router.get(
  "/:id",
  validate(invoiceIdSchema, "params"),
  controller.getById
);

router.patch(
  "/:id/cancel",
  validate(invoiceIdSchema, "params"),
  controller.cancel
);

module.exports = router;