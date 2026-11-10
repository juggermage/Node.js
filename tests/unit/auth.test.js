
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

jest.mock("../../src/config/prisma", () => ({
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  $transaction: jest.fn()
}));

jest.mock("bcryptjs", () => ({
  hash: jest.fn(),
  compare: jest.fn()
}));

jest.mock("jsonwebtoken", () => ({
  sign: jest.fn()
}));

jest.mock("../../src/modules/audit/audit.service", () => ({
  createLog: jest.fn()
}));

jest.mock("../../src/middleware/validate.middleware", () =>
  jest.fn(() => (req, res, next) => next())
);

jest.mock("../../src/middleware/auth.middleware", () =>
  jest.fn((req, res, next) => next())
);

const prisma = require("../../src/config/prisma");
const auditService = require("../../src/modules/audit/audit.service");
const authService = require("../../src/modules/auth/auth.service");
const authController = require("../../src/modules/auth/auth.controller");
const {
  registerSchema,
  loginSchema
} = require("../../src/modules/auth/auth.validation");
const HTTP_STATUS = require("../../src/utils/http-status");

const authRouter = require("../../src/modules/auth/auth.routes");

const originalEnv = process.env;

const validUser = {
  id: "507f1f77bcf86cd799439011",
  name: "Test User",
  email: "test@example.com",
  passwordHash: "hashed-password",
  role: "PARENT",
  isActive: true,
  tokenVersion: 0,
  createdAt: new Date("2026-01-01T10:00:00.000Z")
};

const publicUser = {
  id: validUser.id,
  name: validUser.name,
  email: validUser.email,
  role: validUser.role,
  isActive: validUser.isActive,
  createdAt: validUser.createdAt
};

function createResponse() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    locals: {
      validated: {
        body: {},
        query: {},
        params: {}
      }
    }
  };

  return res;
}

describe("Auth validation", () => {
  describe("registerSchema", () => {
    const validData = {
      name: "Test User",
      email: "test@example.com",
      password: "password123"
    };

    it("should accept valid registration data", () => {
      const { error, value } = registerSchema.validate(validData);

      expect(error).toBeUndefined();
      expect(value).toEqual(validData);
    });

    it("should trim the name", () => {
      const { value } = registerSchema.validate({
        ...validData,
        name: "  Test User  "
      });

      expect(value.name).toBe("Test User");
    });

    it("should trim and lowercase the email", () => {
      const { value } = registerSchema.validate({
        ...validData,
        email: "  TEST@EXAMPLE.COM  "
      });

      expect(value.email).toBe("test@example.com");
    });

    it("should reject a missing name", () => {
      const { error } = registerSchema.validate({
        email: validData.email,
        password: validData.password
      });

      expect(error).toBeDefined();
    });

    it("should reject a name shorter than 2 characters", () => {
      const { error } = registerSchema.validate({
        ...validData,
        name: "A"
      });

      expect(error).toBeDefined();
    });

    it("should reject a name longer than 100 characters", () => {
      const { error } = registerSchema.validate({
        ...validData,
        name: "A".repeat(101)
      });

      expect(error).toBeDefined();
    });

    it("should reject an invalid email", () => {
      const { error } = registerSchema.validate({
        ...validData,
        email: "invalid-email"
      });

      expect(error).toBeDefined();
    });

    it("should reject a missing password", () => {
      const { error } = registerSchema.validate({
        name: validData.name,
        email: validData.email
      });

      expect(error).toBeDefined();
    });

    it("should reject a password shorter than 8 characters", () => {
      const { error } = registerSchema.validate({
        ...validData,
        password: "1234567"
      });

      expect(error).toBeDefined();
    });

    it("should reject a password longer than 72 characters", () => {
      const { error } = registerSchema.validate({
        ...validData,
        password: "a".repeat(73)
      });

      expect(error).toBeDefined();
    });
  });

  describe("loginSchema", () => {
    const validData = {
      email: "test@example.com",
      password: "password123"
    };

    it("should accept valid login data", () => {
      const { error, value } = loginSchema.validate(validData);

      expect(error).toBeUndefined();
      expect(value).toEqual(validData);
    });

    it("should trim and lowercase the email", () => {
      const { value } = loginSchema.validate({
        ...validData,
        email: "  TEST@EXAMPLE.COM  "
      });

      expect(value.email).toBe("test@example.com");
    });

    it("should reject an invalid email", () => {
      const { error } = loginSchema.validate({
        ...validData,
        email: "invalid-email"
      });

      expect(error).toBeDefined();
    });

    it("should reject a missing email", () => {
      const { error } = loginSchema.validate({
        password: validData.password
      });

      expect(error).toBeDefined();
    });

    it("should reject an empty password", () => {
      const { error } = loginSchema.validate({
        ...validData,
        password: ""
      });

      expect(error).toBeDefined();
    });

    it("should reject a password longer than 72 characters", () => {
      const { error } = loginSchema.validate({
        ...validData,
        password: "a".repeat(73)
      });

      expect(error).toBeDefined();
    });
  });
});

