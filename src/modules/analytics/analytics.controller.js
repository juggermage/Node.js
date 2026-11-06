const service = require("./analytics.service");
const HTTP_STATUS = require("../../utils/http-status");

async function getSummary(req, res) {
  const data = await service.getSummary(res.locals.validated.query);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data
  });
}

async function getGroupReport(req, res) {
  const data = await service.getGroupReport(res.locals.validated.query);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data
  });
}

async function getAttendanceReport(req, res) {
  const data = await service.getAttendanceReport(
    res.locals.validated.query
  );

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data
  });
}

module.exports = {
  getSummary,
  getGroupReport,
  getAttendanceReport
};