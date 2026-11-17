const service = require("./optimization.service");
const engine = require("./optimization.engine");
const HTTP_STATUS = require("../../utils/http-status");

async function getReport(req, res) {
  const data = await service.getReport(res.locals.validated.query);
  return res.status(HTTP_STATUS.OK).json({ success: true, data });
}

async function compareScenarios(req, res) {
  const data = await service.compareScenarios(res.locals.validated.body);
  return res.status(HTTP_STATUS.OK).json({ success: true, data });
}

async function optimizeFromDatabase(req, res) {
  const input = await service.getDatabaseScenario(res.locals.validated.body);
  const data = engine.optimize({
    ...input,
    weeklyLessonMinutesPerGroup: input.weeklyLessonMinutesPerGroup
  });
  return res.status(HTTP_STATUS.OK).json({ success: true, data: { ...data, source: input } });
}

function optimize(req, res) {
  const data = engine.optimize(res.locals.validated.body);
  return res.status(HTTP_STATUS.OK).json({ success: true, data });
}

function compareForecasts(req, res) {
  const data = engine.compare(res.locals.validated.body);
  return res.status(HTTP_STATUS.OK).json({ success: true, data });
}

function calculateManual(req, res) {
  const data = engine.calculateManual(res.locals.validated.body);
  return res.status(HTTP_STATUS.OK).json({ success: true, data });
}

module.exports = {
  optimizeFromDatabase,
  getReport,
  compareScenarios,
  optimize,
  calculateManual,
  compareForecasts
};
