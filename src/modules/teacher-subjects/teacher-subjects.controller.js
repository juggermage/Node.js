const service = require("./teacher-subjects.service");
const HTTP_STATUS = require("../../utils/http-status");

async function getAll(req, res) {
  const data = await service.getAll();

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

async function getTeacherSubjects(req, res) {
  const data = await service.getTeacherSubjects(res.locals.validated.params.employeeId);

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
  create,
  getTeacherSubjects,
  remove
};
