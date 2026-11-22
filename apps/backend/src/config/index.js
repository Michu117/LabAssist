const config = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL || "",
  jwtSecret: process.env.JWT_SECRET || "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1h",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
};

module.exports = config;
