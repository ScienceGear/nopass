import rateLimit from "express-rate-limit";

/** Lockout-style limiter for auth endpoints. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

/**
 * Stricter limiter for credential/OTP routes — 5 requests per 15 minutes,
 * keyed per IP * email so one account can't be hammered while others stay up.
 */
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email =
      (req.body && typeof req.body === "object" && typeof (req.body as { email?: string }).email === "string"
        ? (req.body as { email: string }).email.trim().toLowerCase()
        : "") || "anon";
    return `${req.ip ?? "unknown"}:${email}`;
  },
  message: { error: "Too many attempts. Please try again later." },
});

/**
 * Generous limiter for the registration-status polling endpoint, keyed per
 * IP * email. The signup page polls this every few seconds while waiting for
 * email verification, so it must not share the strict authLimiter budget that
 * also guards credential and challenge endpoints.
 */
export const statusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 90,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email =
      (req.body && typeof req.body === "object" && typeof (req.body as { email?: string }).email === "string"
        ? (req.body as { email: string }).email.trim().toLowerCase()
        : "") || "anon";
    return `${req.ip ?? "unknown"}:${email}`;
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
 * Burst limiter for SMS/phone OTP routes — keyed per IP * phone. The daily
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
