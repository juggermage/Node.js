const { Router } = require("express");

const controller = require("./groups.controller");
const validate = require("../../middleware/validate.middleware");

const {
  idParamsSchema,
  enrollmentParamsSchema,
  childParamsSchema,
  createGroupSchema,
  updateGroupSchema,
  queryGroupsSchema,
  enrollChildSchema,
  transferChildSchema
} = require("./groups.validation");

const router = Router();

router.get("/", validate(queryGroupsSchema, "query"), controller.getAll);

router.post("/", validate(createGroupSchema, "body"), controller.create);

router.post("/transfer", validate(transferChildSchema, "body"), controller.transferChild);

router.get(
  "/children/:childId/enrollments",
  validate(childParamsSchema, "params"),
  controller.getChildHistory
);

router.patch(
  "/enrollments/:enrollmentId/complete",
  validate(enrollmentParamsSchema, "params"),
  controller.completeEnrollment
);

router.get("/:id", validate(idParamsSchema, "params"), controller.getById);

router.patch(
  "/:id",
  validate(idParamsSchema, "params"),
  validate(updateGroupSchema, "body"),
  controller.update
);

router.delete("/:id", validate(idParamsSchema, "params"), controller.remove);

router.post(
  "/:id/enrollments",
  validate(idParamsSchema, "params"),
  validate(enrollChildSchema, "body"),
  controller.enrollChild
);

router.get("/:id/enrollments", validate(idParamsSchema, "params"), controller.getGroupHistory);

module.exports = router;
