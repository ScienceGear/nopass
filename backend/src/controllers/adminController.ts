import type { RequestHandler } from "express";
import { prisma } from "../config/db.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { geoFromIp } from "../utils/geo.js";
import { friendlyDeviceName } from "../utils/device.js";

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
  const [users, activeSessions, riskyEvents, blockedEvents] = await Promise.all([
    prisma.user.count(),
    prisma.session.count({ where: { revoked: false, expiresAt: { gt: new Date() } } }),
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
      createdAt: true,
    },
  });
  if (!user) throw new AppError(404, "No account uses that email.", { code: "USER_NOT_FOUND" });

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

  res.json({
    user,
    stats: { openSessions: sessions.filter((s) => !s.revoked && s.expiresAt > new Date()).length, passkeys: passkeys.length, unusedRecoveryCodes: recoveryCodes, blockedLast7d: failedAttempts },
    sessions: sessions.map((s) => ({
      id: s.id,
      device: friendlyDevice(s.deviceInfo),
      ipAddress: s.ipAddress,
      location: s.location,
      riskScore: s.riskScore,
      revoked: s.revoked,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      active: !s.revoked && s.expiresAt > new Date(),
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