describe("Auth service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters";
    process.env.JWT_EXPIRES_IN = "1d";
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("getJwtSecret", () => {
    it("should return a valid JWT secret", () => {
      expect(authService.getJwtSecret()).toBe(
        "test-secret-that-is-at-least-32-characters"
      );
    });

    it("should throw when JWT_SECRET is missing", () => {
      delete process.env.JWT_SECRET;

      expect(() => authService.getJwtSecret()).toThrow(
        "JWT_SECRET must contain at least 32 characters"
      );
    });

    it("should throw when JWT_SECRET is shorter than 32 characters", () => {
      process.env.JWT_SECRET = "short-secret";

      expect(() => authService.getJwtSecret()).toThrow(
        "JWT_SECRET must contain at least 32 characters"
      );
    });
  });

  describe("createToken", () => {
    it("should create a JWT token with user data", () => {
      jwt.sign.mockReturnValue("generated-token");

      const result = authService.createToken(validUser);

      expect(jwt.sign).toHaveBeenCalledWith(
        {
          sub: validUser.id,
          tokenVersion: validUser.tokenVersion
        },
        process.env.JWT_SECRET,
        {
          expiresIn: "1d"
        }
      );

      expect(result).toBe("generated-token");
    });

    it("should use the default expiration when JWT_EXPIRES_IN is missing", () => {
      delete process.env.JWT_EXPIRES_IN;
      jwt.sign.mockReturnValue("generated-token");

      authService.createToken(validUser);

      expect(jwt.sign).toHaveBeenCalledWith(
        {
          sub: validUser.id,
          tokenVersion: validUser.tokenVersion
        },
        process.env.JWT_SECRET,
        {
          expiresIn: "1d"
        }
      );
    });

    it("should throw when JWT secret is invalid", () => {
      process.env.JWT_SECRET = "short";

      expect(() => authService.createToken(validUser)).toThrow(
        "JWT_SECRET must contain at least 32 characters"
      );

      expect(jwt.sign).not.toHaveBeenCalled();
    });
  });

  describe("register", () => {
    const registrationData = {
      name: " Test User ",
      email: " TEST@EXAMPLE.COM ",
      password: "password123"
    };

    const tx = {
      user: {
        create: jest.fn()
      }
    };

    beforeEach(() => {
      tx.user.create.mockReset();

      prisma.$transaction.mockImplementation(async (callback) =>
        callback(tx)
      );
    });

    it("should register a new user successfully", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      bcrypt.hash.mockResolvedValue("hashed-password");
      tx.user.create.mockResolvedValue(validUser);
      auditService.createLog.mockResolvedValue({});

      jwt.sign.mockReturnValue("generated-token");

      const result = await authService.register(registrationData);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: {
          email: "test@example.com"
        }
      });

      expect(bcrypt.hash).toHaveBeenCalledWith("password123", 12);

      expect(tx.user.create).toHaveBeenCalledWith({
        data: {
          name: "Test User",
          email: "test@example.com",
          passwordHash: "hashed-password",
          role: "PARENT",
          isActive: true
        }
      });

      expect(auditService.createLog).toHaveBeenCalledWith(
        {
          actorId: validUser.id,
          action: "CREATE",
          entityType: "User",
          entityId: validUser.id,
          after: publicUser
        },
        tx
      );

      expect(result).toEqual({
        user: publicUser,
        token: "generated-token"
      });
    });

    it("should reject registration when email already exists", async () => {
      prisma.user.findUnique.mockResolvedValue(validUser);

      await expect(
        authService.register(registrationData)
      ).rejects.toThrow("Email is already registered");

      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("should convert Prisma duplicate email error into AppError", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      bcrypt.hash.mockResolvedValue("hashed-password");

      prisma.$transaction.mockRejectedValue({
        code: "P2002"
      });

      await expect(
        authService.register(registrationData)
      ).rejects.toThrow("Email is already registered");
    });

    it("should rethrow other transaction errors", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      bcrypt.hash.mockResolvedValue("hashed-password");

      const error = new Error("Database error");

      prisma.$transaction.mockRejectedValue(error);

      await expect(
        authService.register(registrationData)
      ).rejects.toThrow("Database error");
    });

    it("should not create a token when registration fails", async () => {
      prisma.user.findUnique.mockResolvedValue(validUser);

      await expect(
        authService.register(registrationData)
      ).rejects.toThrow("Email is already registered");

      expect(jwt.sign).not.toHaveBeenCalled();
    });
  });

  describe("login", () => {
    const loginData = {
      email: " TEST@EXAMPLE.COM ",
      password: "password123"
    };

    it("should login successfully with valid credentials", async () => {
      prisma.user.findUnique.mockResolvedValue(validUser);
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue("generated-token");

      const result = await authService.login(loginData);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: {
          email: "test@example.com"
        }
      });

      expect(bcrypt.compare).toHaveBeenCalledWith(
        "password123",
        validUser.passwordHash
      );

      expect(result).toEqual({
        user: publicUser,
        token: "generated-token"
      });
    });

    it("should reject login when user does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.login(loginData)
      ).rejects.toThrow("Invalid email or password");

      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it("should reject login when user has no password hash", async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...validUser,
        passwordHash: null
      });

      await expect(
        authService.login(loginData)
      ).rejects.toThrow("Invalid email or password");

      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it("should reject login when password is incorrect", async () => {
      prisma.user.findUnique.mockResolvedValue(validUser);
      bcrypt.compare.mockResolvedValue(false);

      await expect(
        authService.login(loginData)
      ).rejects.toThrow("Invalid email or password");

      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it("should reject login when user is inactive", async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...validUser,
        isActive: false
      });

      bcrypt.compare.mockResolvedValue(true);

      await expect(
        authService.login(loginData)
      ).rejects.toThrow("Invalid email or password");

      expect(jwt.sign).not.toHaveBeenCalled();
    });
  });

  describe("getMe", () => {
    it("should return public user data", async () => {
      prisma.user.findUnique.mockResolvedValue(validUser);

      const result = await authService.getMe(validUser.id);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: {
          id: validUser.id
        }
      });

      expect(result).toEqual(publicUser);
      expect(result.passwordHash).toBeUndefined();
      expect(result.tokenVersion).toBeUndefined();
    });

    it("should reject when user does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.getMe(validUser.id)
      ).rejects.toThrow("User not found or inactive");
    });

    it("should reject when user is inactive", async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...validUser,
        isActive: false
      });

      await expect(
        authService.getMe(validUser.id)
      ).rejects.toThrow("User not found or inactive");
    });
  });

  describe("logout", () => {
    const tx = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn()
      }
    };

    beforeEach(() => {
      tx.user.findUnique.mockReset();
      tx.user.update.mockReset();

      prisma.$transaction.mockImplementation(async (callback) =>
        callback(tx)
      );
    });

    it("should increment tokenVersion and create an audit log", async () => {
      const updatedUser = {
        ...validUser,
        tokenVersion: 1
      };

      tx.user.findUnique.mockResolvedValue(validUser);
      tx.user.update.mockResolvedValue(updatedUser);
      auditService.createLog.mockResolvedValue({});

      const result = await authService.logout(validUser.id);

      expect(tx.user.findUnique).toHaveBeenCalledWith({
        where: {
          id: validUser.id
        }
      });

      expect(tx.user.update).toHaveBeenCalledWith({
        where: {
          id: validUser.id
        },
        data: {
          tokenVersion: {
            increment: 1
          }
        }
      });

      expect(auditService.createLog).toHaveBeenCalledWith(
        {
          actorId: validUser.id,
          action: "UPDATE",
          entityType: "User",
          entityId: validUser.id,
          before: {
            tokenVersion: validUser.tokenVersion
          },
          after: {
            tokenVersion: updatedUser.tokenVersion
          }
        },
        tx
      );

      expect(result).toBe(true);
    });

    it("should throw when user does not exist", async () => {
      tx.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.logout(validUser.id)
      ).rejects.toThrow("User not found");

      expect(tx.user.update).not.toHaveBeenCalled();
      expect(auditService.createLog).not.toHaveBeenCalled();
    });
  });
});

