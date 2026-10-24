
const childrenService = require("./children.service");
const HTTP_STATUS = require("../../utils/http-status");

async function getAll(req, res) {
  const { search } = res.locals.validated.query;

  const children = await childrenService.getAll(search);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: children
  });
}

async function getById(req, res) {
  const { id } = res.locals.validated.params;

  const child = await childrenService.getById(id);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: child
  });
}

async function create(req, res) {
  const data = res.locals.validated.body;

  const child = await childrenService.create(data);

  return res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data: child
  });
}

async function update(req, res) {
  const { id } = res.locals.validated.params;
  const data = res.locals.validated.body;

  const child = await childrenService.update(id, data);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: child
  });
}

async function remove(req, res) {
  const { id } = res.locals.validated.params;

  await childrenService.remove(id);

  return res.status(HTTP_STATUS.NO_CONTENT).send();
}

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove
};
