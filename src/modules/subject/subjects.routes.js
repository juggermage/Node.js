const express = require("express");
const subjectsController = require("./subjects.controller");

const router = express.Router();

router.get("/", subjectsController.getAll);
router.get("/:id", subjectsController.getById);
router.post("/", subjectsController.create);
router.patch("/:id", subjectsController.update);
router.delete("/:id", subjectsController.remove);

module.exports = router;