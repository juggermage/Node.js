const express = require("express");

const auditController = require("./audit.controller");
const validate = require("../../middleware/validate.middleware");

const { auditFiltersSchema } = require("./audit.validation");

const router = express.Router();

// Отримання журналу аудиту з фільтрами.
router.get("/", validate(auditFiltersSchema, "query"), auditController.getAll);

module.exports = router;
