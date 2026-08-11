import type { LucideIcon } from "lucide-react";
import { Laptop, Smartphone } from "lucide-react";

export type DevicePlatform = "desktop" | "mobile-android" | "mobile-ios" | "mobile";

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

export const devicePlatformIcon: Record<DevicePlatform, LucideIcon> = {
  desktop: Laptop,
  "mobile-android": Smartphone,
  "mobile-ios": Smartphone,
  mobile: Smartphone,
};

export function formatLocation(city: string, country: string): string {
  if (city && country) return `${city}, ${country}`;
  return city || country || "Unknown location";
}
