/**
 * Device fingerprinting. Combines stable browser/platform signals into a single
 * SHA-256 hash. Used to recognise trusted devices without storing anything
 * sensitive. Best-effort: falls back to a random id if anything fails.
 */

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const CACHE_KEY = "novabank.fingerprint";

export async function getDeviceFingerprint(): Promise<string> {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) return cached;

    const parts = [
      navigator.userAgent,
      navigator.language ?? "",
      `${screen.width}x${screen.height}`,
      String(screen.colorDepth ?? ""),
      Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
      String(navigator.hardwareConcurrency ?? ""),
      String(navigator.platform ?? ""),
    ];
    const fp = await sha256(parts.join("|"));
    localStorage.setItem(CACHE_KEY, fp);
    return fp;
  } catch {
    return `fp_${Math.random().toString(36).slice(2, 12)}`;
  }
}

/** Human-readable device descriptor (raw UA is fine for the activity feed). */
export function getDeviceInfo(): string {
  return typeof navigator !== "undefined" ? navigator.userAgent : "unknown device";
}
