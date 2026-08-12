import type { RequestHandler } from "express";
import { prisma } from "../config/db.js";
import { getRedis } from "../config/redis.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { geoFromIp } from "../utils/geo.js";
import { friendlyDeviceName } from "../utils/device.js";
import { randomToken, sha256 } from "../utils/crypto.js";
import { getAppOrigin } from "../config/env.js";
import { sendVerificationEmail } from "../services/emailService.js";

interface EventDetails {
  lat?: number | null;
  lon?: number | null;
  sessionId?: string;
  method?: string;
}

/** Safely extract structured fields embedded in the `details` JSON column. */
function parseEventDetails(raw: string | null): EventDetails {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as EventDetails;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export const securityOverview: RequestHandler = asyncHandler(async (_req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const now = new Date();
  const [users, activeSessions, riskyEvents, blockedEvents] = await Promise.all([
    prisma.user.count(),
    prisma.session.count({ where: { revoked: false, expiresAt: { gt: now } } }),
    prisma.loginHistory.findMany({
      where: { createdAt: { gte: since }, OR: [{ riskScore: { gt: 30 } }, { riskAction: "block" }] },
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.loginHistory.count({ where: { createdAt: { gte: since }, riskAction: "block" } }),
  ]);

  res.json({
    totals: { users, activeSessions, riskyEvents: riskyEvents.length, blockedEvents },
    events: riskyEvents.map((event) => {
      const details = parseEventDetails(event.details);
      return {
        id: event.id,
        at: event.createdAt,
        user: event.user,
        type: event.eventType,
        device: friendlyDeviceName(event.deviceInfo),
        ipAddress: event.ipAddress,
        location: event.location,
        lat: details.lat ?? null,
        lon: details.lon ?? null,
        riskScore: event.riskScore,
        riskAction: event.riskAction,
        details: event.details,
      };
    }),
  });
});

/** Return live system-wide authentication methods status. */
export const systemStatus: RequestHandler = asyncHandler(async (_req, res) => {
  res.json({
    methods: [
      { id: "webauthn", name: "WebAuthn Passkeys", live: true, description: "Hardware & Platform Passkeys" },
      { id: "pccp", name: "PCCP Click-Points", live: true, description: "Perceptual Click-Point Hashing" },
      { id: "email_otp", name: "Email OTP Verification", live: true, description: "6-Digit Email One-Time Code" },
      { id: "sms_voice_otp", name: "SMS & Stringee Voice OTP", live: true, description: "Text & CallOut TTS Fallback" },
      { id: "recovery_codes", name: "Backup Recovery Codes", live: true, description: "Argon2-Hashed Offline Codes" },
    ],
  });
});

/** List all users in the system with their enrolled authentication methods and soft-delete status. */
export const listUsers: RequestHandler = asyncHandler(async (_req, res) => {
  const now = new Date();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      emailVerified: true,
      phoneVerified: true,
      onboardingStep: true,
      scheduledForDeletionAt: true,
      deletionRequestedAt: true,
      createdAt: true,
      credentials: { select: { id: true, nickname: true, lastUsedAt: true } },
      pccpConfig: { select: { enrolled: true } },
      recoveryCodes: { select: { id: true, used: true } },
      sessions: {
        where: { revoked: false, expiresAt: { gt: now } },
        select: { id: true, deviceInfo: true, ipAddress: true, location: true, createdAt: true, expiresAt: true },
      },
    },
  });

  res.json({
    users: users.map((u) => {
      const authMethods = [];
      if (u.credentials.length > 0) authMethods.push("Passkeys");
      if (u.pccpConfig?.enrolled) authMethods.push("PCCP");
      if (u.emailVerified) authMethods.push("Email OTP");
      if (u.phoneVerified || u.phone) authMethods.push("Phone OTP");
      if (u.recoveryCodes.some((r) => !r.used)) authMethods.push("Recovery Codes");

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        emailVerified: u.emailVerified,
        phoneVerified: u.phoneVerified,
        onboardingStep: u.onboardingStep,
        scheduledForDeletionAt: u.scheduledForDeletionAt,
        deletionRequestedAt: u.deletionRequestedAt,
        createdAt: u.createdAt,
        passkeysCount: u.credentials.length,
        authMethods,
        activeSessionsCount: u.sessions.length,
        activeSessions: u.sessions.map((s) => ({
          id: s.id,
          device: friendlyDeviceName(s.deviceInfo),
          ipAddress: s.ipAddress,
          location: s.location,
          createdAt: s.createdAt,
          active: true,
        })),
      };
    }),
  });
});

