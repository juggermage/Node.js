const express = require("express");

const childrenController = require("./children.controller");
const validate = require("../../middleware/validate.middleware");
const requireAuth = require("../../middleware/auth.middleware");
const authorizeRoles = require("../../middleware/rbac.middleware");

const {
  createChildSchema,
  updateChildSchema,
  childIdSchema,
  searchChildSchema
} = require("./children.validation");

const router = express.Router();

router.use(requireAuth);

router.get(
  "/",
  authorizeRoles(
    "ADMIN",
    "MANAGER",
    "PARENT",
    "TEACHER",
    "EDUCATOR",
    "ASSISTANT"
  ),
  validate(searchChildSchema, "query"),
  childrenController.getAll
);

router.get(
  "/:id",
  authorizeRoles(
    "ADMIN",
    "MANAGER",
    "PARENT",
    "TEACHER",
    "EDUCATOR",
    "ASSISTANT"
  ),
  validate(childIdSchema, "params"),
  childrenController.getById
);

router.post(
  "/",
  authorizeRoles("ADMIN", "MANAGER"),
  validate(createChildSchema),
  childrenController.create
);

router.patch(
  "/:id",
  authorizeRoles("ADMIN", "MANAGER"),
  validate(childIdSchema, "params"),
  validate(updateChildSchema),
  childrenController.update
);

router.delete(
  "/:id",
  authorizeRoles("ADMIN", "MANAGER"),
  validate(childIdSchema, "params"),
  childrenController.remove
);

module.exports = router;