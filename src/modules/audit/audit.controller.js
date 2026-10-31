
const auditService = require("./audit.service");
const HTTP_STATUS = require("../../utils/http-status");

// Отримання журналу аудиту.
async function getAll(req, res) {
  const filters = res.locals.validated.query;

  const auditLogs = await auditService.getAll(filters);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: auditLogs
  });
}

module.exports = {
  getAll
};
