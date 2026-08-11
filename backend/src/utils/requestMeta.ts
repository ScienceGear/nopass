import type { Request } from "express";

/** Standard browser User-Agent for activity display — not used for security decisions. */
export function deviceInfoFromRequest(req: Request): string {
  const ua = req.headers["user-agent"];
  if (typeof ua === "string" && ua.trim()) return ua.trim().slice(0, 512);
  return "Unknown device";
}
