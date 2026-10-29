const service = require("./discounts.service");
const HTTP_STATUS = require("../../../utils/http-status");

async function create(req, res) {
  const data = await service.create(res.locals.validated.body);

  return res.status(HTTP_STATUS.CREATED).json({ success: true, data });
}

async function getAll(req, res) {
  const { includeInactive } = res.locals.validated.query;

  const data = await service.getAll(includeInactive === true);

  return res.status(HTTP_STATUS.OK).json({ success: true, data });
}

async function getById(req, res) {
  const data = await service.getById(res.locals.validated.params.id);

  return res.status(HTTP_STATUS.OK).json({ success: true, data });
}

async function deactivate(req, res) {
  const data = await service.deactivate(res.locals.validated.params.id);

  return res.status(HTTP_STATUS.OK).json({ success: true, data });
}

module.exports = {
  create,
  getAll,
  getById,
  deactivate
};
