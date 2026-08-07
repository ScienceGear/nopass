import axios from "axios";
import { logger } from "./logger.js";

export interface GeoInfo {
  city?: string;
  country?: string;
  countryCode?: string;
  lat?: number;
  lon?: number;
}

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

/** Free-tier geolocation. Never throws  returns null on any failure. */
export async function geoFromIp(ip: string): Promise<GeoInfo | null> {
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
    return { city: "Localhost", country: "Local", countryCode: "LOCAL" };
  }
  try {
    const { data } = await axios.get<{ city?: string; country_name?: string; country_code?: string; latitude?: number; longitude?: number }>(
      `https://ipapi.co/${ip}/json/`,
      { timeout: 2500 },
    );
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

export const formatLocation = (geo: GeoInfo | null): string | null =>
  geo && (geo.city || geo.country) ? `${geo.city ?? ""}${geo.city && geo.country ? ", " : ""}${geo.country ?? ""}` || null : null;
