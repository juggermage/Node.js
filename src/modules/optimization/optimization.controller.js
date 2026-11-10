const service = require("./optimization.service");
const HTTP_STATUS = require("../../utils/http-status");

async function getReport(req, res) {
  const data = await service.getReport(res.locals.validated.query);
  return res.status(HTTP_STATUS.OK).json({ success: true, data });
}

async function compareScenarios(req, res) {
  const data = await service.compareScenarios(res.locals.validated.body);
  return res.status(HTTP_STATUS.OK).json({ success: true, data });
}

module.exports = { getReport, compareScenarios };
