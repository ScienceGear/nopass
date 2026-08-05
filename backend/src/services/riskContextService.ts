import { prisma } from "../config/db.js";
import { getRedis } from "../config/redis.js";
import { isUsualHour, type RiskInput } from "./riskEngine.js";
import { anomalyScore, profileHasData, emptyProfile, type KeystrokeProfile } from "./keystrokeService.js";
import { findTrustedDevice } from "./deviceService.js";
import { geoFromIp, formatLocation, haversineKm } from "../utils/geo.js";

export const COLD_START_LOGINS = 5;

export interface RiskContextInput {
  email: string;
  deviceFingerprint: string;
  deviceInfo: string;
  keystrokes?: { prev: number; curr: number; delta: number }[];
  pasted?: boolean;
}

export interface RiskContext extends RiskInput {
  location: string | null;
}

/**
 * Collect the device/IP/behavioural signals shared by every entry point —
 * login and transactions alike. The returned object feeds `evaluateRisk`,
 * the single decision function.
 */
export async function assessContext(
  user: { id: string; email: string },
  ctx: RiskContextInput,
  ip: string,
): Promise<RiskContext> {
  const trusted = await findTrustedDevice(user.id, ctx.deviceFingerprint);

  const geo = await geoFromIp(ip);
  const location = formatLocation(geo);
  const countryCode = geo?.countryCode ?? null;

  // History from the last 90 days.
  const history = await prisma.loginHistory.findMany({
    where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
    select: { ipAddress: true, location: true, createdAt: true, details: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const knownCountries = new Set<string>();
  for (const h of history) {
    const code = h.location?.split(", ").pop();
    if (code) knownCountries.add(code);
  }
  const countryChanged =
    countryCode !== null && history.length > 0 && !knownCountries.has(countryCode) && countryCode !== "LOCAL";

  // Impossible travel: previous login too far away for the elapsed time.
  let impossibleTravel = false;
  if (geo?.lat != null && geo?.lon != null) {
    for (const h of history) {
      let coords: { lat: number; lon: number } | null = null;
      try {
        const d = h.details ? (JSON.parse(h.details) as { lat?: number; lon?: number }) : null;
        if (d && typeof d.lat === "number" && typeof d.lon === "number") coords = { lat: d.lat, lon: d.lon };
      } catch {
        /* malformed details — skip */
      }
      if (!coords) continue;
      const hoursSince = (Date.now() - h.createdAt.getTime()) / 3_600_000;
      const distance = haversineKm(geo.lat, geo.lon, coords.lat, coords.lon);
      if (hoursSince > 0.1 && hoursSince < 24 && distance > 900 * hoursSince) {
        impossibleTravel = true;
      }
      break; // only the most recent login with coordinates matters
    }
  }

  // Keystroke anomaly — suppressed while the profile is still populating.
  const loginCount = await prisma.loginHistory.count({ where: { userId: user.id, eventType: "login" } });
  const keystrokeColdStart = loginCount < COLD_START_LOGINS;
  const profileRow = await prisma.keystrokeProfile.findUnique({ where: { userId: user.id } });
  const profile: KeystrokeProfile = profileRow?.transitions
    ? (JSON.parse(profileRow.transitions) as KeystrokeProfile)
    : emptyProfile();
  const sample =
    ctx.keystrokes && ctx.keystrokes.length > 0
      ? {
          transitions: ctx.keystrokes.map((k) => [k.prev, k.curr] as [number, number]),
          timings: ctx.keystrokes.map((k) => k.delta),
        }
      : null;
  const keystrokeAnomaly =
    !keystrokeColdStart && sample && profileHasData(profile) ? anomalyScore(profile, sample) : 0;

  // Login velocity (last 10 minutes).
  const velocityKey = `auth:velocity:${user.id}`;
  const redis = getRedis();
  const recentLogins = await redis.incr(velocityKey);
  if (recentLogins === 1) await redis.expire(velocityKey, 600);

  return {
    isNewDevice: !trusted,
    isNewIp: history.length > 0 && !history.some((h) => h.ipAddress === ip),
    countryChanged,
    impossibleTravel,
    keystrokeAnomaly,
    keystrokeColdStart,
    wasPasted: ctx.pasted === true,
    recentLogins,
    loginCountIsAnomalous: recentLogins > 3,
    unusualHour: !isUsualHour(),
    location,
  };
}
