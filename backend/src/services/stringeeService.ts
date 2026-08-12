import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/** Check if Stringee credentials are configured in backend environment. */
export function isStringeeConfigured(): boolean {
  return Boolean(
    env.STRINGEE_API_KEY_SID &&
      env.STRINGEE_API_KEY_SECRET &&
      env.STRINGEE_NUMBER,
  );
}

/** Generate a 1-hour HMAC-SHA256 JWT for Stringee REST API authentication. */
export function generateStringeeJwt(
  sid: string = env.STRINGEE_API_KEY_SID,
  secret: string = env.STRINGEE_API_KEY_SECRET,
): string {
  if (!sid || !secret) {
    throw new Error("Stringee API Key SID and Secret must be provided.");
  }
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600; // 1 hour expiration
  const payload = {
    jti: `${sid}-${now}`,
    iss: sid,
    exp,
    rest_api: true,
  };
  return jwt.sign(payload, secret, {
    algorithm: "HS256",
    header: {
      typ: "JWT",
      alg: "HS256",
      cty: "stringee-api;v=1",
    },
  });
}

/**
 * Make a Voice OTP Call-Out via Stringee Text-To-Speech API.
 * Called automatically when SMS delivery is unavailable or fails.
 */
export async function sendStringeeVoiceOtp(
  phone: string,
  code: string,
): Promise<boolean> {
  if (!isStringeeConfigured()) {
    logger.info(`[stringee:dev] Voice OTP callout for ${phone} with code ${code}`);
    return false;
  }

  try {
    const token = generateStringeeJwt();
    // Format OTP as spaced digits for clear text-to-speech reading
    const spacedCode = code.split("").join(" ");
    const ttsText = `Hello, your NovaBank verification code is ${spacedCode}. I repeat, your code is ${spacedCode}. Thank you.`;

    const cleanPhone = phone.startsWith("+") ? phone.slice(1) : phone;
    const body = {
      from: env.STRINGEE_NUMBER,
      to: cleanPhone,
      actions: [
        {
          action: "talk",
          text: ttsText,
          speed: 0,
          bargeIn: false,
        },
      ],
    };

    const res = await fetch("https://api.stringee.com/v1/call/callout", {
      method: "POST",
      headers: {
        "X-STRINGEE-AUTH": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      logger.warn(`[stringee] Voice callout failed (${res.status}): ${errText}`);
      return false;
    }

    logger.info(`[stringee] Voice OTP callout triggered for ${phone}`);
    return true;
  } catch (err) {
    logger.warn(
      "[stringee] Voice callout error",
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }
}