describe("Auth controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("register", () => {
    it("should register a user and return 201", async () => {
      const result = {
        user: publicUser,
        token: "generated-token"
      };

      jest.spyOn(authService, "register").mockResolvedValue(result);

      const req = {};
      const res = createResponse();

      res.locals.validated.body = {
        name: "Test User",
        email: "test@example.com",
        password: "password123"
      };

      await authController.register(req, res);

      expect(authService.register).toHaveBeenCalledWith(
        res.locals.validated.body
      );

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: result
      });
    });
  });

  describe("login", () => {
    it("should login a user and return 200", async () => {
      const result = {
        user: publicUser,
        token: "generated-token"
      };

      jest.spyOn(authService, "login").mockResolvedValue(result);

      const req = {};
      const res = createResponse();

      res.locals.validated.body = {
        email: "test@example.com",
        password: "password123"
      };

      await authController.login(req, res);

      expect(authService.login).toHaveBeenCalledWith(
        res.locals.validated.body
      );

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: result
      });
    });
  });

  describe("getMe", () => {
    it("should return the current user", async () => {
      jest.spyOn(authService, "getMe").mockResolvedValue(publicUser);

      const req = {
        user: {
          id: validUser.id
        }
      };

      const res = createResponse();

      await authController.getMe(req, res);

      expect(authService.getMe).toHaveBeenCalledWith(validUser.id);
      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: publicUser
      });
    });
  });

  describe("logout", () => {
    it("should logout the current user", async () => {
      jest.spyOn(authService, "logout").mockResolvedValue(true);

      const req = {
        user: {
          id: validUser.id
        }
      };

      const res = createResponse();

      await authController.logout(req, res);

      expect(authService.logout).toHaveBeenCalledWith(validUser.id);
      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Logged out successfully"
      });
    });
  });
});

