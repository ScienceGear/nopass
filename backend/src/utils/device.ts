/**
 * Device presentation helpers  turn a raw user-agent string into a friendly
 * device label and mask an IP address for display.
 */

export function friendlyDeviceName(ua: string): string {
  if (!ua || ua === "unknown device") return "Unknown device";

  let browser = "Browser";
  let os = "Unknown OS";

  const osMatch =
    ua.match(/Windows NT 10\.0/) ? "Windows 10/11"
    : ua.match(/Windows NT 6\.3/) ? "Windows 8.1"
    : ua.match(/Windows NT 6\.1/) ? "Windows 7"
    : ua.match(/Mac OS X/) ? "macOS"
    : ua.match(/iPhone/) ? "iOS (iPhone)"
    : ua.match(/iPad/) ? "iOS (iPad)"
    : ua.match(/Android/) ? "Android"
    : ua.match(/Linux/) ? "Linux"
    : null;
  if (osMatch) os = osMatch;

  const browserMatch =
    ua.includes("Edg/") || ua.includes("Edge/") ? "Edge"
    : ua.includes("OPR/") || ua.includes("Opera/") ? "Opera"
    : ua.includes("Brave/") ? "Brave"
    : ua.includes("Vivaldi/") ? "Vivaldi"
    : /Chrome\//.test(ua) && !/CriOS\//.test(ua) ? "Chrome"
    : ua.includes("CriOS/") ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox"
    : ua.includes("Safari/") ? "Safari"
    : null;
  if (browserMatch) browser = browserMatch;

  const mobile = /Mobile/.test(ua) || /iPhone/.test(ua) || /Android/.test(ua) ? " · Mobile" : "";

  if (ua.includes("NovaBank")) return `NovaBank App${mobile}`;
  return `${browser} on ${os}${mobile}`;
}

/** Show a stable prefix of an IPv4/IPv6 address, hiding the last octet(s). */
export function maskIp(ip: string | null | undefined): string {
  const raw = ip?.trim();
  if (!raw || raw === "unknown") return "Unknown IP";

  if (raw.includes(":")) {
    const v6 = raw.split(":");
    // IPv4-mapped (::ffff:1.2.3.4) or full IPv6
    if (v6.length >= 2 && /^\d+$/.test(v6[v6.length - 1])) {
      return `${v6.slice(0, 4).join(":")}:••••`;
    }
    return `${v6.slice(0, 3).join(":")}:••••`;
  }

  const parts = raw.split(".");
  if (parts.length !== 4) return raw;
  return `${parts[0]}.${parts[1]}.•••.•••`;
}
