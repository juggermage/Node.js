
const jwt = require("jsonwebtoken");

const prisma = require("../config/prisma");
const authService = require("../modules/auth/auth.service");
const HTTP_STATUS = require("../utils/http-status");

async function requireAuth(req, res, next) {
  try {
    const authorization = req.headers.authorization;

    if (!authorization || !authorization.startsWith("Bearer ")) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required"
        }
      });
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required"
        }
      });
    }

    let payload;

    try {
      payload = jwt.verify(token, authService.getJwtSecret());
    } catch {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: {
          code: "INVALID_TOKEN",
          message: "Invalid or expired token"
        }
      });
    }

    if (
      typeof payload.sub !== "string" ||
      !Number.isInteger(payload.tokenVersion)
    ) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: {
          code: "INVALID_TOKEN",
          message: "Invalid token payload"
        }
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub }
    });

    if (
      !user ||
      !user.isActive ||
      user.tokenVersion !== payload.tokenVersion
    ) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Session is invalid or expired"
        }
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = requireAuth;
