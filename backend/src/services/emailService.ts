import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { randomInt } from "node:crypto";
import { prisma } from "../config/db.js";
import { env, isProduction } from "../config/env.js";
import { hashRecoveryCode, verifyPassword } from "../utils/crypto.js";
import { logger } from "../utils/logger.js";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.EMAIL_HOST,
      port: env.EMAIL_PORT,
      secure: env.EMAIL_PORT === 465,
      auth: env.EMAIL_USER ? { user: env.EMAIL_USER, pass: env.EMAIL_PASS } : undefined,
    });
  }
  return transporter;
}

export function generateOtp(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) code += String(randomInt(0, 10));
  return code;
}

/** Create + deliver an OTP. Returns the plaintext (for dev surfacing only). */
export async function sendOtp(email: string, purpose: "login_step_up" | "recovery" | "transfer_approval"): Promise<string> {
  const code = generateOtp();
  const codeHash = await hashRecoveryCode(code);

  await prisma.otpCode.create({
    data: {
      userId: (await prisma.user.findUnique({ where: { email } }))?.id ?? "",
      code: codeHash,
      purpose,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  try {
    await getTransporter().sendMail({
      from: `"NovaBank Security" <${env.EMAIL_USER || "security@novabank.local"}>`,
      to: email,
      subject: `Your NovaBank ${purpose === "login_step_up" ? "login" : "recovery"} code`,
      text: `Your NovaBank verification code is ${code}. It expires in 10 minutes. Never share it.`,
      html: `<p>Your NovaBank verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. Never share it.</p>`,
    });
  } catch (err) {
    // Ethereal is a test inbox; email failures must not brick the flow in dev.
    logger.warn("Email send failed", err instanceof Error ? err.message : String(err));
  }

  if (!isProduction) logger.info(`[dev] OTP for ${email}: ${code}`);
  return code;
}

export async function verifyOtp(email: string, code: string, purpose: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return false;

  const records = await prisma.otpCode.findMany({
    where: { userId: user.id, purpose, used: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  for (const rec of records) {
    if (await verifyPassword(rec.code, code)) {
      await prisma.otpCode.update({ where: { id: rec.id }, data: { used: true } });
      return true;
    }
  }
  return false;
}

export async function sendAlertEmail(email: string, subject: string, body: string) {
  try {
    await getTransporter().sendMail({
      from: `"NovaBank Security" <${env.EMAIL_USER || "security@novabank.local"}>`,
      to: email,
      subject,
      text: body,
    });
  } catch (err) {
    logger.warn("Alert email send failed", err instanceof Error ? err.message : String(err));
  }
}
