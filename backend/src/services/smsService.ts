import { prisma } from "../config/db.js";
import { env, isProduction } from "../config/env.js";
import { getRedis } from "../config/redis.js";
import { hashRecoveryCode, verifyPassword } from "../utils/crypto.js";
import { generateOtp } from "./emailService.js";
import { logger } from "../utils/logger.js";
import { sendStringeeVoiceOtp, isStringeeConfigured } from "./stringeeService.js";

export type PhoneOtpPurpose = "signup" | "phone_change" | "verify" | "login_step_up" | "recover";

const SMS_CONFIGURED = Boolean(env.TEXTBEE_API_KEY && env.TEXTBEE_DEVICE_ID);
const PHONE_OTP_TTL_MS = 10 * 60 * 1000;
const SMS_DAILY_LIMIT = 6;

function maskPhone(phone: string): string {
  if (phone.length <= 4) return phone;
  return `${phone.slice(0, 3)}•••••${phone.slice(-2)}`;
}

/** Send an SMS via the TextBee gateway; falls back to Stringee Voice OTP if unconfigured or failed. */
async function sendSms(phone: string, message: string, code: string): Promise<boolean> {
  if (!SMS_CONFIGURED) {
    logger.info(`[sms:dev] → ${maskPhone(phone)}\n${message}`);
    // If Stringee Voice OTP is configured, send Voice OTP callout as fallback
    if (isStringeeConfigured()) {
      return sendStringeeVoiceOtp(phone, code);
    }
    return true;
  }

  try {
    const res = await fetch(
      `${env.TEXTBEE_BASE_URL}/gateway/devices/${env.TEXTBEE_DEVICE_ID}/send-sms`,
      {
        method: "POST",
        headers: {
          "x-api-key": env.TEXTBEE_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ recipients: [phone], message }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      logger.warn(`[sms] TextBee send failed (${res.status}): ${body}. Triggering Stringee Voice OTP fallback...`);
      if (isStringeeConfigured()) {
        return sendStringeeVoiceOtp(phone, code);
      }
      return false;
    }

    logger.info(`[sms] TextBee sent → ${maskPhone(phone)}`);
    return true;
  } catch (err) {
    logger.warn("SMS send failed", err instanceof Error ? err.message : String(err));
    if (isStringeeConfigured()) {
      return sendStringeeVoiceOtp(phone, code);
    }
    return false;
  }
}

/**
 * Enforce the 6 SMS/day quota per identity (phone number, or user id when
 * available). Returns false when the quota is exhausted so the caller can 429.
 */
export async function consumeSmsQuota(key: string): Promise<boolean> {
  const redis = getRedis();
  const today = new Date().toISOString().slice(0, 10);
  const redisKey = `sms:quota:${today}:${key}`;
  const count = await redis.incr(redisKey);
  if (count === 1) await redis.expire(redisKey, 48 * 60 * 60);
  return count <= SMS_DAILY_LIMIT;
}

/** How many SMS this identity has left today (0..6). */
export async function smsRemaining(key: string): Promise<number> {
  try {
    const redis = getRedis();
    const today = new Date().toISOString().slice(0, 10);
    const count = Number((await redis.get(`sms:quota:${today}:${key}`)) ?? 0);
    return Math.max(0, SMS_DAILY_LIMIT - count);
  } catch {
    return SMS_DAILY_LIMIT;
  }
}

/**
 * Generate, persist (hashed) and send a phone OTP (SMS with automatic Stringee Voice OTP fallback).
 */
export async function sendPhoneOtp(
  phone: string,
  purpose: PhoneOtpPurpose,
  quotaKey: string,
): Promise<string | null> {
  const withinQuota = await consumeSmsQuota(quotaKey);
  if (!withinQuota) return null;

  const code = generateOtp();
  const codeHash = await hashRecoveryCode(code);
  await prisma.phoneOtp.create({
    data: { phone, codeHash, purpose, expiresAt: new Date(Date.now() + PHONE_OTP_TTL_MS) },
  });

  await sendSms(
    phone,
    `NovaBank: your verification code is ${code}. It expires in 10 minutes. Never share this code.`,
    code,
  );

  if (!isProduction) logger.info(`[dev] Phone OTP for ${maskPhone(phone)}: ${code}`);
  return code;
}

/** Verify a phone OTP for the given purpose (single-use). */
export async function verifyPhoneOtp(
  phone: string,
  code: string,
  purpose: PhoneOtpPurpose,
): Promise<boolean> {
  const records = await prisma.phoneOtp.findMany({
    where: { phone, purpose, used: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  for (const rec of records) {
    if (await verifyPassword(rec.codeHash, code)) {
      await prisma.phoneOtp.update({ where: { id: rec.id }, data: { used: true } });
      return true;
    }
  }
  return false;
}
