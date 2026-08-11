import { createHash } from "node:crypto";
import { prisma } from "../config/db.js";
import type { GeoInfo } from "../utils/geo.js";

export function hashDeviceFingerprint(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function findTrustedDevice(userId: string, rawFingerprint: string) {
  return prisma.trustedDevice.findUnique({
    where: { userId_fingerprint: { userId, fingerprint: hashDeviceFingerprint(rawFingerprint) } },
  });
}

export async function markDeviceTrusted(opts: {
  userId: string;
  rawFingerprint: string;
  deviceInfo: string;
  ipAddress: string;
  location?: string | null;
}) {
  const fingerprint = hashDeviceFingerprint(opts.rawFingerprint);
  return prisma.trustedDevice.upsert({
    where: { userId_fingerprint: { userId: opts.userId, fingerprint } },
    create: {
      userId: opts.userId,
      fingerprint,
      deviceInfo: opts.deviceInfo,
      ipAddress: opts.ipAddress,
      location: opts.location ?? null,
    },
    update: {
      deviceInfo: opts.deviceInfo,
      ipAddress: opts.ipAddress,
      location: opts.location ?? undefined,
    },
  });
}
export async function getUserDevices(userId: string, currentDeviceId?: string) {
  const devices = await prisma.trustedDevice.findMany({
    where: { 
      userId, 
      isRevoked: false 
    },
    orderBy: { lastSeen: 'desc' },
  });

  const now = new Date();

  return devices.map((device) => {
    const isActive = (now.getTime() - new Date(device.lastSeen).getTime()) < 5 * 60 * 1000;

    return {
      id: device.id,
      deviceInfo: device.deviceInfo,
      ipAddress: device.ipAddress,
      location: device.location,
      lastSeen: device.lastSeen,
      isCurrentDevice: device.id === currentDeviceId,
      status: isActive ? 'Active' : 'Idle',
    };
  });
}

export async function revokeDevice(userId: string, deviceId: string) {
  return prisma.trustedDevice.updateMany({
    where: { 
      id: deviceId, 
      userId 
    },
    data: { isRevoked: true },
  });
}

export async function revokeAllOtherDevices(userId: string, currentDeviceId: string) {
  return prisma.trustedDevice.updateMany({
    where: {
      userId,
      id: { not: currentDeviceId },
      isRevoked: false,
    },
    data: { isRevoked: true },
  });
}
export type { GeoInfo };