/** Clear Redis OTP rate limits, IP blocks, and PCCP lockouts for a target user. */
export const clearUserRateLimits: RequestHandler = asyncHandler(async (req, res) => {
  const userId = req.params.id as string;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "User account not found.");

  const redis = getRedis();
  const today = new Date().toISOString().slice(0, 10);
  const keysToDelete = [
    `sms:quota:${today}:user:${user.id}`,
    `rate:phone_otp:${user.id}`,
    `rate:email_otp:${user.id}`,
  ];
  if (user.phone) {
    keysToDelete.push(`sms:quota:${today}:${user.phone}`, `rate:phone_otp:${user.phone}`);
  }
  keysToDelete.push(`rate:email_otp:${user.email}`);

  for (const k of keysToDelete) {
    await redis.del(k).catch(() => {});
  }
  await prisma.pccpLockout.deleteMany({ where: { userId } });

  res.json({ ok: true, userId, email: user.email, message: "Rate limits and debouncing timeouts cleared." });
});

/** Schedule soft-delete for an account (24-hour grace period). */
export const scheduleUserDeletion: RequestHandler = asyncHandler(async (req, res) => {
  const userId = req.params.id as string;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "User account not found.");

  const scheduledTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.user.update({
    where: { id: userId },
    data: { scheduledForDeletionAt: scheduledTime, deletionRequestedAt: new Date() },
  });

  res.json({ ok: true, userId, email: user.email, scheduledForDeletionAt: scheduledTime });
});

/** Cancel soft-delete and restore account (admin recovery within 24h). */
export const restoreUserAccount: RequestHandler = asyncHandler(async (req, res) => {
  const userId = req.params.id as string;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "User account not found.");

  await prisma.user.update({
    where: { id: userId },
    data: { scheduledForDeletionAt: null, deletionRequestedAt: null },
  });

  res.json({ ok: true, userId, email: user.email, restored: true });
});

/** Delete a user account permanently (immediate admin force purge). */
export const deleteUser: RequestHandler = asyncHandler(async (req, res) => {
  const userId = req.params.id as string;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "User account not found.");

  await prisma.user.delete({ where: { id: userId } });
  res.json({ ok: true, deletedUserId: userId, email: user.email });
});

/** Revoke / Delete passkeys for a user. */
export const deleteUserPasskey: RequestHandler = asyncHandler(async (req, res) => {
  const userId = req.params.id as string;
  const passkeyId = req.params.passkeyId as string | undefined;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "User account not found.");

  if (passkeyId && passkeyId !== "all") {
    await prisma.credential.deleteMany({ where: { id: passkeyId, userId } });
  } else {
    await prisma.credential.deleteMany({ where: { userId } });
  }

  res.json({ ok: true, userId, email: user.email });
});

/** Send reset / verification email to a user from the admin panel. */
export const sendUserResetEmail: RequestHandler = asyncHandler(async (req, res) => {
  const userId = req.params.id as string;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "User account not found.");

  const token = randomToken("ve", 18);
  await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } });
  await prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 mins
    },
  });

  const verifyLink = `${getAppOrigin()}/verify-email?token=${encodeURIComponent(token)}`;
  await sendVerificationEmail(user.email, user.name, verifyLink);

  res.json({ ok: true, sentTo: user.email, verifyLink });
});