describe("Auth routes", () => {
  it("should register the expected routes", () => {
    const routes = authRouter.stack
      .filter((layer) => layer.route)
      .map((layer) => ({
        path: layer.route.path,
        methods: layer.route.methods
      }));

    expect(routes).toEqual([
      {
        path: "/register",
        methods: {
          post: true
        }
      },
      {
        path: "/login",
        methods: {
          post: true
        }
      },
      {
        path: "/me",
        methods: {
          get: true
        }
      },
      {
        path: "/logout",
        methods: {
          post: true
        }
      }
    ]);
  });

  it("should use validation middleware for registration and login", () => {
    const routes = authRouter.stack.filter((layer) => layer.route);

    const registerHandlers = routes.find(
      (layer) => layer.route.path === "/register"
    ).route.stack;

    const loginHandlers = routes.find(
      (layer) => layer.route.path === "/login"
    ).route.stack;

    expect(registerHandlers).toHaveLength(2);
    expect(loginHandlers).toHaveLength(2);
  });

  it("should use authentication middleware for protected routes", () => {
    const routes = authRouter.stack.filter((layer) => layer.route);

    const meHandlers = routes.find(
      (layer) => layer.route.path === "/me"
    ).route.stack;

    const logoutHandlers = routes.find(
      (layer) => layer.route.path === "/logout"
    ).route.stack;

    expect(meHandlers).toHaveLength(2);
    expect(logoutHandlers).toHaveLength(2);
  });
});
