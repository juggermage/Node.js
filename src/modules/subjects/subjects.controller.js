const service = require("./subjects.service");
const { HTTP_STATUS } = require("../../utils/http-status");

async function getAll(req, res) {
  const data = await service.getAll(res.locals.validated.query);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data
  });
}

async function getById(req, res) {
  const data = await service.getById(res.locals.validated.params.id);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data
  });
}

async function create(req, res) {
  const data = await service.create(res.locals.validated.body);

  return res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data
  });
}

async function update(req, res) {
  const data = await service.update(res.locals.validated.params.id, res.locals.validated.body);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data
  });
}

async function remove(req, res) {
  await service.remove(res.locals.validated.params.id);

  return res.status(HTTP_STATUS.NO_CONTENT).send();
}

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove
};
