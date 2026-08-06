import type { RequestHandler } from "express";
import { prisma } from "../config/db.js";
import { asyncHandler } from "../middleware/errorHandler.js";

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
    events: riskyEvents.map((event) => ({
      id: event.id,
      at: event.createdAt,
      user: event.user,
      type: event.eventType,
      device: event.deviceInfo,
      ipAddress: event.ipAddress,
      location: event.location,
      riskScore: event.riskScore,
      riskAction: event.riskAction,
      details: event.details,
    })),
  });
});
