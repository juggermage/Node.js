const service = require("./child-parent.service");
const { HTTP_STATUS } = require("../../utils/http-status");

async function create(req, res) {
  const data = await service.createOrRestore(res.locals.validated.body);

  return res.status(HTTP_STATUS.OK).json({ success: true, data });
}

async function getById(req, res) {
  const data = await service.getById(res.locals.validated.params.id);

  return res.status(HTTP_STATUS.OK).json({ success: true, data });
}

async function getForChild(req, res) {
  const data = await service.getForChild(
    res.locals.validated.params.childId,
    req.query.includeEnded === "true"
  );

  return res.status(HTTP_STATUS.OK).json({ success: true, data });
}

async function getForParent(req, res) {
  const data = await service.getForParent(
    res.locals.validated.params.parentId,
    req.query.includeEnded === "true"
  );

  return res.status(HTTP_STATUS.OK).json({ success: true, data });
}

async function complete(req, res) {
  const data = await service.complete(res.locals.validated.params.id);

  return res.status(HTTP_STATUS.OK).json({ success: true, data });
}

module.exports = {
  create,
  getById,
  getForChild,
  getForParent,
  complete
};
