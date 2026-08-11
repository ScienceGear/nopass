export type DevicePlatform = "desktop" | "mobile-android" | "mobile-ios" | "mobile";

export type DeviceIconKind =
  | "windows-chrome"
  | "windows-edge"
  | "windows-firefox"
  | "windows"
  | "android"
  | "ios"
  | "macos"
  | "linux"
  | "firefox"
  | "chrome"
  | "safari"
  | "unknown";

export interface ParsedDevice {
  label: string;
  platform: DevicePlatform;
}

function detectBrowser(ua: string): string {
  if (ua.includes("edg/")) return "Edge";
  if (ua.includes("opr/") || ua.includes("opera")) return "Opera";
  if (ua.includes("firefox/")) return "Firefox";
  if (ua.includes("crios/")) return "Chrome";
  if (ua.includes("chrome/") && !ua.includes("edg/")) return "Chrome";
  if (ua.includes("safari/") && !ua.includes("chrome/") && !ua.includes("crios/")) return "Safari";
  return "Browser";
}

function parseFriendlyLabel(raw: string): ParsedDevice | null {
  const lower = raw.toLowerCase();
  const browser =
    lower.includes("chrome")
      ? "Chrome"
      : lower.includes("safari")
        ? "Safari"
        : lower.includes("firefox")
          ? "Firefox"
          : lower.includes("edge")
            ? "Edge"
            : "Browser";

  if (/iphone|android|mobile|pixel|galaxy/.test(lower)) {
    if (/android/.test(lower)) {
      return { label: `${browser} on Android · Mobile`, platform: "mobile-android" };
    }
    return { label: `${browser} on iOS · Mobile`, platform: "mobile-ios" };
  }

  if (/ipad/.test(lower)) {
    return { label: `${browser} on iPad · Mobile`, platform: "mobile-ios" };
  }

  if (/mac|macbook|imac/.test(lower)) {
    return { label: `${browser} on macOS`, platform: "desktop" };
  }

  if (/windows|surface|pc/.test(lower)) {
    return { label: `${browser} on Windows 10/11`, platform: "desktop" };
  }

  if (/linux/.test(lower)) {
    return { label: `${browser} on Linux`, platform: "desktop" };
  }

  return null;
}

/** Parse raw user-agent or pre-formatted device strings for display. */
export function parseDeviceInfo(raw: string): ParsedDevice {
  if (!raw || raw === "unknown device") {
    return { label: "Unknown device", platform: "mobile" };
  }

  if (!raw.includes("Mozilla/")) {
    const friendly = parseFriendlyLabel(raw);
    if (friendly) return friendly;
  }

  const ua = raw.toLowerCase();
  const browser = detectBrowser(ua);
  const isAndroid = ua.includes("android");
  const isIOS =
    /iphone|ipod/.test(ua) || (ua.includes("macintosh") && ua.includes("mobile")) || ua.includes("ipad");

  if (isAndroid) {
    return { label: `${browser} on Android · Mobile`, platform: "mobile-android" };
  }
  if (isIOS) {
    return { label: `${browser} on iOS · Mobile`, platform: "mobile-ios" };
  }
  if (ua.includes("windows")) {
    return { label: `${browser} on Windows 10/11`, platform: "desktop" };
  }
  if (ua.includes("macintosh") || ua.includes("mac os")) {
    return { label: `${browser} on macOS`, platform: "desktop" };
  }
  if (ua.includes("linux")) {
    return { label: `${browser} on Linux`, platform: "desktop" };
  }

  return { label: raw.length > 64 ? `${browser} · Web` : raw, platform: "mobile" };
}

/** Map a stored device string to a recognizable platform/browser icon. */
export function resolveDeviceIconKind(raw: string): DeviceIconKind {
  if (!raw || raw === "unknown device") return "unknown";

  if (!raw.includes("Mozilla/")) {
    const friendly = parseFriendlyLabel(raw);
    if (friendly) {
      const label = friendly.label.toLowerCase();
      if (friendly.platform === "mobile-android") return "android";
      if (friendly.platform === "mobile-ios") return "ios";
      if (label.includes("windows")) {
        if (label.includes("chrome")) return "windows-chrome";
        if (label.includes("edge")) return "windows-edge";
        if (label.includes("firefox")) return "windows-firefox";
        return "windows";
      }
      if (label.includes("linux")) return "linux";
      if (label.includes("macos") || label.includes("mac")) return label.includes("safari") ? "safari" : "macos";
      if (label.includes("firefox")) return "firefox";
      if (label.includes("chrome")) return "chrome";
      if (label.includes("safari")) return "safari";
    }
  }

  const ua = raw.toLowerCase();
  const browser = detectBrowser(ua);

  if (ua.includes("android")) return "android";
  if (/iphone|ipod/.test(ua) || (ua.includes("macintosh") && ua.includes("mobile")) || ua.includes("ipad")) {
    return "ios";
  }
  if (ua.includes("windows")) {
    if (browser === "Edge") return "windows-edge";
    if (browser === "Firefox") return "windows-firefox";
    if (browser === "Chrome") return "windows-chrome";
    return "windows";
  }
  if (ua.includes("linux")) return "linux";
  if (ua.includes("macintosh") || ua.includes("mac os") || ua.includes("macbook")) {
    return browser === "Safari" ? "safari" : "macos";
  }
  if (browser === "Firefox") return "firefox";
  if (browser === "Chrome") return "chrome";
  if (browser === "Safari") return "safari";

  return "unknown";
}

function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  if (trimmed.startsWith("::ffff:")) return trimmed.slice(7);
  if (trimmed === "::1") return "127.0.0.1";
  return trimmed;
}

/** True for loopback, RFC1918, and other non-routable addresses. */
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

/** Activity IP display — full address in detail view; private IPs unmasked everywhere. */
export function formatActivityIp(
  ip: string | null | undefined,
  masked: string,
  view: "list" | "detail",
): string {
  if (!ip || ip === "unknown") return masked || "Unknown IP";
  const normalized = normalizeIp(ip);
  if (view === "detail" || isPrivateIp(normalized)) return normalized;
  return masked || normalized;
}

export function formatLocation(city: string, country: string): string {
  if (city === "Local network") return "Local network";
  if (city && country) return `${city}, ${country}`;
  if (city && city !== "Unknown") return city;
  if (country) return country;
  return "Unknown location";
}
