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

export const transferLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many transfer requests. Slow down." },
});
