const childrenService = require("./children.service");
const HTTP_STATUS = require("../../utils/http-status");

async function getAll(req, res) {
  const filters = res.locals.validated.query;
  const result = await childrenService.getAll(filters, req.user);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: result.items,
    pagination: result.pagination
  });
}

async function getById(req, res) {
  const { id } = res.locals.validated.params;
  const child = await childrenService.getById(id, req.user);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: child
  });
}

async function create(req, res) {
  const child = await childrenService.create(
    res.locals.validated.body,
    req.user
  );

  return res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data: child
  });
}

async function update(req, res) {
  const { id } = res.locals.validated.params;

  const child = await childrenService.update(
    id,
    res.locals.validated.body,
    req.user
  );

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: child
  });
}

async function remove(req, res) {
  const { id } = res.locals.validated.params;

  await childrenService.remove(id, req.user);

  return res.status(HTTP_STATUS.NO_CONTENT).send();
}

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove
};