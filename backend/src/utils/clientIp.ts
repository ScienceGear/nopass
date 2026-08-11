import type { Request } from "express";

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]?.trim() || undefined;
  return value?.trim() || undefined;
}

/** Strip IPv4-mapped IPv6 prefix (`::ffff:192.0.2.1` → `192.0.2.1`). */
export function normalizeIp(raw: string): string {
  const ip = raw.trim();
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  if (ip === "::1") return "127.0.0.1";
  return ip;
}

/** True for loopback, RFC1918, link-local, and other non-routable addresses. */
export function isPrivateIp(ip: string): boolean {
  if (!ip || ip === "unknown") return true;
  const normalized = normalizeIp(ip);

  if (normalized === "127.0.0.1" || normalized.startsWith("127.")) return true;
  if (normalized.startsWith("10.")) return true;
  if (normalized.startsWith("192.168.")) return true;
  if (normalized.startsWith("169.254.")) return true;
  if (normalized.startsWith("172.")) {
    const second = Number.parseInt(normalized.split(".")[1] ?? "0", 10);
    if (second >= 16 && second <= 31) return true;
  }
  if (normalized.includes(":")) {
    const lower = normalized.toLowerCase();
    if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  }
  return false;
}

/**
 * Best-effort client IP from reverse-proxy headers, then Express `req.ip`.
 * Never fabricates a public address — returns `"unknown"` when nothing is available.
 */
export function getClientIp(req: Request): string {
  const cf = headerValue(req.headers["cf-connecting-ip"]);
  if (cf) return normalizeIp(cf);

  const real = headerValue(req.headers["x-real-ip"]);
  if (real) return normalizeIp(real);

  const forwarded = headerValue(req.headers["x-forwarded-for"]);
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return normalizeIp(first);
  }

  const ip = req.ip ?? req.socket.remoteAddress ?? "";
  return ip ? normalizeIp(ip) : "unknown";
}

/** Mask an IP for display (last octet / segment hidden). */
export function maskIp(ip: string): string {
  if (!ip || ip === "unknown") return "Unknown IP";

  const normalized = normalizeIp(ip);
  if (normalized.includes(":")) {
    const parts = normalized.split(":");
    if (parts.length > 1) {
      parts[parts.length - 1] = "••••";
      return parts.join(":");
    }
    return "••••••••";
  }

  const octets = normalized.split(".");
  if (octets.length === 4) {
    return `${octets[0]}.${octets[1]}.•••.${octets[3]}`;
  }

  return "••••••••";
}
