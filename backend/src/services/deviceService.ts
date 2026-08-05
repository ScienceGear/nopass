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

export type { GeoInfo };
