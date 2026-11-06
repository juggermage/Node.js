const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const prisma = require("../../config/prisma");
const AppError = require("../../utils/app-error");
const HTTP_STATUS = require("../../utils/http-status");
const auditService = require("../audit/audit.service");

const SALT_ROUNDS = 12;

function getJwtSecret() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters");
  }

  return process.env.JWT_SECRET;
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt
  };
}

function createToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      tokenVersion: user.tokenVersion
    },
    getJwtSecret(),
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "1d"
    }
  );
}

async function register({ name, email, password }) {
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  });

  if (existing) {
    throw new AppError("Email is already registered", HTTP_STATUS.CONFLICT, "EMAIL_ALREADY_EXISTS");
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  let user;

  try {
    user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name: name.trim(),
          email: normalizedEmail,
          passwordHash,
          role: "PARENT",
          isActive: true
        }
      });

      await auditService.createLog(
        {
          actorId: createdUser.id,
          action: "CREATE",
          entityType: "User",
          entityId: createdUser.id,
          after: publicUser(createdUser)
        },
        tx
      );

      return createdUser;
    });
  } catch (error) {
    if (error.code === "P2002") {
      throw new AppError(
        "Email is already registered",
        HTTP_STATUS.CONFLICT,
        "EMAIL_ALREADY_EXISTS"
      );
    }

    throw error;
  }

  return {
    user: publicUser(user),
    token: createToken(user)
  };
}

async function login({ email, password }) {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  });

  if (!user || !user.passwordHash) {
    throw new AppError(
      "Invalid email or password",
      HTTP_STATUS.UNAUTHORIZED,
      "INVALID_CREDENTIALS"
    );
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches || !user.isActive) {
    throw new AppError(
      "Invalid email or password",
      HTTP_STATUS.UNAUTHORIZED,
      "INVALID_CREDENTIALS"
    );
  }

  return {
    user: publicUser(user),
    token: createToken(user)
  };
}

async function getMe(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user || !user.isActive) {
    throw new AppError("User not found or inactive", HTTP_STATUS.UNAUTHORIZED, "UNAUTHORIZED");
  }

  return publicUser(user);
}

async function logout(userId) {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
    }

    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        tokenVersion: {
          increment: 1
        }
      }
    });

    await auditService.createLog(
      {
        actorId: userId,
        action: "UPDATE",
        entityType: "User",
        entityId: userId,
        before: {
          tokenVersion: user.tokenVersion
        },
        after: {
          tokenVersion: updatedUser.tokenVersion
        }
      },
      tx
    );
  });

  return true;
}

module.exports = {
  register,
  login,
  getMe,
  logout,
  createToken,
  getJwtSecret
};
