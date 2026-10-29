const service = require("./staff-assignments.service");
const  HTTP_STATUS  = require("../../utils/http-status");

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

async function complete(req, res) {
  const data = await service.complete(res.locals.validated.params.id);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data
  });
}

async function getGroupAssignments(req, res) {
  const data = await service.getGroupAssignments(res.locals.validated.params.groupId);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data
  });
}

async function getEmployeeAssignments(req, res) {
  const data = await service.getEmployeeAssignments(res.locals.validated.params.employeeId);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data
  });
}

module.exports = {
  getAll,
  create,
  complete,
  getGroupAssignments,
  getEmployeeAssignments
};
