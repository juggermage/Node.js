const service = require("./lifecycle.service");
const HTTP_STATUS = require("../../utils/http-status");
async function archive(req, res) {
  const data = await service.archive(req.params.entity, req.params.id, req.user);
  return res.status(HTTP_STATUS.OK).json({ success: true, data });
}
async function restore(req, res) {
  const data = await service.restore(req.params.entity, req.params.id, req.user);
  return res.status(HTTP_STATUS.OK).json({ success: true, data });
}
async function hardDelete(req, res) {
  const data = await service.hardDelete(req.params.entity, req.params.id, req.user);
  return res.status(HTTP_STATUS.OK).json({ success: true, data });
}
module.exports = { archive, restore, hardDelete };