/** Look up an account, its live sessions, and recent risky activity (admin recovery view). */
export const userLookup: RequestHandler = asyncHandler(async (req, res) => {
  const email = (req.query.email as string | undefined)?.trim().toLowerCase();
  if (!email) throw new AppError(400, "email query parameter is required.");

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      phoneVerified: true,
      emailVerified: true,
      onboardingStep: true,
      scheduledForDeletionAt: true,
      deletionRequestedAt: true,
      createdAt: true,
      pccpConfig: { select: { enrolled: true } },
    },
  });
  if (!user) throw new AppError(404, "No account uses that email.", { code: "USER_NOT_FOUND" });

  const now = new Date();
  const [sessions, passkeys, recentLogins, recoveryCodes, failedAttempts] = await Promise.all([
    prisma.session.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, deviceInfo: true, ipAddress: true, location: true, riskScore: true, revoked: true, createdAt: true, expiresAt: true },
    }),
    prisma.credential.findMany({
      where: { userId: user.id },
      select: { id: true, nickname: true, deviceType: true, lastUsedAt: true },
    }),
    prisma.loginHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.recoveryCode.count({ where: { userId: user.id, used: false } }),
    prisma.loginHistory.count({
      where: { userId: user.id, riskAction: "block", createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
  ]);

  const authMethods = [];
  if (passkeys.length > 0) authMethods.push("Passkeys");
  if (user.pccpConfig?.enrolled) authMethods.push("PCCP");
  if (user.emailVerified) authMethods.push("Email OTP");
  if (user.phoneVerified || user.phone) authMethods.push("Phone OTP");
  if (recoveryCodes > 0) authMethods.push("Recovery Codes");

  res.json({
    user: {
      ...user,
      authMethods,
    },
    stats: { openSessions: sessions.filter((s) => !s.revoked && s.expiresAt > now).length, passkeys: passkeys.length, unusedRecoveryCodes: recoveryCodes, blockedLast7d: failedAttempts },
    sessions: sessions.map((s) => ({
      id: s.id,
      device: friendlyDevice(s.deviceInfo),
      ipAddress: s.ipAddress,
      location: s.location,
      riskScore: s.riskScore,
      revoked: s.revoked,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      active: !s.revoked && s.expiresAt > now,
    })),
    passkeys,
    recentLogins: recentLogins.map((l) => ({
      id: l.id,
      type: l.eventType,
      device: friendlyDevice(l.deviceInfo),
      ipAddress: l.ipAddress,
      location: l.location,
      riskScore: l.riskScore,
      riskAction: l.riskAction,
      createdAt: l.createdAt,
    })),
  });
});

/** Revoke every session for a user (used to force re-authentication after recovery). */
export const revokeUserSessions: RequestHandler = asyncHandler(async (req, res) => {
  const userId = req.params.id as string;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!user) throw new AppError(404, "No account found for this id.");

  const result = await prisma.session.updateMany({
    where: { userId: user.id, revoked: false },
    data: { revoked: true },
  });

  await prisma.loginHistory.create({
    data: {
      userId: user.id,
      eventType: "alert",
      deviceInfo: "NovaBank Admin",
      ipAddress: req.ip ?? "unknown",
      location: null,
      riskScore: 0,
      riskAction: "block",
      details: JSON.stringify({ admin: true, action: "revoke_all_sessions", count: result.count }),
    },
  });

  res.json({ revoked: result.count, email: user.email });
});

/** Resolve a fresh geolocation for an arbitrary IP, for admin triage views. */
export const lookupIp: RequestHandler = asyncHandler(async (req, res) => {
  const ip = (req.params.ip as string | undefined)?.trim();
  if (!ip) throw new AppError(400, "ip path parameter is required.");
  const geo = await geoFromIp(ip);
  res.json({ ip, geo });
});

function friendlyDevice(raw: string): string {
  try {
    return friendlyDeviceName(raw);
  } catch {
    return raw;
  }
}