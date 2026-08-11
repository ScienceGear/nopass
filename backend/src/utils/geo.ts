import axios from "axios";
import { isPrivateIp } from "./clientIp.js";
import { logger } from "./logger.js";

export interface GeoInfo {
  city?: string;
  country?: string;
  countryCode?: string;
  lat?: number;
  lon?: number;
}

const geoCache = new Map<string, GeoInfo | null>();

/** Great-circle distance between two points in kilometres. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Free-tier geolocation. Never throws — returns null on any failure or private IP. */
export async function geoFromIp(ip: string): Promise<GeoInfo | null> {
  if (isPrivateIp(ip)) return null;
  try {
    const { data } = await axios.get<{
      city?: string;
      country_name?: string;
      country_code?: string;
      latitude?: number;
      longitude?: number;
      error?: boolean;
    }>(`https://ipapi.co/${ip}/json/`, { timeout: 2500 });
    if (data && "error" in data) return null;
    return {
      city: data.city,
      country: data.country_name,
      countryCode: data.country_code,
      lat: data.latitude,
      lon: data.longitude,
    };
  } catch {
    logger.warn("geo lookup failed for ip", ip);
    return null;
  }
}

/** Cached wrapper — avoids repeated lookups for the same IP in a single request batch. */
export async function geoFromIpCached(ip: string): Promise<GeoInfo | null> {
  if (geoCache.has(ip)) return geoCache.get(ip)!;
  const result = await geoFromIp(ip);
  geoCache.set(ip, result);
  return result;
}

export const formatLocation = (geo: GeoInfo | null): string | null =>
  geo && (geo.city || geo.country)
    ? `${geo.city ?? ""}${geo.city && geo.country ? ", " : ""}${geo.country ?? ""}` || null
    : null;

export function locationPartsFromIp(
  ip: string,
  geo: GeoInfo | null,
): { city: string; country: string; location: string | null } {
  if (geo?.city || geo?.country) {
    const city = geo.city ?? "Unknown";
    const country = geo.country ?? "";
    return {
      city,
      country,
      location: formatLocation(geo),
    };
  }
  if (isPrivateIp(ip)) {
    return { city: "Local network", country: "", location: "Local network" };
  }
  return { city: "Unknown", country: "", location: null };
}
