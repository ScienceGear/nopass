import rateLimit from "express-rate-limit";
import { isProduction } from "../config/env.js";
import { getClientIp } from "../utils/clientIp.js";

const FIFTEEN_MIN = 15 * 60 * 1000;

/** Lockout-style limiter for auth endpoints. Relaxed in development for flow testing. */
export const authLimiter = rateLimit({
  windowMs: FIFTEEN_MIN,
  limit: isProduction ? 30 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

/**
 * Stricter limiter for credential/OTP routes  5 requests per 15 minutes,
 * keyed per IP * email so one account can't be hammered while others stay up.
 */
export const otpLimiter = rateLimit({
  windowMs: FIFTEEN_MIN,
  limit: isProduction ? 5 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email =
      (req.body && typeof req.body === "object" && typeof (req.body as { email?: string }).email === "string"
        ? (req.body as { email: string }).email.trim().toLowerCase()
        : "") || "anon";
    return `${getClientIp(req)}:${email}`;
  },
  message: { error: "Too many attempts. Please try again later." },
});

/**
 * Signup status polling (~every 3s on the "check your inbox" step). Kept separate
 * from authLimiter so waiting for email verification does not exhaust login limits.
 * Keyed per IP * email so one signup poll loop cannot starve other clients.
 */
export const pollLimiter = rateLimit({
  windowMs: FIFTEEN_MIN,
  limit: isProduction ? 300 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email =
      (req.body && typeof req.body === "object" && typeof (req.body as { email?: string }).email === "string"
        ? (req.body as { email: string }).email.trim().toLowerCase()
        : "") || "anon";
    return `${getClientIp(req)}:${email}`;
  },
  message: { error: "Too many requests. Please try again later." },
});

export const transferLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many transfer requests. Slow down." },
});

/**
 * Burst limiter for SMS/phone OTP routes  keyed per IP * phone. The daily
 * 6-SMS quota is enforced inside smsService (Redis), this only stops flooders.
 */
export const phoneOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 6,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const phone =
      (req.body && typeof req.body === "object" && typeof (req.body as { phone?: string }).phone === "string"
        ? (req.body as { phone: string }).phone
        : "") || "anon";
    return `${req.ip ?? "unknown"}:${phone}`;
  },
  message: { error: "Too many SMS requests. Please try again later." },
});
