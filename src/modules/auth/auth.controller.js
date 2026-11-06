const authService = require("./auth.service");
const HTTP_STATUS = require("../../utils/http-status");

async function register(req, res) {
  const result = await authService.register(res.locals.validated.body);

  return res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data: result
  });
}

async function login(req, res) {
  const result = await authService.login(res.locals.validated.body);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: result
  });
}

async function getMe(req, res) {
  const user = await authService.getMe(req.user.id);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: user
  });
}

async function logout(req, res) {
  await authService.logout(req.user.id);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Logged out successfully"
  });
}

module.exports = {
  register,
  login,
  getMe,
  logout
};
