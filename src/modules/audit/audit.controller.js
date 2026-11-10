const auditService = require("./audit.service");
const HTTP_STATUS = require("../../utils/http-status");

async function getAll(req, res) {
  const filters = res.locals.validated.query;

  const result = await auditService.getAll(filters);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: result.items,
    pagination: result.pagination
  });
}

async function getById(req, res) {
  const { id } = res.locals.validated.params;

  const auditLog = await auditService.getById(id);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: auditLog
  });
}

module.exports = {
  getAll,
  getById
};
