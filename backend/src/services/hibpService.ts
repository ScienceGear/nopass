import { createHash } from "node:crypto";
import axios from "axios";
import { logger } from "../utils/logger.js";

/**
 * Have-I-Been-Pwned k-anonymity breach check.
 * Sends only the first 5 hex chars of the SHA-1 hash; the suffix is matched
 * client-side. Never throws — returns null when the lookup fails.
 */
export async function checkEmailBreach(email: string): Promise<number | null> {
  try {
    const sha1 = createHash("sha1").update(email.trim().toLowerCase()).digest("hex").toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const { data } = await axios.get<string>(`https://api.pwnedpasswords.com/range/${prefix}`, {
      timeout: 4000,
      responseType: "text",
    });

    let count = 0;
    for (const line of data.split("\n")) {
      const [suf, cnt] = line.split(":");
      if (suf?.trim() === suffix) {
        count = parseInt(cnt ?? "0", 10) || 0;
        break;
      }
    }
    return count;
  } catch {
    logger.warn("HIBP lookup failed for", email);
    return null;
  }
}
