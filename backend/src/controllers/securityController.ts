import type { RequestHandler } from "express";
import { prisma } from "../config/db.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { generateRecoveryCodes } from "../utils/crypto.js";
import { activityQuerySchema } from "../utils/validators.js";
import {
  buildAdditionalRegistrationOptions,
  verifyRegistrationResponseCredential,
  buildUserCredentialsFromDb,
} from "../services/webauthnService.js";

// ---------------------------------------------------------------------------
// SESSIONS
// ---------------------------------------------------------------------------

export const revokeSession: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.userId) throw new AppError(401, "Not authenticated.");
  const id = req.params.id as string;
  const session = await prisma.session.findFirst({ where: { id, userId: req.userId } });
  if (!session) throw new AppError(404, "Session not found.");
  await prisma.session.update({ where: { id }, data: { revoked: true } });
  res.json({ revoked: true, id });
});

export const revokeAllSessions: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.userId) throw new AppError(401, "Not authenticated.");
  const result = await prisma.session.updateMany({
    where: { userId: req.userId, revoked: false },
    data: { revoked: true },
  });
  res.json({ revoked: result.count });
});

export const securitySnapshot: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.userId) throw new AppError(401, "Not authenticated.");
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [lastLogin, activeSessions, passkeys, blockedThisMonth] = await Promise.all([
    prisma.loginHistory.findFirst({
      where: { userId: req.userId, eventType: "login" },
      orderBy: { createdAt: "desc" },
      select: { deviceInfo: true, location: true, ipAddress: true, riskScore: true, createdAt: true, details: true },
    }),
    prisma.session.count({ where: { userId: req.userId, revoked: false, expiresAt: { gt: new Date() } } }),
    prisma.credential.count({ where: { userId: req.userId } }),
    prisma.loginHistory.count({ where: { userId: req.userId, riskAction: "block", createdAt: { gte: monthStart } } }),
  ]);
  res.json({ lastLogin, activeSessions, passkeys, blockedThisMonth });
});

// ---------------------------------------------------------------------------
// SECURITY ACTIVITY FEED
// ---------------------------------------------------------------------------

export const activity: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.userId) throw new AppError(401, "Not authenticated.");
  const { limit, offset } = activityQuerySchema.parse(req.query);

  const [logins, transfers] = await Promise.all([
    prisma.loginHistory.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.transaction.findMany({
      where: { userId: req.userId, status: "completed" },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
  ]);

  const events = [
    ...logins.map((l) => ({
      id: l.id,
      type: l.eventType,
      title: l.eventType === "login" ? "Sign-in" : l.eventType === "transfer" ? "Transfer" : l.eventType,
      detail: l.details,
      device: l.deviceInfo,
      location: l.location,
      riskScore: l.riskScore,
      riskAction: l.riskAction,
      timestamp: l.createdAt,
    })),
    ...transfers.map((t) => ({
      id: `tx-${t.id}`,
      type: "transaction",
      title: `Sent to ${t.recipient}`,
      detail: `${t.amount.toString()} INR`,
      device: "NovaBank Web",
      location: null,
      riskScore: 0,
      riskAction: "allow",
      timestamp: t.createdAt,
    })),
  ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  res.json({ events: events.slice(offset, offset + limit), total: events.length });
});

// ---------------------------------------------------------------------------
// PASSKEYS
// ---------------------------------------------------------------------------

export const listPasskeys: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.userId) throw new AppError(401, "Not authenticated.");
  const creds = await prisma.credential.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "desc" },
  });
  res.json({
    passkeys: creds.map((c) => ({
      id: c.id,
      credentialId: c.credentialId,
      nickname: c.nickname,
      deviceType: c.deviceType,
      backedUp: c.backedUp,
      createdAt: c.createdAt,
      lastUsedAt: c.lastUsedAt,
    })),
  });
});

export const deletePasskey: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.userId) throw new AppError(401, "Not authenticated.");
  const id = req.params.id as string;
  const cred = await prisma.credential.findFirst({ where: { id, userId: req.userId } });
  if (!cred) throw new AppError(404, "Passkey not found.");

  const count = await prisma.credential.count({ where: { userId: req.userId } });
  if (count <= 1) throw new AppError(400, "Cannot remove your last passkey.");

  await prisma.credential.delete({ where: { id } });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// ADD PASSKEY (registration for an existing account)
// ---------------------------------------------------------------------------

export const addPasskeyOptions: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.userId) throw new AppError(401, "Not authenticated.");
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    include: { credentials: true },
  });
  if (!user) throw new AppError(404, "User not found.");

  const options = await buildAdditionalRegistrationOptions({
    id: user.id,
    email: user.email,
    name: user.name,
    credentials: buildUserCredentialsFromDb(user.credentials),
  });
  res.json({ options });
});

export const addPasskeyVerify: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.userId) throw new AppError(401, "Not authenticated.");
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) throw new AppError(404, "User not found.");

  const { credential } = req.body as { credential: unknown };
  if (!credential) throw new AppError(400, "Credential required.");

  const { credential: cred, deviceType, backedUp } = await verifyRegistrationResponseCredential(
    user.email,
    credential as never,
  );

  await prisma.credential.create({
    data: {
      userId: user.id,
      credentialId: cred.id,
      publicKey: Buffer.from(cred.publicKey),
      counter: cred.counter,
      deviceType,
      backedUp,
      transports: cred.transports as string[],
      nickname: "New passkey",
    },
  });

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// RECOVERY CODES
// ---------------------------------------------------------------------------

export const listRecoveryCodesStatus: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.userId) throw new AppError(401, "Not authenticated.");
  const rows = await prisma.recoveryCode.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "desc" },
  });
  res.json({
    total: rows.length,
    remaining: rows.filter((r) => !r.used).length,
    used: rows.filter((r) => r.used).length,
    lastGeneratedAt: rows[0]?.createdAt ?? null,
  });
});

/** Rotate all recovery codes. Returns the new plaintext codes exactly once. */
export const rotateRecoveryCodes: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.userId) throw new AppError(401, "Not authenticated.");
  await prisma.recoveryCode.deleteMany({ where: { userId: req.userId } });

  const { codes, hashes } = await generateRecoveryCodes(10);
  await prisma.recoveryCode.createMany({
    data: hashes.map((codeHash) => ({ userId: req.userId!, codeHash })),
  });

  res.json({ recoveryCodes: codes });
});

// ---------------------------------------------------------------------------
// TRUSTED DEVICES
// ---------------------------------------------------------------------------

export const listDevices: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.userId) throw new AppError(401, "Not authenticated.");
  const devices = await prisma.trustedDevice.findMany({
    where: { userId: req.userId },
    orderBy: { lastSeen: "desc" },
  });
  res.json({
    devices: devices.map((d) => ({
      id: d.id,
      deviceInfo: d.deviceInfo,
      ipAddress: d.ipAddress,
      location: d.location,
      lastSeen: d.lastSeen,
      createdAt: d.createdAt,
    })),
  });
});

export const revokeDevice: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.userId) throw new AppError(401, "Not authenticated.");
  const id = req.params.id as string;
  const device = await prisma.trustedDevice.findFirst({ where: { id, userId: req.userId } });
  if (!device) throw new AppError(404, "Device not found.");

  await prisma.trustedDevice.delete({ where: { id } });
  res.json({ ok: true });
});
