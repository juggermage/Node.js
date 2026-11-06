const express = require("express");

const auditController = require("./audit.controller");
const validate = require("../../middleware/validate.middleware");
const requireAuth = require("../../middleware/auth.middleware");
const authorizeRoles = require("../../middleware/rbac.middleware");

const { auditFiltersSchema, auditIdSchema } = require("./audit.validation");

const router = express.Router();

router.use(requireAuth);
router.use(authorizeRoles("ADMIN", "MANAGER"));

router.get("/", validate(auditFiltersSchema, "query"), auditController.getAll);

router.get("/:id", validate(auditIdSchema, "params"), auditController.getById);

module.exports = router;
