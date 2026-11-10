const attendanceService = require("./attendance.service");
const HTTP_STATUS = require("../../utils/http-status");

async function getAll(req, res) {
  const records = await attendanceService.getAll(res.locals.validated.query, req.user);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: records
  });
}

async function getById(req, res) {
  const { id } = res.locals.validated.params;

  const record = await attendanceService.getById(id, req.user);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: record
  });
}

async function create(req, res) {
  const record = await attendanceService.create(res.locals.validated.body, req.user);

  return res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data: record
  });
}

async function update(req, res) {
  const { id } = res.locals.validated.params;

  const record = await attendanceService.update(id, res.locals.validated.body, req.user);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: record
  });
}

async function remove(req, res) {
  const { id } = res.locals.validated.params;

  await attendanceService.remove(id, req.user);

  return res.status(HTTP_STATUS.NO_CONTENT).send();
}

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove
};
