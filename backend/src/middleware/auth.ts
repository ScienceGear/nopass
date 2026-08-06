import type { RequestHandler } from "express";
import { prisma } from "../config/db.js";
import { verifyAccessToken } from "../utils/crypto.js";
import { AppError, asyncHandler } from "./errorHandler.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      authEmail?: string;
    }
  }
}

/** JWT bearer-auth middleware. Attaches req.userId + req.authEmail on success. */
export const requireAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new AppError(401, "Missing access token");

  let payload;
  try {
    payload = verifyAccessToken(header.slice(7));
  } catch {
    throw new AppError(401, "Invalid or expired access token");
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw new AppError(401, "User no longer exists");

  req.userId = user.id;
  req.authEmail = user.email;
  next();
});

/** Attaches req.userId when a valid token is present, otherwise continues unauthenticated. */
export const optionalAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const payload = verifyAccessToken(header.slice(7));
      req.userId = payload.sub;
    } catch {
      /* treat as anonymous */
    }
  }
  next();
});

/** Prevent partially configured accounts from accessing banking data or security settings. */
export const requireCompletedOnboarding: RequestHandler = asyncHandler(async (req, _res, next) => {
  if (!req.userId) throw new AppError(401, "Not authenticated.");
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { onboardingStep: true } });
  if (!user) throw new AppError(401, "User no longer exists.");
  if (user.onboardingStep !== "complete") {
    throw new AppError(409, "Finish account setup before accessing your account.", {
      code: "ONBOARDING_INCOMPLETE",
      currentStep: user.onboardingStep,
    });
  }
  next();
});
