
const express = require("express");

const authController = require("./auth.controller");
const validate = require("../../middleware/validate.middleware");
const requireAuth = require("../../middleware/auth.middleware");

const {
  registerSchema,
  loginSchema
} = require("./auth.validation");

const router = express.Router();

router.post(
  "/register",
  validate(registerSchema),
  authController.register
);

router.post(
  "/login",
  validate(loginSchema),
  authController.login
);

router.get(
  "/me",
  requireAuth,
  authController.getMe
);

router.post(
  "/logout",
  requireAuth,
  authController.logout
);

module.exports = router;
