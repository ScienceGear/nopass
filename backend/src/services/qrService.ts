import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import { randomBytes } from "node:crypto";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { getRedis } from "../config/redis.js";
import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

const QR_TTL_MINUTES = 5;
const GRANT_TTL_SECONDS = 300;

export interface QrSessionData {
  token: string;
  expiresAt: Date;
  qrImage: string;
}

export async function createQrSession(): Promise<QrSessionData> {
  const token = `qr_${randomBytes(16).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + QR_TTL_MINUTES * 60 * 1000);

  await prisma.qrSession.create({
    data: { token, status: "pending", expiresAt },
  });

  const qrData = JSON.stringify({ type: "novabank-login", token, ttl: QR_TTL_MINUTES });
  const qrImage = await QRCode.toDataURL(qrData, { errorCorrectionLevel: "H", margin: 1 });
  return { token, expiresAt, qrImage };
}

export async function getQrStatus(token: string) {
  const session = await prisma.qrSession.findUnique({ where: { token } });
  if (!session) throw new AppError(404, "QR session not found.");

  let status = session.status;
  if (status === "pending" && session.expiresAt < new Date()) {
    status = "expired";
    await prisma.qrSession.update({ where: { id: session.id }, data: { status: "expired" } });
  }

  let grantToken: string | null = null;
  if (status === "approved") {
    grantToken = await getRedis().get(`qr:grant:${token}`);
  }

  return {
    status,
    expiresAt: session.expiresAt,
    grantToken,
    deviceInfo: session.deviceInfo,
    location: session.location,
  };
}

export async function approveQrSession(token: string, userId: string, decision: "approve" | "deny"): Promise<{ status: string }> {
  const session = await prisma.qrSession.findUnique({ where: { token } });
  if (!session) throw new AppError(404, "QR session not found.");
  if (session.status !== "pending") throw new AppError(409, "QR session already resolved.");
  if (session.expiresAt < new Date()) throw new AppError(410, "QR session expired.");

  const status = decision === "approve" ? "approved" : "denied";
  await prisma.qrSession.update({
    where: { id: session.id },
    data: { status, userId },
  });

  if (status === "approved") {
    const grantToken = jwt.sign({ sub: session.id, qrGrant: true }, env.JWT_SECRET, { expiresIn: "5m" });
    await getRedis().set(`qr:grant:${token}`, grantToken, "EX", GRANT_TTL_SECONDS);
  }

  return { status };
}

export interface QrGrantPayload {
  sub: string;
  qrGrant: true;
}

export function verifyQrGrant(grantToken: string): QrGrantPayload {
  const payload = jwt.verify(grantToken, env.JWT_SECRET) as QrGrantPayload;
  if (!payload.qrGrant) throw new AppError(400, "Invalid grant token.");
  return payload;
}

export async function findQrSessionById(id: string) {
  return prisma.qrSession.findUnique({ where: { id } });
}

export async function attachQrDeviceInfo(token: string, deviceInfo: string, location: string | null) {
  const session = await prisma.qrSession.findUnique({ where: { token } });
  if (!session) return;
  await prisma.qrSession.update({
    where: { id: session.id },
    data: { deviceInfo, location },
  });
  logger.info(`QR session ${token} is waiting for approval from ${deviceInfo}`);
}
