import cors from "cors";
import express from "express";
import helmet from "helmet";
import hpp from "hpp";
import { env, isProduction } from "./config/env.js";
import { getRedis, pingRedis } from "./config/redis.js";
import { prisma } from "./config/db.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { logger } from "./utils/logger.js";
import authRoutes from "./routes/auth.js";
import accountRoutes from "./routes/account.js";
import securityRoutes from "./routes/security.js";
import userRoutes from "./routes/user.js";

const app = express();
app.disable("x-powered-by");

/**
 * CORS allowlist. Requests with no Origin header (curl, same-origin, server
 * tools) always pass. Browser requests must come from an allowed origin:
 * - the configured WEBAUTHN_ORIGIN
 * - anything in CORS_ORIGINS (comma-separated extra origins, e.g. a custom domain)
 * - in development only, any localhost port
 * In production, unknown origins are rejected.
 */
const corsAllowlist = new Set<string>([
  env.WEBAUTHN_ORIGIN,
  ...env.CORS_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean),
]);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (corsAllowlist.has(origin)) return cb(null, true);
      if (!isProduction && /^http:\/\/localhost:\d+$/.test(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(hpp());

// Lightweight request logging in dev.
if (!isProduction) {
  app.use((req, _res, next) => {
    logger.info(`${req.method} ${req.path}`);
    next();
  });
}

app.get("/api/health", async (_req, res) => {
  const redisOk = await pingRedis();
  let dbOk = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }
  res.json({
    status: dbOk && redisOk ? "ok" : "degraded",
    database: dbOk ? "ok" : "down",
    redis: redisOk ? "ok" : "down",
    uptime: process.uptime(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/security", securityRoutes);
app.use("/api/user", userRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use(errorHandler);

async function main() {
  const redisOk = await pingRedis();
  if (!redisOk) {
    logger.warn("Redis unreachable — WebAuthn challenges and step-up will fail. Start redis-server on 6379.");
  } else {
    logger.info("Redis connected");
  }

  let dbOk = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }
  if (!dbOk) {
    logger.error("PostgreSQL unreachable — check DATABASE_URL and that postgres is running.");
    process.exit(1);
  }

  app.listen(env.PORT, () => {
    logger.info(`NovaBank API listening on http://localhost:${env.PORT}`);
  });
}

main().catch((err) => {
  logger.error("Startup failed", err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
